import re
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi import Request
from pydantic import BaseModel, validator

DB_PATH = Path("snapshots.db")

app = FastAPI(title="NBA PPP Edge Logger")
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


class SnapshotIn(BaseModel):
    date: str
    team_a: str
    team_b: str
    score_a: int
    score_b: int
    quarter: str
    clock: str
    fga_a: int
    fta_a: int
    tov_a: int
    fga_b: int
    fta_b: int
    tov_b: int
    live_odds_a: int
    live_odds_b: int
    pregame_odds_a: Optional[int] = None
    pregame_odds_b: Optional[int] = None
    close_odds_pick: Optional[int] = None
    pick_side: Optional[Literal["A", "B"]] = None
    result: Optional[Literal["win", "loss", "push", ""]] = ""
    notes: Optional[str] = ""
    pace_threshold: float = 30.0

    @validator("date")
    @classmethod
    def valid_date(cls, v: str) -> str:
        try:
            datetime.strptime(v, "%Y-%m-%d")
        except ValueError as exc:
            raise ValueError("date must be YYYY-MM-DD") from exc
        return v

    @validator("clock")
    @classmethod
    def valid_clock(cls, v: str) -> str:
        if not re.fullmatch(r"\d{1,2}:\d{2}", v):
            raise ValueError("clock must be M:SS or MM:SS")
        return v

    @validator("quarter")
    @classmethod
    def valid_quarter(cls, v: str) -> str:
        if not re.fullmatch(r"(?:[1-4]|OT\d*)", v.upper()):
            raise ValueError("quarter must be 1-4 or OT")
        return v.upper()


def american_to_prob(odds: Optional[int]) -> Optional[float]:
    if odds is None:
        return None
    if odds == 0:
        return None
    if odds > 0:
        return 100 / (odds + 100)
    return (-odds) / ((-odds) + 100)


def compute_metrics(snapshot: SnapshotIn) -> dict:
    poss_a = snapshot.fga_a + 0.44 * snapshot.fta_a + snapshot.tov_a
    poss_b = snapshot.fga_b + 0.44 * snapshot.fta_b + snapshot.tov_b
    if poss_a <= 0 or poss_b <= 0:
        raise HTTPException(status_code=400, detail="Possessions must be > 0 for both teams")

    ppp_a = snapshot.score_a / poss_a
    ppp_b = snapshot.score_b / poss_b
    edge_team = "A" if ppp_a >= ppp_b else "B"
    losing_ppp = min(ppp_a, ppp_b)
    edge_pct = abs(ppp_a - ppp_b) / losing_ppp if losing_ppp > 0 else 0
    avg_poss = (poss_a + poss_b) / 2
    pace_ok = avg_poss >= snapshot.pace_threshold
    verdict = "PLAY" if edge_pct >= 0.02 and pace_ok else "PASS"

    live_prob_a = american_to_prob(snapshot.live_odds_a)
    live_prob_b = american_to_prob(snapshot.live_odds_b)

    p_pregame = None
    p_close = None
    clv = None
    clv_achieved = None

    if snapshot.pick_side and snapshot.close_odds_pick is not None:
        pregame_for_pick = snapshot.pregame_odds_a if snapshot.pick_side == "A" else snapshot.pregame_odds_b
        if pregame_for_pick is not None:
            p_pregame = american_to_prob(pregame_for_pick)
            p_close = american_to_prob(snapshot.close_odds_pick)
            if p_pregame is not None and p_close is not None:
                clv = p_close - p_pregame
                clv_achieved = clv > 0

    return {
        "poss_a": poss_a,
        "poss_b": poss_b,
        "ppp_a": ppp_a,
        "ppp_b": ppp_b,
        "edge_team": edge_team,
        "edge_pct": edge_pct,
        "avg_poss": avg_poss,
        "pace_ok": pace_ok,
        "verdict": verdict,
        "live_prob_a": live_prob_a,
        "live_prob_b": live_prob_b,
        "p_pregame": p_pregame,
        "p_close": p_close,
        "clv": clv,
        "clv_achieved": clv_achieved,
    }


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_conn()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            team_a TEXT NOT NULL,
            team_b TEXT NOT NULL,
            score_a INTEGER NOT NULL,
            score_b INTEGER NOT NULL,
            quarter TEXT NOT NULL,
            clock TEXT NOT NULL,
            fga_a INTEGER NOT NULL,
            fta_a INTEGER NOT NULL,
            tov_a INTEGER NOT NULL,
            fga_b INTEGER NOT NULL,
            fta_b INTEGER NOT NULL,
            tov_b INTEGER NOT NULL,
            live_odds_a INTEGER NOT NULL,
            live_odds_b INTEGER NOT NULL,
            pregame_odds_a INTEGER,
            pregame_odds_b INTEGER,
            close_odds_pick INTEGER,
            pick_side TEXT,
            result TEXT,
            notes TEXT,
            pace_threshold REAL NOT NULL,
            poss_a REAL NOT NULL,
            poss_b REAL NOT NULL,
            ppp_a REAL NOT NULL,
            ppp_b REAL NOT NULL,
            edge_team TEXT NOT NULL,
            edge_pct REAL NOT NULL,
            avg_poss REAL NOT NULL,
            pace_ok INTEGER NOT NULL,
            verdict TEXT NOT NULL,
            live_prob_a REAL,
            live_prob_b REAL,
            p_pregame REAL,
            p_close REAL,
            clv REAL,
            clv_achieved INTEGER,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


init_db()


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/snapshots")
def list_snapshots():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM snapshots ORDER BY id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/snapshots")
def create_snapshot(payload: SnapshotIn):
    metrics = compute_metrics(payload)
    now = datetime.now().isoformat()

    record = payload.dict()
    record.update(metrics)
    record["created_at"] = now
    record["pace_ok"] = 1 if metrics["pace_ok"] else 0
    record["clv_achieved"] = None if metrics["clv_achieved"] is None else (1 if metrics["clv_achieved"] else 0)

    columns = ", ".join(record.keys())
    placeholders = ", ".join("?" for _ in record)

    conn = get_conn()
    cur = conn.execute(f"INSERT INTO snapshots ({columns}) VALUES ({placeholders})", list(record.values()))
    conn.commit()
    row = conn.execute("SELECT * FROM snapshots WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return dict(row)


@app.delete("/api/snapshots/{snapshot_id}")
def delete_snapshot(snapshot_id: int):
    conn = get_conn()
    cur = conn.execute("DELETE FROM snapshots WHERE id = ?", (snapshot_id,))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return {"ok": True}
