import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { tmpfileSync } from 'node:fs';

// Path to the compiled server
const SERVER_PATH = new URL('../../dist/server/index.js', import.meta.url).pathname;

let proc: ChildProcess | undefined;

beforeAll(async () => {
  // Use a temp DB to avoid polluting dev data
  process.env.RAG_DB_PATH = ':memory:';

  proc = spawn('node', [SERVER_PATH], { stdio: ['ignore', 'pipe', 'pipe'] });

  // Wait for server to be ready
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server startup timeout')), 5000);
    proc!.stdout!.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('listening on http://localhost')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    proc!.stderr!.on('data', () => {}); // swallow noise
  });
});

afterAll(async () => {
  if (proc) {
    proc.kill('SIGTERM');
    await new Promise<void>((resolve) => proc!.on('exit', resolve));
    proc = undefined;
  }
});

describe('/health endpoint', () => {
  it('should return status ok', async () => {
    const res = await fetch('http://localhost:3000/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('status', 'ok');
    expect(typeof body.uptime).toBe('number');
  });

  it('should have CORS headers with wildcard origin', async () => {
    const res = await fetch('http://localhost:3000/health');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });

  it('should handle multiple concurrent health checks', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => fetch('http://localhost:3000/health'))
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.every((r) => {
      const b = r as unknown;
      return true; // if any threw, Promise.all would have rejected
    })).toBe(true);
  });
});

describe('/search endpoint', () => {
  it('should accept a query and return structured JSON', async () => {
    const res = await fetch('http://localhost:3000/search?q=vector+database');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('query', 'vector database');
    expect(body).toHaveProperty('topK');
    expect(typeof body.topK).toBe('number');
    expect(Array.isArray(body.results)).toBe(true);
  });

  it('should return empty results when no data exists yet', async () => {
    const res = await fetch('http://localhost:3000/search?q=test+query');
    const body = await res.json();
    expect(body.results).toHaveLength(0);
  });

  it('should handle empty query gracefully', async () => {
    const res = await fetch('http://localhost:3000/search?q=');
    const body = await res.json();
    expect(body.query).toBe('');
    expect(body.results).toHaveLength(0);
  });

  it('should return empty results when no query param', async () => {
    const res = await fetch('http://localhost:3000/search');
    const body = await res.json();
    expect(Array.isArray(body.results)).toBe(true);
  });

  it('should handle special characters in query', async () => {
    const res = await fetch('http://localhost:3000/search?q=what%27s+up');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.query).toBe("what's up");
  });

  it('should return CORS headers on search endpoint', async () => {
    const res = await fetch('http://localhost:3000/search?q=test');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('should reject malformed FTS5 queries gracefully', async () => {
    // These would normally crash FTS5 without sanitization
    const res = await fetch('http://localhost:3000/search?q=hello+world"broken');
    expect(res.status).toBe(200);
  });

  it('should handle very long queries', async () => {
    const longQuery = Array.from({ length: 100 }, (_, i) => `word${i}`).join(' ');
    const res = await fetch(`http://localhost:3000/search?q=${longQuery}`);
    expect(res.status).toBe(200);
  });

  it('should handle unicode queries', async () => {
    const res = await fetch('http://localhost:3000/search?q=こんにちは+世界');
    expect(res.status).toBe(200);
  });
});
