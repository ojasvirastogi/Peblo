# Peblo AI Notes Workspace

A lightweight full-stack take-home project for the Peblo Full Stack Developer Challenge. It includes secure signup/login, a notes workspace with auto-save, tags and categories, AI summary generation, search/filtering, public share links, and productivity insights.

## Stack

- Frontend: vanilla HTML/CSS/JavaScript served from `public/`
- Backend: Node.js HTTP server using built-in modules
- Persistence: JSON datastore at `data/db.json`
- Auth: signed HttpOnly session cookie plus `crypto.scrypt` password hashing
- AI: OpenAI-compatible chat completion when `LLM_API_KEY` is set, deterministic local fallback when it is not

The project intentionally has no runtime npm dependencies, so it runs cleanly on a fresh machine with Node 20+.

## Setup

1. Install Node.js 20 or newer.
2. Create local environment values:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Edit `.env` if needed:

```env
PORT=3000
APP_ORIGIN=http://localhost:3000
JWT_SECRET=change-me-in-production
DATA_FILE=./data/db.json
LLM_API_KEY=
LLM_MODEL=gpt-4.1-mini
```

4. Run the app:

```bash
npm run dev
```

If PowerShell blocks `npm`, use:

```powershell
npm.cmd run dev
```

Then open `http://localhost:3000`.

## Testing

```bash
npm test
```

PowerShell alternative:

```powershell
npm.cmd test
```

Tests cover password hashing/session tokens, the local AI fallback, and datastore search/insights behavior.

## Deploying on Render

This repo includes a root `render.yaml` Blueprint for Render. The Blueprint creates a Node web service, sets production environment variables, and mounts a persistent disk at `/var/data` so the JSON database survives restarts.

Deployment steps:

1. Push this repo to GitHub.
2. In Render, create a new Blueprint instance from the GitHub repository.
3. Set `APP_ORIGIN` to the Render service URL after the service is created.
4. Optionally set `LLM_API_KEY` for hosted AI generation. Without it, the deterministic local AI fallback still works.

Render will run:

```bash
npm install
npm start
```

## API Overview

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/me`
- `GET /api/notes?search=&tag=&status=active`
- `POST /api/notes`
- `GET /api/notes/:id`
- `PATCH /api/notes/:id`
- `POST /api/notes/:id/generate-summary`
- `POST /api/notes/:id/share`
- `DELETE /api/notes/:id/share`
- `GET /api/shared?id=:shareId`
- `GET /api/insights`

## Architecture Notes

The backend uses a small modular structure:

- `server/index.js` handles routing, JSON responses, static serving, and protected route checks.
- `server/auth.js` owns password hashing and signed session cookie helpers.
- `server/datastore.js` owns persistence, note filtering, public note shaping, sharing, and insights.
- `server/ai.js` owns LLM calls and local fallback generation.

The frontend keeps state in `public/app.js` and renders the workspace from that state. Note edits are auto-saved after a short debounce, search/filtering refreshes the note list responsively, and the share page is reachable without authentication at `/shared/:shareId`.

## Sample API Responses

Create note:

```json
{
  "note": {
    "note_id": "NOTE_001",
    "title": "Project Planning",
    "content": "Prepare UI mockups and review API structure.",
    "tags": ["work", "meeting"],
    "category": "Product",
    "archived": false,
    "share_id": null,
    "ai": null,
    "created_at": "2026-05-14T12:00:00.000Z",
    "updated_at": "2026-05-14T12:00:00.000Z"
  }
}
```

AI output:

```json
{
  "summary": "Weekly project planning discussion covering UI mockups and API structure.",
  "action_items": ["Prepare UI mockups", "Review API structure"],
  "suggested_title": "Sprint Planning Notes"
}
```

Insights:

```json
{
  "total_notes": 6,
  "archived_notes": 1,
  "most_used_tags": [{ "tag": "work", "count": 4 }],
  "ai_usage": { "total_generations": 3, "this_week": 2 },
  "weekly_activity": [{ "date": "2026-05-14", "edits": 2 }]
}
```

## Demo Video Checklist

For a 5-10 minute walkthrough, show:

1. Signup and login
2. Creating and editing notes with auto-save
3. Tags, categories, search, and filtering
4. AI summary/action/title generation
5. Public share link creation and anonymous share page
6. Dashboard insights

## Security Notes

Do not commit `.env` or `data/db.json`. Passwords are hashed with per-user salts using `crypto.scrypt`, and sessions are stored in signed HttpOnly cookies. For production, set a strong `JWT_SECRET`, use HTTPS, and move persistence to PostgreSQL or another managed database.
