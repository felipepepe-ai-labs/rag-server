# Proposal: Bulk Import Endpoint (POST /documents/import)

## Intent
Add a `POST /documents/import` endpoint that accepts multipart/form-data with one or more files, chunks the content, generates embeddings via Ollama API (`/api/embed`), and persists all rows into rag-server's vector store. This is the missing ingestion layer to complete the RAG pipeline end-to-end — without it, users can only insert individual rows manually.

## Scope
- `src/routes/documents.ts` — multipart handler + chunker + Ollama embedding client
- `src/server/index.ts` — register POST /documents/import with cors middleware
- `tests/unit/document-import.test.ts` — unit tests for chunking, embedding, validation
- `tests/integration/document-import.test.ts` — integration tests via HTTP

## Non-goals
- File type parsing (only TXT/MD supported initially — content is read as text)
- PDF/DOCX processing (Phase 3 — add pdf-parse / mammoth deps then)
- Ollama configuration in env (assumes OLLAMA_BASE_URL env var, defaults to http://localhost:11434)
- Embedding model config per request (uses default model from environment: EMBEDDING_MODEL, defaults to nomic-embed-text)
- Batch embedding via Ollama API (single text for now — batches in Phase 2)

## Acceptance Criteria
1. `POST /documents/import` with one or more text files returns HTTP 202 + `{ inserted: number }`
2. Each file is chunked into ≤512-word segments with overlap
3. Each chunk gets an embedding from Ollama (configurable via OLLAMA_BASE_URL)
4. All chunks are inserted into the vector store and rowids returned
5. Invalid/missing files return HTTP 400 with field-level errors
6. CORS headers present on all responses
7. Zero build errors, all tests pass
8. Chunking is deterministic (same input → same chunk boundaries)

## API Contract

### Request
```
POST /documents/import
Content-Type: multipart/form-data
files=doc1.txt&files=doc2.md
```

### Response (success)
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

### Response (error)
```json
{
  "status": "error",
  "message": "...",
  "details": {}
}
```
