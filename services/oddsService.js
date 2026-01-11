const ODDS_API_BASE_URL = process.env.ODDS_API_BASE_URL || 'https://api.the-odds-api.com/v4';
const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ODDS_MARKET = process.env.ODDS_MARKET || 'h2h';
const ODDS_REGION = process.env.ODDS_REGION || 'us';
const ODDS_SPORT = process.env.ODDS_SPORT || 'basketball_nba';

const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedOdds = null;
let cachedAt = 0;

const getOdds = async () => {
  if (cachedOdds && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedOdds;
  }

  if (!ODDS_API_KEY) {
    throw new Error('Missing ODDS_API_KEY.');
  }

  const url = `${ODDS_API_BASE_URL}/sports/${ODDS_SPORT}/odds/?regions=${ODDS_REGION}&markets=${ODDS_MARKET}&oddsFormat=american&dateFormat=iso&apiKey=${ODDS_API_KEY}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Odds API request failed with status ${response.status}.`);
  }

  const data = await response.json();
  cachedOdds = Array.isArray(data) ? data : [];
  cachedAt = Date.now();
  return cachedOdds;
};

module.exports = {
  getOdds
};
