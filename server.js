const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { getTodayGames, getGameTrueShooting } = require('./services/gamesService');
const { getOdds } = require('./services/oddsService');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(helmet());
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/games', async (req, res) => {
  try {
    const games = await getTodayGames();
    res.json({ games });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch games.' });
  }
});

app.get('/api/odds', async (req, res) => {
  try {
    const odds = await getOdds();
    res.json({ odds });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch odds.' });
  }
});

app.get('/api/game/:gameId/true-shooting', async (req, res) => {
  try {
    const { gameId } = req.params;
    const trueShooting = await getGameTrueShooting(gameId);
    res.json(trueShooting);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to calculate true shooting.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
