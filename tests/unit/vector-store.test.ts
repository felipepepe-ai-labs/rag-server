import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { VectorStore } from '../../src/db/vector-store.js';

let db: Database.Database;
let store: VectorStore;

function createTestDB(): Database.Database {
  const d = new Database(':memory:');
  d.exec(`
    CREATE TABLE IF NOT EXISTS vectors (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      text     TEXT    NOT NULL,
      vec_json TEXT    NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS vectors_fts USING fts5(
      text,
      content='vectors',
      content_rowid='id'
    );
    CREATE TRIGGER IF NOT EXISTS vector_ai AFTER INSERT ON vectors BEGIN
      INSERT INTO vectors_fts(rowid, text) VALUES (new.id, new.text);
    END;
    CREATE TRIGGER IF NOT EXISTS vector_au AFTER UPDATE ON vectors BEGIN
      UPDATE vectors_fts SET text=new.text WHERE rowid=new.id;
    END;
    CREATE TRIGGER IF NOT EXISTS vector_ad AFTER DELETE ON vectors BEGIN
      DELETE FROM vectors_fts WHERE rowid=old.id;
    END;
  `);
  return d;
}

beforeEach(() => {
  db = createTestDB();
  store = new VectorStore(db);
  store.prepare();
});

afterEach(() => {
  if (db && !db.closed) db.close();
});

describe('VectorStore.insert', () => {
  it('should insert a row and return the lastInsertRowid', () => {
    const id = store.insert('hello world', '[1,2,3]');
    expect(id).toBeGreaterThan(0);
  });

  it('should auto-increment ids across multiple inserts', () => {
    const id1 = store.insert('first', '[1,0,0]');
    const id2 = store.insert('second', '[0,1,0]');
    const id3 = store.insert('third', '[0,0,1]');
    expect(id1).toBe(1);
    expect(id2).toBe(2);
    expect(id3).toBe(3);
  });

  it('should persist text for FTS5 search', () => {
    store.insert('vector database technology', '[1,0.5,0.3]');
    const rows = db.prepare(`SELECT COUNT(*) as cnt FROM vectors`).get() as { cnt: number };
    expect(rows.cnt).toBe(1);
  });

  it('should throw if not prepared', () => {
    const fresh = new VectorStore(db);
    expect(() => fresh.insert('x', '[1]')).toThrow('VectorStore not prepared');
  });
});

describe('VectorStore.search', () => {
  it('should return empty results for a store with no rows', () => {
    const results = store.search('"test"', [1, 0, 0], 10);
    expect(results).toEqual([]);
  });

  it('should find text via FTS5 MATCH without query vector', () => {
    store.insert('what is a vector database', '[1,0.5,0.3]');
    const results = store.search('"vector"', [], 10);
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('what is a vector database');
    // FTS-only scoring: all get score 1.0
    expect(results[0].score).toBe(1.0);
  });

  it('should find results by keyword', () => {
    store.insert('machine learning algorithms', '[0.8,0.2,0.1]');
    store.insert('neural network deep learning', '[0.3,0.9,0.4]');
    store.insert('vector database indexing', '[0.9,0.1,0.8]');

    const results = store.search('"learning"', [0.5, 0.5, 0.1], 10);
    expect(results).toHaveLength(2);
  });

  it('should rank by cosine similarity when query vector provided', () => {
    store.insert('apple pie recipe', '[0.9, 0.1, 0.0]');
    store.insert('banana split dessert', '[0.3, 0.7, 0.1]');
    store.insert('deep learning model training', '[0.1, 0.1, 0.9]');

    // Query "recipe" matches only "apple pie recipe" in FTS5
    const results = store.search('"recipe"', [0.9, 0.15, 0.0], 10);
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('apple pie recipe');
    // Cosine similarity with itself ≈ 1.0
    expect(results[0].score).toBeGreaterThan(0.99);
  });

  it('should rank multiple FTS candidates by cosine similarity', () => {
    // Query = [1, 0, 0] — pure direction along first dimension
    // doc1 ≈ 0.985, doc3 ≈ 0.609, doc2 ≈ 0.107
    store.insert('vector database technology', '[0.95, 0.03, 0.02]');
    store.insert('vector network deep learning', '[0.1, 0.85, 0.3]');
    store.insert('vector processing pipeline', '[0.5, 0.4, 0.5]');

    const results = store.search('"vector"', [1, 0, 0], 10);
    expect(results).toHaveLength(3);
    expect(results[0].text).toBe('vector database technology'); // highest cosine score (≈0.985)
    expect(results[2].text).toBe('vector network deep learning'); // lowest cosine score (≈0.107)
  });

  it('should limit results by topK', () => {
    for (let i = 0; i < 5; i++) {
      store.insert(`document ${i}`, `[${i},0.1,0.2]`);
    }
    const results = store.search('"document"', [0.5, 0.3, 0.1], 3);
    expect(results).toHaveLength(3);
  });

  it('should handle empty query vector (FTS-only scoring)', () => {
    store.insert('test content', '[0.5, 0.3, 0.1]');
    const results = store.search('"test"', [], 10);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(1.0);
  });

  it('should handle zero query norm gracefully', () => {
    store.insert('some content', '[0.5, 0.3, 0.1]');
    const results = store.search('"some"', [0, 0, 0], 10);
    expect(results).toEqual([]);
  });

  it('should handle partial vector dimension mismatch', () => {
    store.insert('short text', '[0.8]');
    const results = store.search('"short"', [0.5, 0.3, 0.1], 10);
    expect(results).toHaveLength(1);
    // dotProduct: 0.5 * 0.8 = 0.4 (only first dimension)
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('should update FTS via trigger on text update', () => {
    const id = store.insert('old text here', '[0.5, 0.3, 0.1]');
    // Manually update text (simulating what the spec describes)
    db.prepare("UPDATE vectors SET text='new text' WHERE id=?").run(id);

    const results = store.search('"new"', [], 10);
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('new text');
  });
});

describe('VectorStore.prepare', () => {
  it('should throw if search called before prepare', () => {
    const fresh = new VectorStore(db);
    expect(() => fresh.search('"test"', [1, 0, 0], 10)).toThrow('VectorStore not prepared');
  });

  it('should not throw when called twice (idempotent)', () => {
    store.prepare();
    expect(() => store.prepare()).not.toThrow();
    store.insert('hello', '[1]');
  });
});
