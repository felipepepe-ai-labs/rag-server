import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
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

-- SYNC TRIGGERS (IF NOT EXISTS for idempotent re-init)
CREATE TRIGGER IF NOT EXISTS vector_ai AFTER INSERT ON vectors BEGIN
  INSERT INTO vectors_fts(rowid, text) VALUES (new.id, new.text);
END;

CREATE TRIGGER IF NOT EXISTS vector_au AFTER UPDATE ON vectors BEGIN
  UPDATE vectors_fts SET text=new.text WHERE rowid=new.id;
END;

CREATE TRIGGER IF NOT EXISTS vector_ad AFTER DELETE ON vectors BEGIN
  DELETE FROM vectors_fts WHERE rowid=old.id;
END;
`;

export interface DBEngine {
  db: Database.Database;
  init(): void;
}

/** Engine backed by better-sqlite3 with WAL mode and FK enforcement. */
class Engine implements DBEngine {
  public readonly db: Database.Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL') as string;
    this.db.pragma('foreign_keys = ON');
  }

  /** Run DDL schema. FTS5 tables must not be in a transaction. */
  init(): void {
    this.db.exec(SCHEMA);
  }
}

// Module-level singleton — lazy on first access
let _engine: DBEngine | undefined;

export function getEngine(dbPath: string): DBEngine {
  if (!_engine) _engine = new Engine(dbPath);
  return _engine;
}
