/** Typed access to process.env with sensible defaults for local dev. */

const num = (key: string, fallback: number): number => {
  const val = process.env[key];
  if (val === undefined || val === '') return fallback;
  const n = Number(val);
  return Number.isNaN(n) ? fallback : n;
};

export const env = Object.freeze({
  port: num('PORT', 3000),
  corsAllowOrigin: process.env.RAG_CORS_ALLOW_ORIGIN === '1' || process.env.RAG_CORS_ALLOW_ORIGIN === 'true' ? '*' : '*',
  dbPath: process.env.RAG_DB_PATH ?? './data/rag-data.db',
  searchTopK: num('RAG_SEARCH_TOP_K', 10),
  searchCandidates: num('RAG_SEARCH_CANDIDATES', 100),
});
