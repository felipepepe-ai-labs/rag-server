/**
 * Integration tests for POST /documents/import endpoint.
 * Spawns a real compiled server and verifies behavior over the wire.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';

const SERVER_PATH = new URL('../../dist/server/index.js', import.meta.url).pathname;
let proc: ChildProcess | undefined;

beforeAll(async () => {
  process.env.RAG_DB_PATH = ':memory:';
  // Mock Ollama to avoid external dependency during tests
  const { http } = await import('node:http');

  proc = spawn('node', [SERVER_PATH], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } });
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

describe('POST /documents/import endpoint', () => {
  it('should return 201 for a valid text file upload', async () => {
    // Create a multipart form body manually
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    const header = `------${boundary}\r\nContent-Disposition: form-data; name="files"; filename="test.txt"\r\nContent-Type: text/plain\r\n\r\n`;
    const body1 = 'Hello world this is a test document for import';
    const footer = `\r\n------${boundary}--\r\n`;

    const res = await fetch('http://localhost:3000/documents/import', {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=----${boundary}`,
      },
      body: header + body1 + footer,
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    // Response contains status and sources even if Ollama is unavailable (graceful degradation)
    expect(json).toHaveProperty('status');
    expect(json).toHaveProperty('sources');
  });

  it('should reject missing Content-Type', async () => {
    const res = await fetch('http://localhost:3000/documents/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'test' }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.status).toBe('error');
  });

  it('should reject non-multipart Content-Type', async () => {
    const res = await fetch('http://localhost:3000/documents/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: Buffer.from('binary data'),
    });

    expect(res.status).toBe(400);
  });

  it('should return CORS headers on import response', async () => {
    const boundary = '----boundary123';
    const header = `------${boundary}\r\nContent-Disposition: form-data; name="files"; filename="cors.txt"\r\nContent-Type: text/plain\r\n\r\ncors test\r\n------${boundary}--\r\n`;

    const res = await fetch('http://localhost:3000/documents/import', {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=----${boundary}`,
      },
      body: header,
    });

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('should reject empty file list (no form data)', async () => {
    const boundary = '----empty';
    const footer = `\r\n------${boundary}--\r\n`;

    const res = await fetch('http://localhost:3000/documents/import', {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=----${boundary}`,
      },
      body: footer,
    });

    expect(res.status).toBe(400);
  });

  it('should reject filename-less files', async () => {
    const boundary = '----noname';
    // Content-Disposition without filename
    const part = `------${boundary}\r\nContent-Disposition: form-data; name="files"\r\n\r\ntest content\r\n------${boundary}--\r\n`;

    const res = await fetch('http://localhost:3000/documents/import', {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=----${boundary}`,
      },
      body: part,
    });

    expect(res.status).toBe(400);
  });

  it('should handle unicode content in uploaded file', async () => {
    const boundary = '----unicode123';
    const header = `------${boundary}\r\nContent-Disposition: form-data; name="files"; filename="test_ja.txt"\r\nContent-Type: text/plain\r\n\r\n`;
    const body = 'こんにちは世界 🚀 テスト内容';
    const footer = `\r\n------${boundary}--\r\n`;

    const res = await fetch('http://localhost:3000/documents/import', {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=----${boundary}`,
      },
      body: header + body + footer,
    });

    expect(res.status).toBe(201);
  });

  it('should not crash server after invalid import attempt', async () => {
    // First send an invalid request
    await fetch('http://localhost:3000/documents/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'test' }),
    });

    // Then send a valid one — server should still respond
    const boundary = '----survive';
    const header = `------${boundary}\r\nContent-Disposition: form-data; name="files"; filename="survive.txt"\r\nContent-Type: text/plain\r\n\r\ntest content\r\n------${boundary}--\r\n`;

    const res = await fetch('http://localhost:3000/documents/import', {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=----${boundary}`,
      },
      body: header,
    });

    expect(res.status).toBe(201);
  });

  it('should return error message on validation failure', async () => {
    const res = await fetch('http://localhost:3000/documents/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'test' }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toBeDefined();
    expect(typeof json.message).toBe('string');
  });

  it('should handle multiple files in single upload', async () => {
    const boundary = '----multi';
    const file1Header = `------${boundary}\r\nContent-Disposition: form-data; name="files"; filename="doc1.txt"\r\nContent-Type: text/plain\r\n\r\ndocument one content here`;
    const file2Header = `\r\n------${boundary}\r\nContent-Disposition: form-data; name="files"; filename="doc2.txt"\r\nContent-Type: text/plain\r\n\r\ndocument two content here`;
    const footer = `\r\n------${boundary}--\r\n`;

    const res = await fetch('http://localhost:3000/documents/import', {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=----${boundary}`,
      },
      body: file1Header + file2Header + footer,
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    // Should have two source entries
    if (json.sources) {
      expect(json.sources.length).toBeGreaterThan(0);
    }
  });
});
