# SheKeeps

A calm, personal workspace for notes, tasks, and daily journal entries. SheKeeps has a separate, dependency-free frontend and a Java Spring Boot API backed by PostgreSQL. Each account's content is private to that account.

## What’s included

- **Today:** a snapshot of recent notes, open tasks, and today's journal prompt
- **Notes:** capture and organize thoughts by category
- **Tasks:** add due dates and priorities, then check items off
- **Journal:** write a dated daily entry and revisit past days
- **Accounts:** registration and login with HTTP-only access and refresh cookies

## Requirements

- Java 21+
- Maven 3.9+
- PostgreSQL 16+
- Node.js 18+ (frontend server only; no npm packages to install)

## Run locally

1. Start PostgreSQL locally. The default database settings are `postgres` / `postgres` and database `shekeeps_db`. Create the database if needed.
2. Copy `.env.example` to `.env`; set two different JWT secrets of at least 32 characters and adjust database settings if needed.
3. Start the backend from the project root:

   ```bash
   mvn spring-boot:run
   ```

   The API listens on `http://localhost:5000`. On startup, it creates the tables for users, notes, tasks, and journal entries.

4. In another terminal, start the separate frontend:

   ```bash
   cd frontend
   node server.mjs
   ```

   Open **http://localhost:3000**. The frontend server serves files from `frontend/` and forwards `/api` requests to the backend on port 5000. No `npm install` is needed.

You can change the ports with `FRONTEND_PORT` and `BACKEND_PORT` when starting the frontend. The Spring API port is configured with `PORT`.

## API routes

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`
- `GET /api/auth/me`, `POST /api/auth/refresh`
- `GET|POST /api/notes`, `PUT|DELETE /api/notes/{id}`
- `GET|POST /api/tasks`, `PUT|DELETE /api/tasks/{id}`, `PATCH /api/tasks/{id}/complete`
- `GET|POST /api/journal`, `PUT|DELETE /api/journal/{id}`
- `GET /api/health`

The Postman collection is in `postman_collection.json`; set its base URL to `http://localhost:5000/api`.

## Project layout

```text
frontend/                       # Standalone HTML, CSS, JavaScript, and local dev server
src/main/java/com/shekeeps/auth # Spring Boot API
src/main/resources/schema.sql   # PostgreSQL schema
```
"# SheKeeps" 
