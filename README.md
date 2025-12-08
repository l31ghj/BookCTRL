# BookCTRL

Self-hosted ebook downloader & OPDS server.

Features:

- Pluggable providers (ships with Project Gutenberg via Gutendex).
- Download EPUB/PDF into a local library.
- Simple web UI for:
  - Search
  - Library
  - Provider settings
- OPDS catalog:
  - Root: `/opds`
  - Catalog: `/opds/catalog`
- Single-container deployment via Docker / docker-compose.
- Uses SQLite via Prisma.

## Tech stack

- Node.js + TypeScript
- NestJS
- Prisma ORM (SQLite)
- Handlebars views
- Docker
- GitHub Actions CI

## Local development

```bash
cd backend
npm install
# create .env
echo DATABASE_URL="file:./dev.db" > .env
echo EBOOKS_DIR="./ebooks" >> .env

npx prisma migrate dev --name init
npm run start:dev
```

Then open http://localhost:3000

### Configure Gutenberg provider

1. Go to **Settings → Providers** in the UI.
2. Add:
   - Type: `gutenberg`
   - Name: `Gutenberg`
   - Base URL: `https://gutendex.com` (or leave blank to use the default)

Then you can search and download books.

## Docker (standalone)

From repo root:

```bash
docker compose up -d --build
```

Then open: http://localhost:8010

Data is persisted in `./data` (SQLite DB + ebooks).

## CI

GitHub Actions workflow does:

- Install deps
- Prisma generate
- Prisma migrate deploy (SQLite)
- Build backend
- Type-check with `tsc --noEmit`
- Smoke test `/search`
