import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';

const SERVER_PATH = new URL('../../dist/server/index.js', import.meta.url).pathname;
let proc: ChildProcess | undefined;

beforeAll(async () => {
  process.env.RAG_DB_PATH = ':memory:';
  proc = spawn('node', [SERVER_PATH], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server startup timeout')), 5000);
    proc!.stdout!.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('listening on http://localhost')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    proc!.stderr!.on('data', () => {});
  });
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
});

describe('POST /insert endpoint', () => {
  it('should return 201 with id for valid insert', async () => {
    const res = await fetch('http://localhost:3000/insert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hello world', vec_json: [0.1, 0.2, 0.3] }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeGreaterThan(0);
  });

  it('should reject missing text field', async () => {
    const res = await fetch('http://localhost:3000/insert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vec_json: [1, 2, 3] }),
    });
    expect(res.status).toBe(400);
  });

  it('should reject empty string text', async () => {
    const res = await fetch('http://localhost:3000/insert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '', vec_json: [1, 2, 3] }),
    });
    expect(res.status).toBe(400);
  });

  it('should reject missing vec_json field', async () => {
    const res = await fetch('http://localhost:3000/insert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hello' }),
    });
    expect(res.status).toBe(400);
  });

  it('should reject non-array vec_json', async () => {
    const res = await fetch('http://localhost:3000/insert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hello', vec_json: 'not-an-array' }),
    });
    expect(res.status).toBe(400);
  });

  it('should reject empty array vec_json', async () => {
    const res = await fetch('http://localhost:3000/insert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hello', vec_json: [] }),
    });
    expect(res.status).toBe(400);
  });

  it('should reject null text', async () => {
    const res = await fetch('http://localhost:3000/insert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: null, vec_json: [1, 2, 3] }),
    });
    expect(res.status).toBe(400);
  });

  it('should reject null vec_json', async () => {
    const res = await fetch('http://localhost:3000/insert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hello', vec_json: null }),
    });
    expect(res.status).toBe(400);
  });

  it('should reject vec_json with non-number elements', async () => {
    const res = await fetch('http://localhost:3000/insert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hello', vec_json: [1, NaN, 3] }),
    });
    expect(res.status).toBe(400);
  });

  it('should accept minimal valid input (1-char text, 1-element array)', async () => {
    const res = await fetch('http://localhost:3000/insert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'a', vec_json: [0] }),
    });
    expect(res.status).toBe(201);
  });

  it('should return CORS headers on insert response', async () => {
    const res = await fetch('http://localhost:3000/insert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'cors test', vec_json: [1, 2, 3] }),
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('should return consistent id for sequential inserts', async () => {
    const res1 = await fetch('http://localhost:3000/insert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'first', vec_json: [1, 0, 0] }),
    });
    const body1 = await res1.json();

    const res2 = await fetch('http://localhost:3000/insert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'second', vec_json: [0, 1, 0] }),
    });
    const body2 = await res2.json();

    expect(body2.id).toBeGreaterThan(body1.id);
  });

  it('should handle concurrent inserts without crash', async () => {
    const promises = Array.from({ length: 5 }, (_, i) =>
      fetch('http://localhost:3000/insert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `concurrent-${i}`, vec_json: [i * 0.1, 0.5, 0.5] }),
      }),
    );
    const responses = await Promise.all(promises);
    expect(responses).toHaveLength(5);
    for (const r of responses) {
      expect(r.status).toBe(201);
    }
  });

  it('should not crash server after many inserts', async () => {
    const promises = Array.from({ length: 50 }, (_, i) =>
      fetch('http://localhost:3000/insert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `load-${i}`, vec_json: [i / 100, 0.5, 0.5] }),
      }),
    );
    const responses = await Promise.all(promises);
    expect(responses.filter((r) => r.status === 201)).toHaveLength(50);
  });

  it('should accept text with special characters', async () => {
    const res = await fetch('http://localhost:3000/insert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: "it's a <test> & \"quote\"", vec_json: [1, 2, 3] }),
    });
    expect(res.status).toBe(201);
  });

  it('should accept unicode text', async () => {
    const res = await fetch('http://localhost:3000/insert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'こんにちは世界 🚀', vec_json: [1, 2, 3] }),
    });
    expect(res.status).toBe(201);
  });

  it('should reject text exceeding max length (8193 chars)', async () => {
    const res = await fetch('http://localhost:3000/insert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'x'.repeat(8193), vec_json: [1] }),
    });
    expect(res.status).toBe(400);
  });
});
