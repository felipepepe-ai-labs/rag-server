# Design: POST /insert Endpoint

## Architecture Decision Log

### ADR-004: Zod schema over manual validation in route handler
**Context**: Input must be validated before database writes. Previous implementation avoided Zod to keep zero external deps; `@elysiajs/swagger` is already installed, confirming the Elysia ecosystem dependency chain.
**Decision**: Use a minimal inline Zod schema for `POST /insert` input — `{ text: z.string().min(1).max(8192), vec_json: z.array(z.number()).min(1) }`. No separate validation module; inline is sufficient for two fields.
**Consequences**:
- Zod types are inlined, no separate validator module needed
- Input rejected at HTTP boundary, never reaches VectorStore
- Error messages structured as `{ status: 'error', message: string }`

### ADR-005: 201 Created for successful insert
**Context**: REST conventions; previous search endpoint returns 200 GET.
**Decision**: Return HTTP 201 with `{ id, text, vec_json }` on success to signal resource creation.
**Consequences**: Clients can confirm insertion was persisted by checking status code and returned `id`.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/routes/insert.ts` | **Create** | Zod schema + route handler factory (mirrors search.ts pattern) |
| `src/server/index.ts` | **Edit** | Register POST /insert route, wire to insertHandler |
| `tests/unit/insert-route.test.ts` | **Create** | Unit tests for validateInsertInput + createInsertRoute |
| `tests/integration/insert.test.ts` | **Create** | Integration tests via HTTP (spawn server) |

## API Contract

### Request
```
POST /insert
Content-Type: application/json

{
  "text": "document text here",
  "vec_json": [0.1, 0.2, 0.3]
}
```

### Response (success)
```json
{
  "id": 1,
  "text": "document text here",
  "vec_json": [0.1, 0.2, 0.3]
}
```
Status: **201 Created**

### Response (error)
```json
{
  "status": "error",
  "message": "..."
}
```
Status: **400 Bad Request**

## Error Scenarios

| Scenario | HTTP | Validation |
|----------|------|------------|
| Missing `text` field | 400 | `'text' required` |
| `text` is empty string | 400 | `must be at least 1 character(s)` |
| `text` > 8192 chars | 400 | `must be at most 8192 characters` |
| Missing `vec_json` field | 400 | `'vec_json' required` |
| `vec_json` not an array | 400 | `expected array` |
| `vec_json` has non-number element | 400 | `expected number` |
| `vec_json` is empty array | 400 | `must contain at least 1 element(s)` |
| Both fields invalid | 400 | Single error (first failing field) |
