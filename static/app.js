const form = document.getElementById("snapshotForm");
const errorBox = document.getElementById("errorBox");
const calcOut = document.getElementById("calcOut");
const terminalInput = document.getElementById("terminalInput");
const tableBody = document.querySelector("#snapshotsTable tbody");

const template = "TEAM_A TEAM_B | SCORE_A-SCORE_B | Q# M:SS | FGA x-y | FTA x-y | TOV x-y | ODDS +### -###";
const liveFieldNames = [
  "date", "team_a", "team_b", "score_a", "score_b", "quarter", "clock",
  "fga_a", "fta_a", "tov_a", "fga_b", "fta_b", "tov_b", "live_odds_a", "live_odds_b"
];

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function clearError() {
  errorBox.textContent = "";
  errorBox.classList.add("hidden");
}

function num(name) {
  const v = form.elements[name].value;
  return v === "" ? null : Number(v);
}

function americanToProb(odds) {
  if (odds == null || odds === 0 || Number.isNaN(odds)) return null;
  return odds > 0 ? 100 / (odds + 100) : (-odds) / ((-odds) + 100);
}

function computeClient() {
  const data = Object.fromEntries(new FormData(form).entries());
  const required = ["score_a","score_b","fga_a","fta_a","tov_a","fga_b","fta_b","tov_b","live_odds_a","live_odds_b"];
  if (required.some((k) => form.elements[k].value === "")) {
    calcOut.innerHTML = "<dt>Status</dt><dd>Waiting for required fields...</dd>";
    return;
  }

  const scoreA = num("score_a"), scoreB = num("score_b");
  const fgaA = num("fga_a"), ftaA = num("fta_a"), tovA = num("tov_a");
  const fgaB = num("fga_b"), ftaB = num("fta_b"), tovB = num("tov_b");
  const paceThreshold = Number(form.elements["pace_threshold"].value || 30);

  const possA = fgaA + 0.44 * ftaA + tovA;
  const possB = fgaB + 0.44 * ftaB + tovB;
  if (possA <= 0 || possB <= 0) {
    calcOut.innerHTML = "<dt>Error</dt><dd>Possessions must be > 0 for both teams.</dd>";
    return;
  }

  const pppA = scoreA / possA;
  const pppB = scoreB / possB;
  const edgeTeam = pppA >= pppB ? "A" : "B";
  const edgePct = Math.abs(pppA - pppB) / Math.min(pppA, pppB);
  const avgPoss = (possA + possB) / 2;
  const paceOk = avgPoss >= paceThreshold;
  const verdict = edgePct >= 0.02 && paceOk ? "PLAY" : "PASS";

  const liveProbA = americanToProb(num("live_odds_a"));
  const liveProbB = americanToProb(num("live_odds_b"));

  calcOut.innerHTML = `
    <dt>poss_a</dt><dd>${possA.toFixed(2)}</dd>
    <dt>poss_b</dt><dd>${possB.toFixed(2)}</dd>
    <dt>ppp_a</dt><dd>${pppA.toFixed(4)}</dd>
    <dt>ppp_b</dt><dd>${pppB.toFixed(4)}</dd>
    <dt>edge_team</dt><dd>${edgeTeam}</dd>
    <dt>edge_pct</dt><dd>${(edgePct * 100).toFixed(2)}%</dd>
    <dt>avg_poss</dt><dd>${avgPoss.toFixed(2)}</dd>
    <dt>pace_ok</dt><dd>${paceOk}</dd>
    <dt>verdict</dt><dd><strong>${verdict}</strong></dd>
    <dt>implied_prob_a</dt><dd>${liveProbA ? (liveProbA * 100).toFixed(2) + "%" : "-"}</dd>
    <dt>implied_prob_b</dt><dd>${liveProbB ? (liveProbB * 100).toFixed(2) + "%" : "-"}</dd>
  `;
}

function formPayload() {
  const data = Object.fromEntries(new FormData(form).entries());
  for (const [k, v] of Object.entries(data)) {
    if (["notes", "quarter", "team_a", "team_b", "date", "clock", "result", "pick_side"].includes(k)) continue;
    data[k] = v === "" ? null : Number(v);
  }
  if (data.notes === "") data.notes = "";
  if (data.result === "") data.result = "";
  if (data.pick_side === "") data.pick_side = null;
  return data;
}

function parseTerminal(text) {
  const pattern = /^(.+?)\s*\|\s*(\d+)-(\d+)\s*\|\s*Q(\d+|OT\d*)\s+(\d{1,2}:\d{2})\s*\|\s*FGA\s+(\d+)-(\d+)\s*\|\s*FTA\s+(\d+)-(\d+)\s*\|\s*TOV\s+(\d+)-(\d+)\s*\|\s*ODDS\s+([+-]?\d+)\s+([+-]?\d+)\s*$/i;
  const m = text.trim().match(pattern);
  if (!m) {
    throw new Error("Terminal input must include all canonical segments: teams | score | quarter/clock | FGA | FTA | TOV | ODDS.");
  }

  const teams = m[1].trim().split(/\s+/);
  if (teams.length !== 2) {
    throw new Error("Teams segment must be exactly: TEAM_A TEAM_B");
  }

  return {
    team_a: teams[0],
    team_b: teams[1],
    score_a: Number(m[2]),
    score_b: Number(m[3]),
    quarter: String(m[4]).toUpperCase(),
    clock: m[5],
    fga_a: Number(m[6]),
    fga_b: Number(m[7]),
    fta_a: Number(m[8]),
    fta_b: Number(m[9]),
    tov_a: Number(m[10]),
    tov_b: Number(m[11]),
    live_odds_a: Number(m[12]),
    live_odds_b: Number(m[13])
  };
}

function fillForm(values) {
  for (const [k, v] of Object.entries(values)) {
    if (form.elements[k]) form.elements[k].value = v;
  }
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? "").replaceAll("\"", "\"\"")}"`;
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => esc(row[h])).join(","));
  }
  return lines.join("\n");
}

async function loadSnapshots() {
  const res = await fetch("/api/snapshots");
  const rows = await res.json();
  tableBody.innerHTML = rows.map((r) => `
    <tr>
      <td>${r.id}</td>
      <td>${r.date}</td>
      <td>${r.team_a}-${r.team_b}</td>
      <td>${r.score_a}-${r.score_b}</td>
      <td>${String(r.quarter).startsWith("OT") ? r.quarter : "Q" + r.quarter} ${r.clock}</td>
      <td>${(r.edge_pct * 100).toFixed(2)}%</td>
      <td>${r.verdict}</td>
      <td>${r.clv == null ? "" : (r.clv * 100).toFixed(2) + "%"}</td>
      <td>${r.created_at}</td>
    </tr>`).join("");
  return rows;
}

document.getElementById("parseBtn").addEventListener("click", () => {
  clearError();
  try {
    const values = parseTerminal(terminalInput.value);
    fillForm(values);
    if (!form.elements["date"].value) {
      form.elements["date"].value = new Date().toISOString().slice(0, 10);
    }
    computeClient();
  } catch (e) {
    showError(e.message);
  }
});

document.getElementById("saveBtn").addEventListener("click", async () => {
  clearError();
  try {
    const payload = formPayload();
    const res = await fetch("/api/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to save snapshot");
    }
    await loadSnapshots();
  } catch (e) {
    showError(e.message);
  }
});

document.getElementById("resetTerminalBtn").addEventListener("click", () => {
  terminalInput.value = "";
  clearError();
});

document.getElementById("resetAllBtn").addEventListener("click", () => {
  terminalInput.value = "";
  for (const name of liveFieldNames) {
    if (form.elements[name]) form.elements[name].value = "";
  }
  computeClient();
  clearError();
});

document.getElementById("copyTemplateBtn").addEventListener("click", async () => {
  await navigator.clipboard.writeText(template);
});

document.getElementById("exportBtn").addEventListener("click", async () => {
  const rows = await loadSnapshots();
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "snapshots.csv";
  a.click();
  URL.revokeObjectURL(url);
});

form.addEventListener("input", computeClient);

if (!form.elements["date"].value) {
  form.elements["date"].value = new Date().toISOString().slice(0, 10);
}
computeClient();
loadSnapshots();
