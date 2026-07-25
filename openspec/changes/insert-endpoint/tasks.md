# Tasks: POST /insert Endpoint

## Task 01 — Write Zod validation schema + route factory [DONE]
- Created `src/routes/insert.ts`
- Inline Zod schema: `{ text: z.string().min(1).max(8192), vec_json: z.array(z.number()).min(1) }`
- `validateInsertInput(body)` returns parsed object or throws ZodError with structured message
- `createInsertRoute(vstore)` returns async handler `(body) => Promise<{id: number}>`
- Zero external imports beyond zod + vector-store type
- Follows search.ts pattern: factory function → route handler
- **Committed**: `39bfad3 feat(rag-search): add POST /insert endpoint with Zod validation`

## Task 02 — Wire insert route on server [DONE]
- Wired into `src/server/index.ts`: import `createInsertRoute`, instantiate with vstore
- Registered `.post('/insert', async (ctx) => { ... })` on Elysia app chain
- Handler parses JSON body, calls validate + vstore.insert()
- Returns 201 `{ id }` on success, 400 on validation error
- No new dependencies; zod is already in node_modules via @elysiajs
- **Committed**: `39bfad3 feat(rag-search): add POST /insert endpoint with Zod validation`

## Task 03 — Unit tests [DONE]
- Created `tests/unit/insert-route.test.ts`
- Tests validateInsertInput happy path + all 7 error scenarios from design.md
- Tests createInsertRoute returns {id} for valid input
- Tests route factory throws if vstore not prepared
- **Actual**: 10 test cases (8 validation + 2 route factory)

## Task 04 — Integration tests [DONE]
- Created `tests/integration/insert.test.ts`
- Spawns real server, sends POST /insert via fetch
- Tests: 201 on valid insert, 400 on each validation error, CORS headers present
- Inserts rows then verifies they appear in GET /search results
- Additional tests: concurrent inserts (5+), load test (50 sequential), unicode/special chars
- **Actual**: 15 integration test cases

## Task 05 — Build + verify [DONE]
- `pnpm build` → zero errors
- `pnpm test` → all unit + integration tests pass
- Verified manually: `curl -X POST http://localhost:3000/insert ...` returns 201
- **Spec artifacts updated**: proposal.md, design.md, spec.md written in this cycle
