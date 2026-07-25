# Specification: POST /documents/import Endpoint (bulk-import-endpoint)

## Scope

### In scope
- Multipart/form-data file upload handler for bulk document ingestion
- Text chunking into overlapping word-boundary segments (configurable size/overlap)
- Ollama embedding generation via `/api/embed` endpoint per chunk
- Persistence of all chunks into VectorStore (existing SQLite + FTS5 backend)
- Validation of file count and filenames
- Unit tests for chunker, validator, and route factory
- Integration tests (HTTP-level via real server with mocked Ollama)

### Out of scope
- PDF/DOCX/XLSX parsing (Phase 3 — add pdf-parse / mammoth dependencies)
- Per-file chunk size configuration (uses env defaults)
- Batch embedding via Ollama API (single text per call — batches in Phase 2)
- Ollama model selection per request (uses `EMBEDDING_MODEL` env var defaulting to `nomic-embed-text`)
- Authorization, rate limiting, or access control

---

## API Contract

### Request

```
POST /documents/import
Content-Type: multipart/form-data

--boundary
Content-Disposition: form-data; name="files"; filename="doc1.txt"
Content-Type: text/plain

<file content>
--boundary
Content-Disposition: form-data; name="files"; filename="doc2.md"
Content-Type: text/markdown

<file content>
--boundary--
```

| Field | Type | Constraints |
|-------|------|-------------|
| `files[*]` | file (text) | Array of 1+ files, each with a filename, text content read as UTF-8 |

### Response — Success (HTTP 201 Created)

```json
{
  "status": "ok",
  "inserted": <number>,
  "sources": [
    { "filename": "<filename>", "chunks": <number> }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | `"ok"` | Always `"ok"` on success (no partial failure) |
| `inserted` | number | Total chunks inserted across all files (count of successful vector store insertions) |
| `sources` | object[] | Per-file summary; filename preserved from upload, chunks = successful inserts for that file |

### Response — Validation Error (HTTP 400 Bad Request)

```json
{
  "status": "error",
  "message": "<validation error description>"
}
```

| Scenario | Status | Message pattern |
|----------|--------|-----------------|
| No files in request body | 400 | `At least one file is required` |
| File without filename | 400 | `All files must have a filename` |
| >100 files uploaded | 400 | `Too many files: max 100 allowed` |
| Content-Type not multipart/form-data | 400 | `Content-Type must be multipart/form-data` |

### Response — External Service Error (HTTP 502 Bad Gateway)

```json
{
  "status": "error",
  "message": "Ollama embedding service unavailable: <details>"
}
```

| Scenario | Status | Message |
|----------|--------|---------|
| Ollama endpoint unreachable | 502 | `Ollama embed failed: <response status>` |
| Empty embeddings from Ollama | 502 | `Empty embeddings from Ollama` |

### Response — Chunk Skip (partial failure, no HTTP error)

When an individual chunk's embedding fails (Ollama returns non-200), the handler **logs the error and continues** with the next chunk. The file is not retried. This is reflected in the `sources[*].chunks` count being lower than the expected chunk count.

---

## Chunking Specification

### Algorithm: `chunkByWords(text, size?, overlap?)`

1. Split text into words by whitespace (`/\s+/`)
2. Filter empty strings (whitespace-only input returns `[]`)
3. Slide a window of `size` words, advancing by `size - overlap` words each step
4. When remaining words < size at the end, emit them as final chunk regardless of size
5. Each chunk is joined back with single spaces

### Defaults (from env)

| Parameter | Default | Source |
|-----------|---------|--------|
| `size` | 512 words | `env.searchTopK` (reused as chunk size — note: naming mismatch, should be `RAG_CHUNK_SIZE`) |
| `overlap` | 51 words (~10%) | Calculated as `Math.floor(CHUNK_SIZE * 0.1)` |

### Constraints
- Empty text → `[]` (no chunks)
- Single word → `["<word>"]` (one chunk regardless of size)
- Unicode text: handled correctly — JavaScript `split(/\s+/)` splits on any Unicode whitespace
- Very long text (>500k chars): no artificial limit; produces proportional number of chunks

### Determinism guarantee
Same input text → identical chunk boundaries every time. No randomness or external dependency affects chunk output.

---

## Ollama Embedding Integration

### Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Base URL for Ollama API |
| `EMBEDDING_MODEL` | `nomic-embed-text` | Model name for `/api/embed` endpoint |

### Endpoint call

```
POST <OLLAMA_BASE_URL>/api/embed
Content-Type: application/json

{
  "model": "<EMBEDDING_MODEL>",
  "input": "<text>"
}
```

### Response parsing

```json
{
  "embeddings": [[<number>, <number>, ...]]
}
```

- First element of `embeddings` array is used: `json.embeddings[0]`
- If `embeddings` is missing or empty → throw error (caught by handler)
- Vector dimensions must be consistent across calls (Ollama handles this internally)

### Timeout behavior
No explicit timeout is set on the fetch call — uses Node.js default HTTP timeout (~120s). This should be configured explicitly in Phase 3.

---

## Database Integration

### Per-chunk flow
For each chunk:
1. `embedding = await generateEmbedding(chunk)` → Ollama API call
2. `vecJson = JSON.stringify(embedding)` → serialize vector to JSON string
3. `id = vstore.insert(chunk, vecJson)` → SQLite INSERT via VectorStore
4. If insert returns id > 0: increment `totalInserted` and file's chunk count
5. If any step throws: **log error, continue to next chunk** (graceful degradation)

### Trigger behavior
INSERT into `vectors` table automatically fires:
- `vector_ai` trigger → inserts into `vectors_fts` content table
- FTS5 full-text search becomes immediately available

### Batch considerations
Each chunk is inserted individually (no transaction, no batch INSERT). For 100+ files this may be slow. Phase 2 should add batch inserts with explicit transactions.

---

## Error Handling Specification

| Layer | Error Type | Handling |
|-------|-----------|----------|
| Validation | TypeError | Thrown → caught → HTTP 400 with `Validation failed: <message>` |
| Ollama (individual chunk) | Error | Logged to console.error; chunk skipped; next chunk attempted |
| Ollama (all chunks fail for a file) | Error | File contributes `chunks: 0` to sources; does NOT cascade to other files |
| HTTP fetch failure | TypeError/Error | Caught → logged; graceful degradation to next chunk |

---

## Type Exports

The module `src/routes/documents.ts` must export these symbols for testing:

```typescript
export function chunkByWords(text: string, size?: number, overlap?: number): string[];
export function validateFiles(files: Array<{ filename: string; content?: string }>): void;
export function createImportRoute(vstore: VectorStore): (req) => Promise<ImportResponse>;

export type ImportSourceResult = { filename: string; chunks: number };
export type ImportResponse = { status: 'ok'; inserted: number; sources: ImportSourceResult[] };
```

---

## Acceptance Criteria

1. [ ] `POST /documents/import` with 1+ text files returns HTTP 201 + `{ status, inserted, sources }`
2. [ ] Each file is chunked into ≤512-word segments with ~10% overlap
3. [ ] Each chunk gets an embedding from Ollama (configurable via `OLLAMA_BASE_URL`)
4. [ ] All chunks are inserted into the vector store and rowids returned in response
5. [ ] Missing files returns HTTP 400 with field-level errors
6. [ ] Content-Type mismatch returns HTTP 400
7. [ ] >100 files returns HTTP 400
8. [ ] CORS headers present on all responses (including error responses)
9. [ ] Ollama unavailability causes graceful degradation (not server crash)
10. [ ] Chunking is deterministic (same input → same chunk boundaries)
11. [ ] Zero TypeScript build errors (`tsc -b` passes clean)
12. [ ] All unit + integration tests pass
13. [ ] `chunkByWords`, `validateFiles`, and `createImportRoute` are exported for testing
