# Proposal: RAG Search Engine with SQLite Vector Store

## Intent
Establish the foundational semantic search layer for @sandman/rag-server using SQLite FTS5 with JSON-encoded vectors, without requiring external vector databases.

## Scope
- `src/db/engine.ts` — better-sqlite3 singleton + schema initialization
- `src/db/vector-store.ts` — insert() and search() functions
- `src/server/index.ts` — Elysia HTTP bootstrap
- `src/config/env.ts` — typed env configuration
- `src/routes/search.ts` — /search handler

## Non-goals
- Full ingestion pipeline (POST /ingest) — Spec #2
- Authorization/roles
- External embedding services (GET /embedding)

## Acceptance Criteria
1. App starts without crashing
2. Vector rows insertable and retrievable via SQL
3. `/search?q=test` returns structured JSON with relevance scores
4. Code compiles cleanly (`tsc --noEmit`)
5. No unhandled runtime exceptions
