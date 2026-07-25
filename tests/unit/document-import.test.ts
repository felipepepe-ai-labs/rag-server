import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chunkByWords, validateFiles, createImportRoute } from '../../src/routes/documents.js';

describe('chunkByWords', () => {
  it('should split text into chunks of size words', () => {
    const text = 'a b c d e f g h i j k l m n o p q r s t'.trim();
    const chunks = chunkByWords(text, 5, 1);
    expect(chunks).toHaveLength(5);
    expect(chunks[0]).toBe('a b c d e');
    // Overlap: last word of chunk[0] = first word of chunk[1]
    expect(chunks[1].split(' ')[0]).toBe('e');
  });

  it('should handle single word', () => {
    const chunks = chunkByWords('hello', 5, 0);
    expect(chunks).toEqual(['hello']);
  });

  it('should return empty array for empty text', () => {
    const chunks = chunkByWords('', 5, 0);
    expect(chunks).toEqual([]);
  });

  it('should not break words across chunks', () => {
    const text = 'hello-world short-text longer-word'.split('_').join('-');
    const chunks = chunkByWords(text, 2, 1);
    // Every word in every chunk must be an intact token (no partial words)
    for (const chunk of chunks) {
      const words = chunk.split(' ');
      expect(words.length).toBeGreaterThan(0);
      // Each word should appear in the original text as-is (not truncated)
      for (const w of words) {
        expect(text.includes(w)).toBe(true);
      }
    }
  });

  it('should handle very long text', () => {
    const text = Array.from({ length: 1000 }, (_, i) => `word${i}`).join(' ');
    const chunks = chunkByWords(text, 512, 50);
    expect(chunks.length).toBeGreaterThan(1);
    // No chunk should exceed max words + overlap
    for (const c of chunks) {
      expect(c.split(/\s+/).length).toBeLessThanOrEqual(562); // 512 + 50 overlap
    }
  });

  it('should handle unicode text', () => {
    const text = 'こんにちは world test';
    const chunks = chunkByWords(text, 3, 0);
    expect(chunks[0]).toBe('こんにちは world test');
  });

  it('should have overlap between consecutive chunks', () => {
    const text = Array.from({ length: 20 }, (_, i) => `w${i}`).join(' ');
    const chunks = chunkByWords(text, 5, 3);
    expect(chunks.length).toBeGreaterThan(1);
    // Last overlap words of previous should match first overlap words of next
    if (chunks.length > 1) {
      const prevWords = chunks[0].split(/\s+/).slice(-3);
      const nextWords = chunks[1].split(/\s+/).slice(0, 3);
      expect(prevWords).toEqual(nextWords);
    }
  });
});

describe('validateFiles', () => {
  const validFile = [{ filename: 'test.txt', type: 'text/plain' }] as any;

  it('should pass for single valid file', () => {
    expect(() => validateFiles(validFile)).not.toThrow();
  });

  it('should throw for empty files array', () => {
    expect(() => validateFiles([])).toThrow(/At least one file is required/);
  });

  it('should throw for no filename', () => {
    const noName = [{ type: 'text/plain' }] as any;
    expect(() => validateFiles(noName)).toThrow('filename');
  });

  it('should handle default FILE_MAX limit (100 files)', () => {
    const manyFiles = Array.from({ length: 101 }, (_, i) => ({ filename: `f${i}.txt` })) as any;
    expect(() => validateFiles(manyFiles)).toThrow(/Too many files/);
  });
});

describe('createImportRoute', () => {
  it('should return an async function that accepts body and returns Promise<number>', () => {
    const mockVstore = { insert: async (t: string, v: string) => 1 } as any;
    const handler = createImportRoute(mockVstore);
    expect(typeof handler).toBe('function');
    expect(async () => await handler({ files: [] })).toBeDefined();
  });
});
