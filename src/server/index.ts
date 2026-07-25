import { createServer } from 'node:http';
import Database from 'better-sqlite3';
import { Elysia } from 'elysia';
import { z } from 'zod';
import { getEngine, type DBEngine } from '../db/engine.js';
import { VectorStore } from '../db/vector-store.js';
import { createSearchRoute, type SearchQuery, type SearchResponse } from '../routes/search.js';
import { createInsertRoute } from '../routes/insert.js';
import { createImportRoute } from '../routes/documents.js';
import { env } from '../config/env.js';

// --- Initialize DB engine + schema ---
const engine: DBEngine = getEngine(env.dbPath);
engine.init();

// --- Create vector store wrapper ---
const vstore = new VectorStore(engine.db);
vstore.prepare();

// --- CORS headers helper (shared with Elysia derive) ---
function corsHeaders(): Record<string, string> {
  if (env.corsAllowOrigin !== '*') return {};
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// --- Route handlers ---
const healthHandler = () => ({ status: 'ok', uptime: process.uptime() });

const searchHandler = createSearchRoute(vstore);
const insertHandler = createInsertRoute(vstore);
const importHandler = createImportRoute(vstore);

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
  .post('/insert', async (ctx) => {
      try {
        const body = ctx.body;
        const result = await insertHandler(body);
        return new Response(JSON.stringify(result), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        if (err instanceof z.ZodError) {
          return new Response(JSON.stringify({ status: 'error', message: err.errors[0].message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        throw err;
      }
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
    // Intercept /documents/import at raw HTTP level — needs raw IncomingMessage for multipart parsing
    if (req.url?.startsWith('/documents/import') && req.method === 'POST') {
      try {
        const response = await importHandler(req);
        res.writeHead(201, {
          'Content-Type': 'application/json',
          ...(env.corsAllowOrigin === '*' ? corsHeaders() : {}),
        });
        res.end(JSON.stringify(response));
        return;
      } catch (err) {
        if (err instanceof TypeError) {
          res.writeHead(400, {
            'Content-Type': 'application/json',
            ...(env.corsAllowOrigin === '*' ? corsHeaders() : {}),
          });
          res.end(JSON.stringify({ status: 'error', message: err.message }));
          return;
        }
        // Unexpected error — 500
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: 'Internal server error' }));
      }
      return;
    }

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
      duplex: 'half',
    }));
    res.statusCode = response.status;
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
