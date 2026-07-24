# Spec: RAG Search Engine with SQLite Vector Store

## Status
Draft

## Context (Phase 1 SDD)
We are building the foundational search layer for @sandman/rag-server. This spec establishes how raw text documents get stored as indexed embeddings within a local SQLite database using `better-sqlite3` + FTS5 — without requiring external vector databases or unavailable extensions like `sqlite-vss`.

The target is an Elysia HTTP server exposing `/search?q=...` with near real-time semantic search capabilities on embedded JSON-encoded vectors.

## Design Details

### 1. Database Schema

#### Table: `vectors`
Stores text fragments and their JSON-encoded embeddings from any embedding provider (Ollama, OpenAI…).
- `id INTEGER PRIMARY KEY AUTOINCREMENT` — surrogate key
- `text TEXT NOT NULL` — original chunk string
- `vec_json TEXT NOT NULL` — serialized `[float32; n]` vector

#### Table: `vectors_fts` (Virtual)
FTS5 full-text index for candidate filtering.
- Configured as a content-backed view referencing `vectors` table via `content='vectors' content_rowid='id'`.
- Automatically synchronized through INSERT/UPDATE triggers on base table.

#### SQL Initialization
```sql
CREATE TABLE IF NOT EXISTS vectors (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  text  TEXT    NOT NULL,
  vec_json TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS vectors_fts USING fts5(text, content='vectors', content_rowid='id');

-- SYNC TRIGGERS
CREATE TRIGGER vector_ai AFTER INSERT ON vectors BEGIN
  INSERT INTO vectors_fts(rowid, text) VALUES (new.id, new.text);
END;

CREATE TRIGGER vector_au AFTER UPDATE ON vectors BEGIN
  UPDATE vectors_fts SET text=new.text WHERE rowid=new.id;
END;
```

### 2. Elysia Server Configuration
- Middleware: `@elysiajs/cors` enabled globally (`'*'`) for local dev only (secured via environment flag later)
- Error middleware intercepting `better-sqlite3.exceptions`: locked DB, schema mismatches → mapped to HTTP 409 / 500 with structured JSON.

### 3. Vector Operations Strategy (Hybrid Search Pattern)
Since native vector operations (`sqlite-vss`) are unavailable today:

- **Insert**: Serialize float array to JSON string, INSERT into `vectors`, update FTS via trigger automatically.
- **Query path** (`GET /search?q=...`):
    1. Parse input query string (e.g., `"query=what+is+vector+databases"`)
    2. Execute SQL: `SELECT id, text FROM vectors_fts WHERE fts5 MATCH ? LIMIT 100`
    3. Fetch candidate vec\_json: `SELECT id, vec\_json FROM vectors WHERE rowid IN (...) AS cands`
    4. Parse JSON floats in JS, apply query encoder (or pass query embedding directly)
    5. Compute cosine similarity for each pair → sort descending by score
    6. Return top-K scored snippets with confidence metrics

### 4. Project Structure
```
src/
├── db/
│   ├── engine.ts       — better-sqlite3 singleton + initSchema()
│   └── vector-store.ts — insert(), search() functions
├── server/
│   └── index.ts        — Elysia app bootstrap
├── routes/
│   └── search.ts       — /search route handler + cosine utils
└── config/
    └── env.ts          — process.env typed helpers
```

## Implementation Tasks (Apply Phase)
- [ ] **Task 01**: Create DB engine module (`src/db/engine.ts`) with `better-sqlite3` singleton and initialization
- [ ] **Task 02**: Create schema setup script including vectors table, FTS5 virtual view, and triggers
- [ ] **Task 03**: Create `/src/server/index.ts` Elysia app entry point with CORS, health endpoint, error middleware
- [ ] **Task 04**: Implement DB service for inserting text + JSON-encoded embeddings into both tables
- [ ] **Task 05**: Build `/search` handler: parse query → FTS5 candidate fetch → JS cosine sort → return top-K scored results

## Non-Goals (Out of Scope)
Full ingestion pipeline (`POST /ingest`) — that's Spec #2.
Authorization/roles — handled in subsequent iterations.
External embedding services — the `/search` endpoint can accept externally-computed embeddings for now; actual `GET /embedding` API comes later.

## Acceptance Criteria (Gated for Verify Phase)
1. ✅ App starts without crashing (`pnpm dev` loads Elysia app successfully)
2. ✅ Vector rows inserted and retrievable via SQL query in `data/rag-data.db`
3. ✅ `/search?q=test+query` returns structured JSON with top-K ranked results containing text snippets + relevance scores
4. ✅ All code compiles cleanly (`tsc -b --noEmit`)
5. ✅ No unhandled runtime exceptions; graceful HTTP errors documented in spec/adr-002.md
