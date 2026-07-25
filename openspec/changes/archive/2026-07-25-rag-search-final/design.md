# Design: RAG Search Engine

## Architecture Decision Log

### ADR-001: SQLite with FTS5 instead of external vector DB
**Context**: Project requires semantic search without external dependencies. `sqlite-vss` unavailable for current Node runtime on ARM64.
**Decision**: Use better-sqlite3 with FTS5 virtual tables and JSON-encoded vectors. Search path: FTS5 candidate fetch → JS cosine similarity ranking.
**Consequences**: 
- No native vector index (FTS5 is approximate by nature)
- Cosine similarity computed in JS memory
- Simpler deployment, no extra services needed

### ADR-002: Elysia on Node http server adapter
**Context**: Elysia 1.x requires explicit http handling on non-Bun runtimes.
**Decision**: Use `createServer(app.handle)` with manual Request wrapping for Web API compatibility.
**Consequences**: 
- Need to convert IncomingMessage → ReadableStream for body support
- Headers must be iterable arrays, not Record<string, string>
- CORS handled via Elysia derive middleware

### ADR-003: better-sqlite3 Node version constraint
**Context**: better-sqlite3 v9.6 prebuilt binaries only for Node 20 ARM64 (napi 115). Node 24 (napi 137) has no prebuilds yet.
**Decision**: Runtime requires Node >=20.11 AND <24, or better-sqlite3 must be compiled from source.
**Consequences**: 
- CI/CD must pin Node 20.x for database tests
- Production deployment needs compatible runtime

## Schema Design

```sql
CREATE TABLE vectors (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  text     TEXT    NOT NULL,
  vec_json TEXT    NOT NULL
);

CREATE VIRTUAL TABLE vectors_fts USING fts5(
  text,
  content='vectors',
  content_rowid='id'
);

-- Sync triggers (IF NOT EXISTS for idempotency)
```

## File Structure
```
src/
├── config/env.ts      — env access, NaN-safe number parsing
├── db/engine.ts       — better-sqlite3 singleton, schema init
├── db/vector-store.ts — VectorStore class: insert(), search()
├── routes/search.ts   — createSearchRoute factory, FTS5 sanitization
└── server/index.ts    — Elysia app, CORS derive(), health + search endpoints
```
