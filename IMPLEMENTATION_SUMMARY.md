# Implementation Summary — @sandman/rag-server

## Current State (as of 2026-07-25)

The server implements a local RAG pipeline with SQLite-backed vector storage and Ollama embeddings.

### Architecture

```
src/server/index.ts          ← Elysia HTTP app + route wiring
src/routes/search.ts         ← GET /search?q=... (cosine similarity over FTS5 candidates)
src/routes/insert.ts         ← POST /insert {text, vec_json} (single doc)
src/routes/documents.ts      ← POST /documents/import (multipart bulk with chunking)
src/db/engine.ts             ← SQLite DB init + vector table creation
src/db/vector-store.ts       ← VectorStore class: insert(), search(), prepare()
src/config/env.ts            ← Typed env validation via Zod
```

### Key Design Decisions

1. **No external vector database** — uses `better-sqlite3` with JSON-encoded float arrays + FTS5 for candidate filtering, then cosine similarity in JS.
2. **Ollama as embedding provider** — POST to `<OLLAMA_BASE_URL>/api/embed`. Configured via `OLLAMA_BASE_URL` env var.
3. **Hybrid search** — FTS5 MATCH narrows candidates → cosine similarity ranks them. Avoids sqlite-vss dependency which has no linux-arm64 prebuilds.
4. **Factory function pattern** — each route module exports a pure factory (`createSearchRoute`, `createInsertRoute`, `createImportRoute`) that takes the vector store as dependency, not a class.

### SDD History

| Cycle | Status | Tasks | Tests |
|-------|--------|-------|-------|
| rag-search | ✅ Archived (2026-07-24) | 5 implemented | 28 total (14 unit + 14 integration) |
| insert-endpoint | ✅ Done (committed 2026-07-25) | 4 implemented | 25 total (10 unit + 15 integration) |
| bulk-import-endpoint | 🔄 Partial | 3/5 tasks | 9 unit tests exist; integration tests incomplete |

### What Still Needs Work (bulk-import-endpoint)

- [ ] Integration tests (`tests/integration/document-import.test.ts` exists but untested against live server)
- [ ] Fix export name mismatches: `validateImportFiles` → `validateFiles`, `createDocumentImportRoute` → `createImportRoute`
- [ ] Response code mismatch: spec says 202, implementation returns 201
- [ ] `pnpm test` pass verification after fixes

### Project Conventions

- **Validation**: Zod schemas inline at route boundary; factory function validates input before vector store interaction
- **Error handling**: HTTP 400 for validation errors, 500 via Elysia.onError for DB/embedding failures
- **CORS**: Enabled globally for local dev (`'*'`)
- **Tests**: vitest — unit (pure function tests), integration (live server + fetch)
- **Build**: `tsc -b` + post-build script; dist/ is committed to repo
- **OpenSpec**: Change artifacts in `openspec/changes/<name>/`; archived changes in `openspec/changes/archive/`

### How to Run

```bash
pnpm dev           # Development (tsx watch)
pnpm build         # TypeScript compilation
pnpm test          # Unit + integration tests
curl -X POST http://localhost:3000/search?q=...     # Search
curl -X POST http://localhost:3000/insert -d '{"text":"...","vec_json":[...]}'   # Single doc
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 3000 | HTTP server port |
| `OLLAMA_BASE_URL` | Yes | — | Base URL for Ollama API |
| `DB_PATH` | No | `./data/rag.db` | SQLite database path |
