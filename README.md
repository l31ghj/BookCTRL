# BookCTRL

Self-hosted ebook downloader & OPDS server.

Features:

- Search ebooks via pluggable providers (ships with Project Gutenberg via Gutendex).
- Download and store ebooks locally (SQLite + filesystem).
- Simple web UI for search, library, and providers.
- OPDS catalog so compatible readers (KOReader, Thorium, Calibre, etc.) can browse and download.
- Single-container deployment using Docker.
- CI workflow that builds, type-checks, and smoke-tests the backend.

## Tech stack

- Node.js + TypeScript
- NestJS
- Prisma ORM (SQLite)
- Handlebars for server-rendered pages
- Docker
- GitHub Actions CI

## Quickstart (no Docker)

```bash
cd backend
npm install
npx prisma migrate dev --name init
npm run start:dev
```

App will be available at: http://localhost:3000

## Quickstart (Docker)

From the repo root:

```bash
docker build -t bookctrl-backend ./backend
docker run -p 8010:3000 -v $(pwd)/data:/data bookctrl-backend
```

App will be available at: http://localhost:8010

SQLite database and ebooks will be stored under `./data` on your host.

## OPDS

Once running:

- Root OPDS feed: `http://localhost:3000/opds`
- Catalog: `http://localhost:3000/opds/catalog`

Point KOReader / Thorium / Calibre at the root feed URL.

## Providers

Initial provider type:

- `gutenberg` (Gutendex API)

You can add providers in the web UI under **Providers**:

- Type: `gutenberg`
- Name: anything (e.g. `Gutenberg`)
- Base URL: `https://gutendex.com`

## CI

The repo includes a GitHub Actions workflow that:

- Installs dependencies
- Runs Prisma generate
- Runs `nest build`
- Runs `tsc --noEmit` (type-check only)
- Smoke-tests `/search` endpoint

No ESLint is wired in this clean base (you can add it later if you want).

