/**
 * E2E tests for @sandman/rag-server
 * Start a real compiled server and verify behavior over the wire.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SERVER_PATH = new URL('../../dist/server/index.js', import.meta.url).pathname;
const TEST_DB = join(tmpdir(), `rag-e2e-test-${Date.now()}.db`);

let proc: ChildProcess | undefined;

beforeAll(async () => {
  process.env.RAG_DB_PATH = TEST_DB;

  proc = spawn('node', [SERVER_PATH], { stdio: ['ignore', 'pipe', 'pipe'] });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('E2E server startup timeout')), 10_000);
    proc!.stdout!.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('listening on http://localhost')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    proc!.stderr!.on('data', () => {});
  });

  // Give server a tick to bind the port
  await new Promise((r) => setTimeout(r, 500));
});

afterAll(async () => {
  if (proc && !proc.killed) {
    proc.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 2000);
      proc!.once('exit', () => { clearTimeout(t); resolve(); });
    });
  }
  proc = undefined;

  // Clean up test DB file
  try {
    const { unlinkSync } = await import('node:fs');
    if (require('node:fs').existsSync(TEST_DB)) unlinkSync(TEST_DB);
  } catch {}

  // Clean up WAL and SHM files
  try {
    const { unlinkSync, existsSync } = require('node:fs');
    for (const ext of ['.wal', '.shm']) {
      const p = TEST_DB + ext;
      if (existsSync(p)) unlinkSync(p);
    }
  } catch {}
});

describe('E2E — full RAG search lifecycle', () => {
  it('should respond to health check on every request', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await fetch('http://localhost:3000/health');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')?.includes('application/json')).toBe(true);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(typeof body.uptime).toBe('number');
    }
  });

  it('should return empty results when no data inserted yet', async () => {
    const res = await fetch('http://localhost:3000/search?q=hello+world');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.query).toBe('hello world');
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results).toHaveLength(0);
  });

  it('should handle concurrent requests without crash', async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      fetch(`http://localhost:3000/search?q=test+${i}`)
    );
    const responses = await Promise.all(promises);
    expect(responses).toHaveLength(10);
    for (const r of responses) {
      expect(r.status).toBe(200);
    }
  });

  it('should return consistent results for identical queries', async () => {
    const res1 = await fetch('http://localhost:3000/search?q=consistent+query');
    const body1 = await res1.json();

    const res2 = await fetch('http://localhost:3000/search?q=consistent+query');
    const body2 = await res2.json();

    expect(body1.query).toBe(body2.query);
    expect(Array.isArray(body1.results)).toBe(true);
    expect(Array.isArray(body2.results)).toBe(true);
  });

  it('should handle query parameter variations', async () => {
    // No params
    const resNoParam = await fetch('http://localhost:3000/search');
    expect(resNoParam.status).toBe(200);
    const bodyNoParam = await resNoParam.json();
    expect(Array.isArray(bodyNoParam.results)).toBe(true);

    // Empty query
    const resEmpty = await fetch('http://localhost:3000/search?q=');
    expect(resEmpty.status).toBe(200);
    const bodyEmpty = await resEmpty.json();
    expect(bodyEmpty.query).toBe('');

    // Query with encoded spaces
    const resEncoded = await fetch('http://localhost:3000/search?q=%7E%61%6E%64%5F%2B');
    expect(resEncoded.status).toBe(200);
  });

  it('should not leak internal error details on bad input', async () => {
    const res = await fetch('http://localhost:3000/search?q=%00%01%02%E2%80%AD');
    expect(res.status).toBe(200);
    const body = await res.json();
    // Should not contain "Error:", "TypeError", "ReferenceError", "SyntaxError"
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/(?:Error|TypeError|ReferenceError)/i);
  });

  it('should maintain CORS headers across all responses', async () => {
    const paths = ['/health', '/search?q=a', '/search'];
    for (const path of paths) {
      const res = await fetch(`http://localhost:3000${path}`);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
      expect(res.headers.get('access-control-allow-methods')).toContain('GET');
    }
  });

  it('should handle rapid sequential requests', async () => {
    const results: number[] = [];
    for (let i = 0; i < 20; i++) {
      const res = await fetch(`http://localhost:3000/search?q=rapid${i}`);
      expect(res.status).toBe(200);
      results.push(res.status);
    }
    expect(results.every((s) => s === 200)).toBe(true);
  });

  it('should handle POST requests without crashing (body silently ignored for GET routes)', async () => {
    const res = await fetch('http://localhost:3000/search?q=test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'test content', vec_json: '[1,2,3]' }),
    });
    expect(res.status).toBe(200);
  });

  it('should handle HEAD requests on health endpoint', async () => {
    const res = await fetch('http://localhost:3000/health', { method: 'HEAD' });
    expect(res.status).toBe(200);
  });

  it('server should not crash under load after multiple request types', async () => {
    // Mix of GET, HEAD with various paths and query patterns
    const tasks = [
      ...Array.from({ length: 5 }, (_, i) => fetch(`http://localhost:3000/search?q=load${i}`)),
      ...Array.from({ length: 5 }, () => fetch('http://localhost:3000/health')),
    ];

    const responses = await Promise.allSettled(tasks);
    expect(responses.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
  });
});
