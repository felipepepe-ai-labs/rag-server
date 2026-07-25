# Design: Bulk Import Endpoint (POST /documents/import)

## Architecture Decision Log

### ADR-005: Stream-based multipart handling over form-data middleware
**Context**: Elysia doesn't ship with a built-in multipart/form-data middleware. External packages add weight. For now, we only need to read file streams from the request body.
**Decision**: Use Node.js `http.IncomingMessage` parsing in the server adapter directly — extract filename from Content-Disposition header, read chunks as strings. No external deps for this phase.
**Consequences**:
- More code in the handler than using a middleware, but zero new deps
- Simpler to test since we control the stream parsing
- In Phase 3 we may add `@elysiajs/form-data` if multipart grows

### ADR-006: Chunking by word boundaries with configurable size and overlap
**Context**: Need to split large documents into chunks suitable for embedding.
**Decision**: Default chunk size = 512 words, overlap = 50 words (last N words of previous chunk become first N of next). Chunks split at whitespace boundaries (no partial words).
**Consequences**:
- Deterministic chunking (same input → same chunks) — important for dedup later
- Overlap preserves context across boundaries
- Configurable via env vars: CHUNK_SIZE, CHUNK_OVERLAP

### ADR-007: Ollama embedding client with configurable model and base URL
**Context**: Embeddings need to come from somewhere. Ollama provides a local API for this.
**Decision**: POST to `{OLLAMA_BASE_URL}/api/embed` with `model` (defaults to nomic-embed-text) and text payload. Each chunk sent individually (not batched in Phase 1).
**Consequences**:
- Requires Ollama running at the configured base URL
- If Ollama is down, the endpoint returns 502 with actionable error message
- Batch embedding is a Phase 2 optimization (reduce HTTP calls)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/routes/documents.ts` | **Create** | Chunker + Ollama embed client + createImportRoute factory |
| `src/server/index.ts` | **Edit** | Register POST /documents/import, wire to importHandler |
| `tests/unit/document-import.test.ts` | **Create** | Unit tests for chunker, validateFiles, embedding mock |
| `tests/integration/document-import.test.ts` | **Create** | Integration tests via HTTP (spawn server) with real Ollama mock via test env |

## API Contract

### Request
```
POST /documents/import
Content-Type: multipart/form-data
files=[file1.txt], files=[file2.md]
```

### Response (success — 202 Accepted)
```json
{
  "status": "ok",
  "inserted": 47,
  "sources": [
    { "filename": "doc1.txt", "chunks": 30 },
    { "filename": "doc2.md", "chunks": 17 }
  ]
}
```

### Response (error — 400/500)
```json
{
  "status": "error",
  "message": "...",
  "details": {}
}
```

## Error Scenarios

| Scenario | HTTP | Validation |
|----------|------|------------|
| No files in request | 400 | `'files' is required` |
| File has no filename | 400 | `filename required for uploaded file` |
| Ollama unavailable (503) | 502 | `OLLAMA_BASE_URL unreachable — set env var to your Ollama instance URL` |
| Embedding model missing | 502 | `embedding model not available: ${model}` |
| Chunk too large after parsing (>1M chars) | 400 | `chunk size exceeded: ${size} bytes` |
| Total files > limit (env FILE_MAX, default 100) | 400 | `too many files: max ${FILE_MAX}` |

## Architecture Diagram

```
POST /documents/import (multipart/form-data)
    │
    ├─▶ validateFiles() — check count + filenames
    │
    ├─▶ readEachFile() — extract content as text
    │      │
    │      └─▶ chunkByWords(text, 512, 50) → string[]
    │             │
    │             └─▶ ollamaEmbed(chunk) → number[] (via {OLLAMA_BASE_URL}/api/embed)
    │                    │
    │                    └─▶ vstore.insert(text, JSON.stringify(vec)) → rowid
    │
    └─▶ return { status: "ok", inserted: N, sources: [...] }
```

## Component Contracts

### chunkByWords(text: string, size: number, overlap: number): string[]

Splits text into overlapping chunks at word boundaries.

**Guarantees**:
- Each chunk has ≤ `size` words (last one may have fewer)
- Overlap preserves last N words of previous chunk as first N of next
- Empty input returns `[]`
- Single-word input returns `[word]`

### validateFiles(files: FormDataEntry[]): void | never

Validates the uploaded files before processing.

**Rules**:
- Must have at least 1 file
- Each file must have a filename property
- Total count ≤ FILE_MAX (env, default 100)

### ollamaEmbed(text: string): Promise<number[]>

Fetches embedding from Ollama API.

**Endpoint**: `POST {OLLAMA_BASE_URL}/api/embed`
**Body**: `{ model: EMBEDDING_MODEL, input: text }`
**Returns**: `embeddings[0]` (first embedding vector as number[])
**Throws**: TypeError/HTTP error if Ollama unreachable or model unavailable

### createImportRoute(vstore: VectorStore): RouteHandler

Factory that produces the import handler. Returns an async function compatible with Elysia's `.post()` signature.

**Behavior**:
1. Extracts files from request body (stream)
2. For each file, chunks content → embeds → inserts
3. Collects results per source file
4. Returns 202 with `{ inserted, sources }` on success
5. Returns appropriate error codes for failures
