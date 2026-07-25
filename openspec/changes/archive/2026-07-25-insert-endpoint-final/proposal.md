# Proposal: POST /insert Endpoint

## Intent
Add a public `POST /insert` endpoint that accepts text + vec_json, validates input with Zod, and persists rows through the existing VectorStore. This is the missing write path required for the RAG search engine to function end-to-end.

## Scope
- `src/routes/insert.ts` — Zod schema + route handler factory (mirrors pattern of `search.ts`)
- `src/server/index.ts` — register POST /insert on Elysia app, wire VectorStore.insert()
- `tests/unit/insert-route.test.ts` — unit tests for the insert route
- `tests/integration/insert.test.ts` — integration tests via HTTP

## Non-goals
- Batch/bulk insert (Phase 2)
- Ollama embedding generation inline (Phase 2)
- Authorization or rate limiting (Phase 3)
- File upload or multi-part form data

## Acceptance Criteria
1. `POST /insert` with valid `{ text, vec_json }` returns HTTP 201 + `{ id: number }`
2. Invalid inputs return appropriate HTTP 400 with structured error
3. Missing required fields return HTTP 400 with field-level errors
4. Input validation via Zod schema (text length 1-8192, vec_json valid float array)
5. No build errors or runtime exceptions on any path
6. All tests pass (unit + integration)
