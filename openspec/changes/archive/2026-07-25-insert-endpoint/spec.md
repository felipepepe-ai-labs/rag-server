# Specification: POST /insert Endpoint (insert-endpoint)

## Scope

### In scope
- Zod validation schema for `{ text: string, vec_json: number[] }` input
- Route handler factory `createInsertRoute(vstore)` that validates and persists via VectorStore
- Server registration of `POST /insert` on Elysia app
- Unit tests (validation + route factory)
- Integration tests (HTTP-level via real server)

### Out of scope
- Batch/bulk insert (separate change)
- Ollama embedding generation inline (separate change)
- Authorization or rate limiting (Phase 3)
- File upload or multi-part form data

---

## API Contract

### Request

```
POST /insert
Content-Type: application/json

{
  "text": "<string 1-8192 chars>",
  "vec_json": [<number>, <number>, ...]  // min 1 element
}
```

| Field | Type | Constraints |
|-------|------|-------------|
| `text` | string | Required, min length 1, max length 8192 |
| `vec_json` | number[] | Required, array of numbers, min length 1 |

### Response — Success (HTTP 201 Created)

```json
{
  "id": <number>
}
```

- `id`: the rowid returned from `VectorStore.insert()` cast to `Number`
- Content-Type: `application/json`

### Response — Validation Error (HTTP 400 Bad Request)

```json
{
  "status": "error",
  "message": "<structured Zod error message>"
}
```

| Scenario | Status | Message pattern |
|----------|--------|-----------------|
| Missing `text` | 400 | `Required` |
| `text` is empty string | 400 | `min` (must be at least 1 character) |
| `text` exceeds 8192 chars | 400 | `max` (must be at most 8192 characters) |
| Missing `vec_json` | 400 | `Required` |
| `vec_json` not an array | 400 | `array` |
| `vec_json` has non-number element | 400 | `number` |
| `vec_json` is empty array | 400 | `at least 1` (must contain at least 1 element) |
| Both fields invalid | 400 | Single error for first failing field |

### Response — Server Error (HTTP 500 Internal Server Error)

```json
{
  "status": "error",
  "message": "Internal server error"
}
```

---

## Database Integration

- **Table**: `vectors` (existing schema)
  - `text TEXT NOT NULL` — stored as-is from input
  - `vec_json TEXT NOT NULL` — the vec_json array serialized via `JSON.stringify()`
- **FTS5 trigger**: `vector_ai` fires automatically on INSERT, populates `vectors_fts` content table
- **Column mapping**: No new columns; inserts into existing `text` + `vec_json` columns

## Validation Rules

All validation is performed by Zod schema before any database interaction:

```typescript
z.object({
  text: z.string().min(1).max(8192),
  vec_json: z.array(z.number()).min(1),
});
```

- **text**: must be a string, minimum 1 character, maximum 8192 characters
- **vec_json**: must be an array where every element is a JavaScript `number` (NaN passes Zod number check — callers should validate if needed)
- Empty arrays are rejected (`min(1)`)

## Error Handling Specification

| Layer | Error Type | Handling |
|-------|-----------|----------|
| Validation | ZodError | Caught, returns HTTP 400 with `err.errors[0].message` |
| VectorStore | "VectorStore not prepared" (Error) | Thrown up — results in HTTP 500 via Elysia onError handler |
| JSON.stringify | TypeError | Unlikely but would result in HTTP 500 |

## Integration Requirements

### Server wiring (`src/server/index.ts`)
1. Import `createInsertRoute` from `../routes/insert.js`
2. Create handler: `const insertHandler = createInsertRoute(vstore)`
3. Register route: `.post('/insert', async (ctx) => { ... })`
4. Handler must: parse JSON body → pass to insertHandler → return Response with 201 + `{ id }`

### CORS
- CORS headers (`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`) are applied per-response via Elysia `.derive()` — the /insert endpoint inherits these automatically.

### Dependencies
- No new npm dependencies; uses existing `zod` (already in node_modules via @elysiajs)
- Uses existing `VectorStore` class from `src/db/vector-store.js`

## Acceptance Criteria

1. [ ] `POST /insert` with valid `{ text, vec_json }` returns HTTP 201 + `{ id: number }`
2. [ ] Invalid inputs return HTTP 400 with structured error message
3. [ ] Missing required fields return HTTP 400 with field-level errors
4. [ ] Input validation via Zod schema (text 1-8192 chars, vec_json valid number array min 1)
5. [ ] No TypeScript build errors (`tsc -b` passes clean)
6. [ ] All tests pass (unit + integration)
7. [ ] Inserted row is queryable via `GET /search?q=<text>` in subsequent requests
8. [ ] Sequential inserts produce incrementing IDs
9. [ ] Concurrent inserts (5+ simultaneous) do not crash the server
10. [ ] Unicode and special character text is accepted without errors
