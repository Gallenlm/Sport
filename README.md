# NBA Live PPP Edge Logger

Minimal one-page FastAPI app for logging NBA live “PPP edge” misprices with fast entry.

## What it does

- 1-page, 3-quadrant layout:
  - **Quad 1:** Source-of-truth form + saved log table
  - **Quad 2:** Read-only calculator output (updates instantly)
  - **Quad 3:** Terminal-style parser input + reset controls
- Stores snapshots in **SQLite** (`snapshots.db`, auto-created).
- Fully local manual data entry workflow.
- Parses canonical terminal format:
  - `TEAM_A TEAM_B | SCORE_A-SCORE_B | Q{quarter} M:SS | FGA x-y | FTA x-y | TOV x-y | ODDS +### -###`
- Saves both raw fields and computed fields.
- CSV export and template copy button.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install fastapi uvicorn jinja2
```

## Run

```bash
uvicorn main:app --reload
```

Then open: `http://127.0.0.1:8000`

## Routes

- `GET /` — app page
- `GET /api/snapshots` — all snapshots (latest first)
- `POST /api/snapshots` — insert snapshot
- `DELETE /api/snapshots/{id}` — delete snapshot (optional helper)

## Notes

- Parser behavior: this app requires all canonical terminal segments. If missing/invalid, it shows a clear error and **does not overwrite** current form values.
- Pace threshold defaults to `30` and can be changed per entry.
