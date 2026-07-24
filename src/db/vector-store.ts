import type Database from 'better-sqlite3';

/** A row in the vectors table. */
export interface VectorRow {
  id: number;
  text: string;
  vec_json: string;
}

/** Ranked search result with cosine similarity score. */
export interface SearchResult {
  id: number;
  text: string;
  score: number;
}

const INSERT_SQL = 'INSERT INTO vectors (text, vec_json) VALUES (?, ?)';

/** Wrapper around a better-sqlite3 Database instance for vector ops. */
export class VectorStore {
  private insertStmt!: Database.Statement;
  private ftsMatchStmt!: Database.Statement;

  constructor(private db: Database.Database) {}

  /** Call once after schema init to prepare all statements. */
  prepare(): void {
    this.insertStmt = this.db.prepare(INSERT_SQL);
    // FTS5 uses special columns — rowid is always available as a virtual column
    this.ftsMatchStmt = this.db.prepare(
      'SELECT rowid, text FROM vectors_fts WHERE vectors_fts MATCH ? LIMIT ?',
    );
  }

  insert(text: string, vecJson: string): number {
    if (!this.insertStmt) throw new Error('VectorStore not prepared');
    const result = this.insertStmt.run([text, vecJson]);
    return Number(result.lastInsertRowid);
  }

  /** Fetch candidates by FTS5 MATCH, then rank via cosine similarity. */
  search(queryFts: string, queryVec: number[], topK: number): SearchResult[] {
    if (!this.ftsMatchStmt) throw new Error('VectorStore not prepared');

    // Step 1: get candidate rowids from FTS5
    const ftsRows = this.ftsMatchStmt.all(queryFts, topK * 2) as Array<{
      rowid: number;
      text: string;
    }>;

    if (ftsRows.length === 0) return [];

    // Step 2: fetch vec_json for all candidate ids
    const ids = ftsRows.map((r) => r.rowid);
    const placeholders = ids.map(() => '?').join(',');
    const vecStmt = this.db.prepare(
      `SELECT id, vec_json FROM vectors WHERE rowid IN (${placeholders})`,
    );
    const vecRows = vecStmt.all(...ids) as Array<{ id: number; vec_json: string }>;

    // Build lookup by id
    const vecLookup = new Map<number, string>();
    for (const r of vecRows) {
      vecLookup.set(Number(r.id), String(r.vec_json));
    }

    // Step 3: cosine similarity ranking (or FTS-only score if no query vector)
    if (queryVec.length === 0) {
      return ftsRows.map((r) => ({ id: r.rowid, text: r.text, score: 1.0 }));
    }

    const queryNorm = Math.sqrt(queryVec.reduce((s, v) => s + v * v, 0));
    if (queryNorm === 0) return [];

    const scored: SearchResult[] = [];
    for (const r of ftsRows) {
      const vecJson = vecLookup.get(r.rowid);
      if (!vecJson) continue;
      const vec = JSON.parse(vecJson) as number[];
      let dotProduct = 0;
      for (let j = 0; j < queryVec.length && j < vec.length; j++) {
        dotProduct += queryVec[j] * vec[j];
      }
      const vecNorm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
      if (vecNorm === 0) continue;
      scored.push({ id: r.rowid, text: r.text, score: dotProduct / (queryNorm * vecNorm) });
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }
}
