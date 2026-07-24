import { env } from '../config/env.js';
import type { VectorStore, SearchResult } from '../db/vector-store.js';

/** Query parameter interface for GET /search. */
export interface SearchQuery {
  q: string;
}

/** Structured response envelope for search results. */
export interface SearchResponse {
  query: string;
  topK: number;
  results: SearchResult[];
}

/** Sanitize user input for safe FTS5 MATCH (escape special chars, quote each term). */
function sanitizeFtsQuery(raw: string): string {
  return raw.trim().split(/\s+/).map((term) => {
    // Escape FTS5 special characters to prevent injection and parse errors
    const escaped = term.replace(/["{}*\-+]/g, '');
    return `"${escaped}"`;
  }).join(' ');
}

/** Factory that produces a /search route handler. */
export function createSearchRoute(vstore: VectorStore) {
  return async (query: SearchQuery): Promise<SearchResponse> => {
    const q = query.q ?? '';
    if (!q.trim()) {
      return { query: '', topK: env.searchTopK, results: [] };
    }

    // FTS5 candidate fetch + cosine ranking (empty vec → FTS-only scoring)
    const ftsQuery = sanitizeFtsQuery(q);
    const results = vstore.search(ftsQuery, [], env.searchTopK);

    return { query: q, topK: env.searchTopK, results };
  };
}
