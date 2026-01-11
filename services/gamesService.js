const API_BASE_URL = process.env.APISPORTS_BASE_URL || 'https://v1.basketball.api-sports.io';
const API_KEY = process.env.APISPORTS_API_KEY;
const NBA_LEAGUE_ID = process.env.APISPORTS_NBA_LEAGUE_ID || '12';

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const fetchApiSports = async (endpoint) => {
  if (!API_KEY) {
    throw new Error('Missing APISPORTS_API_KEY.');
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'x-apisports-key': API_KEY
    }
  });

  if (!response.ok) {
    throw new Error(`API-Sports request failed with status ${response.status}.`);
  }

  return response.json();
};

const normalizeGame = (game) => {
  const status = game.status?.long || 'Unknown';
  const scoreHome = game.scores?.home?.total;
  const scoreAway = game.scores?.away?.total;

  return {
    id: game.id,
    status,
    clock: game.status?.timer || null,
    startTime: game.date,
    arena: game.arena?.name || null,
    teams: {
      home: {
        id: game.teams?.home?.id,
        name: game.teams?.home?.name,
        logo: game.teams?.home?.logo,
        score: Number.isFinite(scoreHome) ? scoreHome : null
      },
      away: {
        id: game.teams?.away?.id,
        name: game.teams?.away?.name,
        logo: game.teams?.away?.logo,
        score: Number.isFinite(scoreAway) ? scoreAway : null
      }
    }
  };
};

const getTodayGames = async () => {
  const today = formatDate(new Date());
  const endpoint = `/games?date=${today}&league=${NBA_LEAGUE_ID}`;
  const data = await fetchApiSports(endpoint);

  const games = Array.isArray(data.response) ? data.response.map(normalizeGame) : [];
  return games;
};

const getGameTrueShooting = async (gameId) => {
  if (!gameId) {
    throw new Error('Missing game id.');
  }

  const data = await fetchApiSports(`/games/statistics?game=${gameId}`);
  const stats = Array.isArray(data.response) ? data.response : [];

  if (!stats.length) {
    throw new Error('No stats available for this game.');
  }

  const teamStats = stats.map((entry) => {
    const totals = entry.statistics?.find((stat) => stat.type === 'Total')?.value || {};
    const points = Number(totals.points ?? totals.pointsTotal ?? totals.points_total ?? 0);
    const fga = Number(totals.fieldGoalsAttempted ?? totals.fgAtt ?? totals.fga ?? 0);
    const fta = Number(totals.freeThrowsAttempted ?? totals.ftAtt ?? totals.fta ?? 0);

    const denominator = 2 * (fga + 0.44 * fta);
    const ts = denominator > 0 ? points / denominator : 0;

    return {
      id: entry.team?.id,
      name: entry.team?.name,
      points,
      fga,
      fta,
      trueShooting: Number.isFinite(ts) ? ts : 0
    };
  });

  return {
    gameId,
    updatedAt: new Date().toISOString(),
    teams: teamStats
  };
};

module.exports = {
  getTodayGames,
  getGameTrueShooting
};
