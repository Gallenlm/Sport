const board = document.getElementById('gamesBoard');
const badge = document.getElementById('gamesBadge');

let oddsCache = [];
let trueShootingCache = {};

const normalizeName = (name) =>
  (name || '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();

const formatTime = (isoString) => {
  if (!isoString) return '--';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const formatOdds = (value) => {
  if (value === null || value === undefined) return '--';
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return '--';
  return numeric > 0 ? `+${numeric}` : `${numeric}`;
};

const mapOddsByTeams = (odds) => {
  const map = new Map();
  odds.forEach((game) => {
    const home = normalizeName(game.home_team);
    const away = normalizeName(game.away_team);
    const key = `${home}|${away}`;
    const bookmaker = game.bookmakers?.[0];
    const market = bookmaker?.markets?.find((item) => item.key === 'h2h');
    const outcomes = market?.outcomes || [];
    const oddsMap = new Map(
      outcomes.map((outcome) => [normalizeName(outcome.name), outcome.price])
    );

    map.set(key, {
      home: oddsMap.get(home) ?? null,
      away: oddsMap.get(away) ?? null
    });
  });

  return map;
};

const parseStatusLabel = (status) => {
  const lower = (status || '').toLowerCase();
  if (lower.includes('not started') || lower.includes('scheduled')) {
    return 'Pregame';
  }
  if (lower.includes('final') || lower.includes('finished')) {
    return 'Final';
  }
  return 'In Progress';
};

const renderTrueShootingPanel = (trueShooting) => {
  if (!trueShooting) {
    return '<div class="true-shooting"><h4>Click to calculate true shooting</h4></div>';
  }

  const updated = new Date(trueShooting.updatedAt);
  const updatedLabel = Number.isNaN(updated.getTime())
    ? '--'
    : updated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const rows = trueShooting.teams
    .map(
      (team) => `
      <div class="row">
        <span>${team.name}</span>
        <span>${(team.trueShooting * 100).toFixed(1)}%</span>
      </div>
    `
    )
    .join('');

  return `
    <div class="true-shooting">
      <h4>True Shooting (updated ${updatedLabel})</h4>
      ${rows}
    </div>
  `;
};

const renderBoard = (games) => {
  if (!games.length) {
    board.innerHTML = '<div class="empty">No NBA games found for today.</div>';
    badge.textContent = '0 games loaded';
    return;
  }

  const oddsMap = mapOddsByTeams(oddsCache);
  const cards = games
    .map((game) => {
      const homeKey = normalizeName(game.teams.home.name);
      const awayKey = normalizeName(game.teams.away.name);
      const lookupKey = `${homeKey}|${awayKey}`;
      const matchupOdds = oddsMap.get(lookupKey) || { home: null, away: null };
      const statusLabel = parseStatusLabel(game.status);
      const homeScore = game.teams.home.score ?? '--';
      const awayScore = game.teams.away.score ?? '--';
      const trueShooting = trueShootingCache[game.id];

      return `
        <article class="card" data-game-id="${game.id}">
          <div class="card-header">
            <span class="status">${statusLabel}</span>
            <span class="time">${formatTime(game.startTime)}</span>
          </div>
          <div class="team-row">
            <div>
              <div class="team-name">${game.teams.home.name}</div>
              <div class="team-odds">Odds: ${formatOdds(matchupOdds.home)}</div>
            </div>
            <div class="team-score">${homeScore}</div>
          </div>
          <div class="team-row">
            <div>
              <div class="team-name">${game.teams.away.name}</div>
              <div class="team-odds">Odds: ${formatOdds(matchupOdds.away)}</div>
            </div>
            <div class="team-score">${awayScore}</div>
          </div>
          ${renderTrueShootingPanel(trueShooting)}
        </article>
      `;
    })
    .join('');

  board.innerHTML = cards;
  badge.textContent = `${games.length} games loaded`;
};

const fetchGames = async () => {
  const response = await fetch('/api/games');
  if (!response.ok) {
    throw new Error('Failed to fetch games.');
  }
  const data = await response.json();
  return data.games || [];
};

const fetchOdds = async () => {
  const response = await fetch('/api/odds');
  if (!response.ok) {
    throw new Error('Failed to fetch odds.');
  }
  const data = await response.json();
  return data.odds || [];
};

const fetchTrueShooting = async (gameId) => {
  const response = await fetch(`/api/game/${gameId}/true-shooting`);
  if (!response.ok) {
    throw new Error('Failed to fetch true shooting.');
  }
  return response.json();
};

const loadBoard = async () => {
  try {
    const games = await fetchGames();
    renderBoard(games);
  } catch (error) {
    board.innerHTML = `<div class="empty">${error.message}</div>`;
  }
};

const loadOdds = async () => {
  try {
    oddsCache = await fetchOdds();
  } catch (error) {
    oddsCache = [];
  }
};

board.addEventListener('click', async (event) => {
  const card = event.target.closest('.card');
  if (!card) return;
  const gameId = card.dataset.gameId;
  if (!gameId) return;

  card.classList.add('loading');
  try {
    const trueShooting = await fetchTrueShooting(gameId);
    trueShootingCache[gameId] = trueShooting;
    await loadBoard();
  } catch (error) {
    alert(error.message);
  } finally {
    card.classList.remove('loading');
  }
});

const init = async () => {
  await loadOdds();
  await loadBoard();
  setInterval(loadBoard, 30000);
  setInterval(loadOdds, 300000);
};

init();
