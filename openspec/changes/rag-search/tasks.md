# Tasks: RAG Search Engine

## Task 01 — DB engine module (COMPLETED)
- Created `src/db/engine.ts` with better-sqlite3 singleton pattern
- Schema initialization includes vectors table, FTS5 virtual table, sync triggers
- WAL mode + FK enforcement configured

## Task 02 — Schema setup (COMPLETED)
- Tables: vectors (id, text, vec_json), vectors_fts (FTS5 with content='vectors')
- Triggers: vector_ai/au/ad for automatic FTS5 synchronization
- Idempotent via IF NOT EXISTS on all DDL

## Task 03 — Server entry point (COMPLETED)
- Elysia HTTP app on Node createServer adapter
- CORS middleware via derive (wildcard origin in dev)
- GET /health → { status, uptime }
- GET /search → structured JSON with FTS5 results + cosine scores

## Task 04 — Vector insert service (COMPLETED)
- VectorStore.insert() with prepared statement
- Raw binary vectors stored as JSON strings in SQLite TEXT column
- Auto-increment surrogate keys via lastInsertRowid

## Task 05 — Search handler (COMPLETED)
- FTS5 candidate fetch with limit multiplier (topK * 2) for ranking headroom
- JS cosine similarity computation over fetched vec_json arrays
- Empty query vector → FTS-only scoring (score = 1.0)
- Zero query norm → return empty results

## Test Coverage
- Unit tests: 14 tests for VectorStore (insert, search, edge cases)
- Integration tests: 14 tests for HTTP endpoints (/health, /search, CORS, unicode, etc.)
- Total: 28 passing tests
