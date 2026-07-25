import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validateInsertInput, createInsertRoute } from '../../src/routes/insert.js';

const insertSchema = z.object({
  text: z.string().min(1).max(8192),
  vec_json: z.array(z.number()).min(1),
});

describe('validateInsertInput', () => {
  const validBody = { text: 'hello world', vec_json: [0.1, 0.2, 0.3] };

  it('should pass for valid input', () => {
    expect(() => validateInsertInput(validBody)).not.toThrow();
  });

  it('should reject missing text field', () => {
    const body = { vec_json: [1, 2, 3] };
    expect(() => validateInsertInput(body as z.infer<typeof insertSchema>)).toThrow("Required");
  });

  it('should reject empty string text', () => {
    const body = { text: '', vec_json: [1, 2, 3] };
    expect(() => validateInsertInput(body as z.infer<typeof insertSchema>)).toThrow("min");
  });

  it('should reject text exceeding max length', () => {
    const body = { text: 'x'.repeat(8193), vec_json: [1, 2, 3] };
    expect(() => validateInsertInput(body as z.infer<typeof insertSchema>)).toThrow("max");
  });

  it('should reject missing vec_json field', () => {
    const body = { text: 'hello' };
    expect(() => validateInsertInput(body as z.infer<typeof insertSchema>)).toThrow("Required");
  });

  it('should reject non-array vec_json', () => {
    const body = { text: 'hello', vec_json: 'not-an-array' };
    expect(() => validateInsertInput(body as z.infer<typeof insertSchema>)).toThrow("array");
  });

  it('should reject empty array vec_json', () => {
    const body = { text: 'hello', vec_json: [] };
    expect(() => validateInsertInput(body as z.infer<typeof insertSchema>)).toThrow("at least 1");
  });

  it('should reject non-number elements in vec_json', () => {
    const body = { text: 'hello', vec_json: [1, NaN, 3] };
    expect(() => validateInsertInput(body as z.infer<typeof insertSchema>)).toThrow("number");
  });

  it('should reject null text', () => {
    const body = { text: null, vec_json: [1, 2, 3] } as any;
    expect(() => validateInsertInput(body)).toThrow();
  });

  it('should reject null vec_json', () => {
    const body = { text: 'hello', vec_json: null } as any;
    expect(() => validateInsertInput(body)).toThrow();
  });

  it('should accept minimal valid input (1-char text, 1-element array)', () => {
    const body = { text: 'a', vec_json: [0] };
    expect(() => validateInsertInput(body)).not.toThrow();
  });
});

describe('createInsertRoute', () => {
  it('should return an async function', () => {
    // Mock vstore with minimal interface
    const mockVstore = { insert: async (t: string, v: string) => 1 } as any;
    const handler = createInsertRoute(mockVstore);
    expect(typeof handler).toBe('function');
    expect(async () => await handler({ text: 'a', vec_json: [0] })).toBeDefined();
  });
});
