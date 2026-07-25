# Tasks: Bulk Import Endpoint (POST /documents/import)

## Task 01 — Write chunker + Ollama embed client [PARTIAL]
- `src/routes/documents.ts` exists (~165 lines) with chunkByWords, validateImportFiles, generateEmbedding, createDocumentImportRoute
- **BLOCKER**: Export names don't match test imports:
  - `chunkByWords` is defined but NOT exported (needs `export function`)
  - `validateImportFiles` should be renamed to `validateFiles` to match existing test expectations
  - `createDocumentImportRoute` should export as alias `createImportRoute` for test compatibility
- Chunker uses `env.searchTopK` as default chunk size (naming mismatch — should use a dedicated `RAG_CHUNK_SIZE`)
- Ollama embed client exists: POST `<OLLAMA_BASE_URL>/api/embed` with `{ model, input }`

## Task 02 — Wire import route on server [PARTIAL]
- **55 lines uncommitted** in `src/server/index.ts`: imports createDocumentImportRoute, registers `.post('/documents/import', ...)`
- Multipart parsing is done inline in the route handler (lines 63-86 of server/index.ts) BEFORE passing to the documents.ts handler
- **Issue**: creates a duplication conflict — documents.ts also has its own `readFileContents()` parser that expects raw IncomingMessage, but the server handler already parses and passes a partial object with `as any` cast
- Returns 201 (correct) not 202 as spec says — **spec mismatch to resolve**
- Error handling: TypeError → 400; other errors re-thrown (gets HTTP 500 via Elysia onError)

## Task 03 — Unit tests [PARTIAL]
- `tests/unit/document-import.test.ts` exists with tests for chunkByWords, validateFiles, createImportRoute
- **BLOCKER**: Tests import names don't match exports:
  - Imports `validateFiles` but source exports `validateImportFiles`
  - Imports `createImportRoute` but source exports `createDocumentImportRoute`
  - `chunkByWords` is not exported from documents.ts (import will fail at runtime)

## Task 04 — Integration tests [NOT STARTED]
- `tests/integration/document-import.test.ts` does NOT exist yet
- Needs: valid file upload → 201, missing Content-Type → 400, empty files → 400, >FILE_MAX → 400
- CORS headers verification
- Partial failure handling (Ollama down → graceful degradation)

## Task 05 — Build + verify [NOT STARTED]
- `tsc --noEmit` status unknown (may fail due to type mismatches from `as any` casts in server/index.ts)
- Unit tests won't pass until export names are fixed (Task 3 blocker)
- Integration tests don't exist yet (Task 4 blocker)

