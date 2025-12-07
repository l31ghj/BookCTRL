# Ebook Downloader (OPDS-enabled)

Self-hosted ebook downloader inspired by Ephemera, built with **NestJS + Prisma + Postgres**, with:

- Configurable providers via web UI (v0.2.0 ships with Project Gutenberg via Gutendex).
- Search and download ebooks into a local library.
- Simple HTML UI (no separate frontend app).
- Files stored on disk, metadata in Postgres.
- **OPDS feed** so readers like KOReader, Calibre and Thorium can access your library.

> This project is intended for legal/public-domain sources (e.g. Project Gutenberg).  
> Do not use it to automate piracy or access sources that violate copyright.

---

## Features

### Core

- Provider management UI:
  - Add providers of different types (currently: `gutenberg`).
  - Configure base URL.
  - Enable/disable providers.
- Search across all enabled providers.
- Download selected format (EPUB / PDF) to local storage.
- View your downloaded library and re-download files.

### OPDS

- `GET /opds` – Root OPDS catalog.
- `GET /opds/catalog` – Full catalog of books in your library.
- `GET /opds/book/:id` – Individual book entry (with acquisition links).
- `GET /files/:id` – Direct file download endpoint used by OPDS links.

Tested with any OPDS-compatible client (KOReader / Thorium / Calibre etc).

---

## Tech stack

- **Backend:** NestJS (Node 22)
- **Database:** PostgreSQL + Prisma
- **Views:** Handlebars (simple server-rendered HTML)
- **HTTP client / scraping:** Axios
- **Containerisation:** Docker + docker-compose

---

## Running locally (Docker)

### 1. Build and start

From the root of the repo:

```bash
docker compose up --build
```

This will start:

- Postgres at `localhost:5436`
- Backend at `http://localhost:8010`

### 2. Run Prisma migrations (first time only)

Open another terminal, then:

```bash
docker compose exec backend npx prisma migrate deploy
```

> If you prefer to run migrations outside Docker, you can:
> 1. `cd backend`
> 2. Set `DATABASE_URL` in a `.env`.
> 3. Run `npm install` and `npm run prisma:migrate`.

---

## Web UI

Once the stack is running, open:

- **App:** http://localhost:8010

### Providers setup

1. Go to **Providers** (`/settings/providers`).
2. Add a provider:

   - **Type:** `gutenberg`
   - **Name:** `Gutenberg`
   - **Base URL:** `https://gutendex.com`

3. Submit and make sure it is **enabled**.

> The Gutendex API is a JSON API in front of Project Gutenberg’s public-domain content.

### Searching and downloading

1. Go to **Search** (`/search`).
2. Enter a query (for example: `tolstoy`).
3. Hit **Search**.
4. In the results, click **Download** for one of the entries.
5. The file will be downloaded and saved to the configured `EBOOKS_DIR` (`/data/ebooks` in Docker).

### Library

- Go to **Library** (`/library`) to see all downloaded books.
- Each book row shows:
  - Title, author, source.
  - A list of file links (format badges).  
    Clicking a format badge downloads that file via `/files/:id`.

---

## OPDS usage

The backend exposes a simple OPDS 1.x-style catalog.

With the default Docker setup:

- Root feed: `http://localhost:8010/opds`
- Full catalog: `http://localhost:8010/opds/catalog`
- Single book (internal): `http://localhost:8010/opds/book/<book-id>`
- File acquisition links: `http://localhost:8010/files/<file-id>`

### Example: KOReader

1. In KOReader, add a new OPDS catalog.
2. Use `http://<your-host>:8010/opds` as the URL.
3. Browse your catalog and download books directly from your device.

### Example: Thorium Reader

1. Open Thorium.
2. Add new OPDS feed/catalog.
3. Paste in `http://localhost:8010/opds`.
4. Browse and download.

---

## Environment variables

The backend uses:

- `DATABASE_URL` – PostgreSQL connection string.
- `EBOOKS_DIR` – Filesystem path where ebooks are stored (default: `/data/ebooks`).

`docker-compose.yml` sets:

```yaml
DATABASE_URL: postgres://ebooks:ebooks@db:5432/ebooks
EBOOKS_DIR: /data/ebooks
```

and mounts a named volume `ebooks_data` at `/data/ebooks` inside the backend container.

---

## Development (without Docker)

If you prefer running directly:

```bash
cd backend
npm install
```

Set `DATABASE_URL` in `backend/.env`, e.g.:

```env
DATABASE_URL=postgres://ebooks:ebooks@localhost:5432/ebooks
EBOOKS_DIR=./data/ebooks
```

Then:

```bash
npx prisma migrate dev --name init
npm run start:dev
```

App will run at `http://localhost:3000`.

---

## Notes / Limitations (v0.2.0)

- Only one provider type is implemented: **Gutenberg** (`gutenberg`), via Gutendex.
- Provider settings schema is minimal (only `baseUrl` supported right now).
- No auth / multi-user support yet.
- No background job system; downloads are synchronous.

---

## Roadmap ideas

- More provider types (e.g. Standard Ebooks).
- Per-provider setting schemas and validation.
- Search filters (language, year, author).
- Cover caching to local filesystem.
- Simple authentication for OPDS and UI.
- Calibre/OPDS enhancements (pagination, groups).

---

## Licensing / Legal

You are responsible for ensuring your use of this application complies with applicable law and the terms of any data sources you connect it to.  
The default Gutendex + Project Gutenberg flow is aimed at **public-domain books**.

---

Happy hacking!
