# Live NBA Board

A Railway-deployable Node.js app that serves a live NBA scoreboard with moneyline odds and on-demand true shooting calculations.

## Features

- Express backend with CommonJS modules.
- Plain HTML/CSS/vanilla JS frontend served from `/public`.
- Live NBA games from API-Sports.
- Moneyline odds from The Odds API (server-side cache ~5 minutes).
- True Shooting % calculator per game on click.
- Basic security via Helmet and rate limiting.

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Fill in the API keys in `.env`.

3. **Start the server**
   ```bash
   npm start
   ```

The app will be available at `http://localhost:3000`.

## Environment Variables

- `ODDS_API_KEY`: The Odds API key.
- `APISPORTS_API_KEY`: API-Sports key.
- `ODDS_API_BASE_URL`: Optional override for The Odds API base URL.
- `APISPORTS_BASE_URL`: Optional override for API-Sports base URL.
- `ODDS_SPORT`: Odds API sport key (default: `basketball_nba`).
- `ODDS_REGION`: Odds API region (default: `us`).
- `ODDS_MARKET`: Odds API market (default: `h2h`).
- `APISPORTS_NBA_LEAGUE_ID`: API-Sports NBA league id (default: `12`).

## API Endpoints

- `GET /api/games` — Today’s NBA games with live scores.
- `GET /api/odds` — Moneyline odds (cached server-side ~5 minutes).
- `GET /api/game/:gameId/true-shooting` — Calculates true shooting % using team totals.

## Notes

- The frontend polls `/api/games` every ~30 seconds for score updates.
- True shooting updates only when a user clicks a game card.
- Railway will use the `npm start` command automatically.
