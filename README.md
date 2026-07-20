<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Système de gestion des infrastructures scolaires

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/3ab44bed-e798-4662-a190-ae038f97cb1c

## Run Locally With Node.js

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env` and update the values for PostgreSQL, `JWT_SECRET`, and optionally `GEMINI_API_KEY`.
3. Push the database schema:
   `npm run db:push`
4. Run the app:
   `npm run dev`

## Run Locally With Docker

**Prerequisites:** Docker Desktop

1. Optionally copy `.env.example` to `.env` and update `GEMINI_API_KEY` or local ports.
2. Build and start the app with PostgreSQL:
   `docker compose up --build`
3. Open `http://localhost:3000`.

If ports `3000` or `5432` are already in use on Windows PowerShell:

```powershell
$env:PORT="3001"
$env:SQL_PORT="5433"
docker compose up --build
```

The Docker Compose setup starts PostgreSQL, pushes the Drizzle schema, then runs the Express/Vite app.

## Production Build

```bash
npm run build
npm start
```

## Render Deployment

This repository includes `render.yaml` for a Docker web service plus Render Postgres.

1. Push the repository to GitHub/GitLab/Bitbucket.
2. In Render, create a new Blueprint from this repository.
3. Set `GEMINI_API_KEY` and `APP_URL` in the Render dashboard.
4. Render builds the Docker image, runs `npm run db:push` as the pre-deploy command, then starts `npm start`.

The included `render.yaml` uses a paid `starter` web service because Render pre-deploy commands are available for paid web services.
3. Run the app:
   `npm run dev`
