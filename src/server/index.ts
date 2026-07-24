import { createServer } from 'node:http';
import Database from 'better-sqlite3';
import { Elysia } from 'elysia';
import { getEngine, type DBEngine } from '../db/engine.js';
import { VectorStore } from '../db/vector-store.js';
import { createSearchRoute, type SearchQuery, type SearchResponse } from '../routes/search.js';
import { env } from '../config/env.js';

// --- Initialize DB engine + schema ---
const engine: DBEngine = getEngine(env.dbPath);
engine.init();

// --- Create vector store wrapper ---
const vstore = new VectorStore(engine.db);
vstore.prepare();

// --- Route handlers ---
const healthHandler = () => ({ status: 'ok', uptime: process.uptime() });

const searchHandler = createSearchRoute(vstore);

// --- Elysia app bootstrap with CORS via derive (headers attached per-response) ---
export const app = new Elysia({ prefix: '' })
  .derive(({ set, request }) => {
    if (env.corsAllowOrigin === '*') {
      set.headers['Access-Control-Allow-Origin'] = '*';
      set.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
      set.headers['Access-Control-Allow-Headers'] = 'Content-Type';
    }
    return {};
  })
  .get('/health', healthHandler)
  .get(
    '/search',
    (ctx) => {
      const q = ctx.query.q ?? '';
      return searchHandler({ q });
    },
  )
  .onError(({ code, error, set }) => {
    if (code === 'INTERNAL_SERVER_ERROR') {
      set.status = 500;
      return { status: 'error', message: 'Internal server error' };
    }
    if (error instanceof Error) {
      set.status = 400;
      return { status: 'error', message: error.message };
    }
  });

// --- Start server via Node.js http adapter ---
function toNodeHandler(appInstance: typeof app) {
  return async (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://localhost:${env.port}`);
    let body: ReadableStream | undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve) => {
        req.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        req.on('end', () => {
          if (chunks.length > 0) {
            body = new ReadableStream({
              start(controller) { controller.enqueue(Buffer.concat(chunks)); controller.close(); },
            });
          }
          resolve();
        });
      });
    }
    const headers = Object.entries(req.headers as Record<string, string>).map(
      ([k, v]) => [k.toLowerCase(), v] as [string, string],
    );
    const response = await appInstance.handle(new Request(url.toString(), {
      method: req.method ?? 'GET',
      headers,
      body: body ?? undefined,
    }));
    for (const [key, value] of response.headers.entries()) {
      res.setHeader(key, value);
    }
    const buf = Buffer.from(await response.arrayBuffer());
    res.end(buf);
  };
}

const server = createServer(toNodeHandler(app));
server.listen(env.port, () => {
  console.log(`RAG server listening on http://localhost:${env.port}`);
});

// --- Graceful shutdown ---
process.on('SIGINT', () => { engine.db.close(); server.close(() => process.exit(0)); });
process.on('SIGTERM', () => { engine.db.close(); server.close(() => process.exit(0)); });
