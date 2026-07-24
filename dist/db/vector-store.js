const INSERT_SQL = 'INSERT INTO vectors (text, vec_json) VALUES (?, ?)';
/** Wrapper around a better-sqlite3 Database instance for vector ops. */
export class VectorStore {
    db;
    insertStmt;
    ftsMatchStmt;
    constructor(db) {
        this.db = db;
    }
    /** Call once after schema init to prepare all statements. */
    prepare() {
        this.insertStmt = this.db.prepare(INSERT_SQL);
        // FTS5 uses special columns — rowid is always available as a virtual column
        this.ftsMatchStmt = this.db.prepare('SELECT rowid, text FROM vectors_fts WHERE vectors_fts MATCH ? LIMIT ?');
    }
    insert(text, vecJson) {
        if (!this.insertStmt)
            throw new Error('VectorStore not prepared');
        const result = this.insertStmt.run([text, vecJson]);
        return Number(result.lastInsertRowid);
    }
    /** Fetch candidates by FTS5 MATCH, then rank via cosine similarity. */
    search(queryFts, queryVec, topK) {
        if (!this.ftsMatchStmt)
            throw new Error('VectorStore not prepared');
        // Step 1: get candidate rowids from FTS5
        const ftsRows = this.ftsMatchStmt.all(queryFts, topK * 2);
        if (ftsRows.length === 0)
            return [];
        // Step 2: fetch vec_json for all candidate ids
        const ids = ftsRows.map((r) => r.rowid);
        const placeholders = ids.map(() => '?').join(',');
        const vecStmt = this.db.prepare(`SELECT id, vec_json FROM vectors WHERE rowid IN (${placeholders})`);
        const vecRows = vecStmt.all(...ids);
        // Build lookup by id
        const vecLookup = new Map();
        for (const r of vecRows) {
            vecLookup.set(Number(r.id), String(r.vec_json));
        }
        // Step 3: cosine similarity ranking (or FTS-only score if no query vector)
        if (queryVec.length === 0) {
            return ftsRows.map((r) => ({ id: r.rowid, text: r.text, score: 1.0 }));
        }
        const queryNorm = Math.sqrt(queryVec.reduce((s, v) => s + v * v, 0));
        if (queryNorm === 0)
            return [];
        const scored = [];
        for (const r of ftsRows) {
            const vecJson = vecLookup.get(r.rowid);
            if (!vecJson)
                continue;
            const vec = JSON.parse(vecJson);
            let dotProduct = 0;
            for (let j = 0; j < queryVec.length && j < vec.length; j++) {
                dotProduct += queryVec[j] * vec[j];
            }
            const vecNorm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
            if (vecNorm === 0)
                continue;
            scored.push({ id: r.rowid, text: r.text, score: dotProduct / (queryNorm * vecNorm) });
        }
        return scored.sort((a, b) => b.score - a.score).slice(0, topK);
    }
}
//# sourceMappingURL=vector-store.js.map