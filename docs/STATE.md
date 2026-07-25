# State — rag-server

## Project
RAG server — local semantic search with SQLite + Ollama embeddings, Elysia HTTP API.

## Branch History
| Branch | Commit | Content | Status |
|--------|--------|---------|--------|
| main | 835d7df | Full RAG pipeline (rag-search + insert + bulk-import) | ✅ Merged |
| develop | 835d7df | Copy of main | ✅ Up to date |

## Feature Coverage

### POST /search (GET with query param)
- FTS5 full-text match → cosine similarity ranking
- Top-K configurable via env (`SEARCH_TOP_K`)
- Returns scored snippets with confidence metric
- **Tests**: 14 integration + 7 unit = 21 total
- **Spec**: Archived in `openspec/changes/archive/2026-07-24-rag-search/`

### POST /insert
- Zod validation: text (1-8192 chars), vec_json (array of numbers)
- Returns 201 `{ id }` or 400 with structured error
- **Tests**: 10 unit + 15 integration = 25 total
- **Spec**: `openspec/changes/insert-endpoint/`

### POST /documents/import (bulk)
- Multipart form parsing → file validation → word-based chunking → Ollama embedding per chunk
- Returns 201 `{ chunks: N }` (spec mismatch: says 202)
- **Tests**: 9 unit (partial, export names need fix) + 0 integration incomplete
- **Spec**: `openspec/changes/bulk-import-endpoint/`

## Health Signals
| Signal | Status | Details |
|--------|--------|---------|
| TypeScript compile | ✅ | Zero errors |
| Unit tests | ✅ (partial) | Insert: 10/10 pass; bulk: import names mismatch |
| Integration tests | ✅ (partial) | Search: 21, insert: 25; bulk: incomplete |
| Build | ✅ | `tsc -b` succeeds |

## Prioritized Debt
1. **bulk-import export names** — tests can't run because source exports differ from test imports
2. **Response code mismatch** — spec says 202, implementation returns 201
3. **Integration tests for bulk-import** — file upload testing via live server is untested

## Last Updated
2026-07-25 by Claude Code (session-start protocol)
