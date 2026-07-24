import { env } from '../config/env.js';
/** Sanitize user input for safe FTS5 MATCH (quote each term). */
function sanitizeFtsQuery(raw) {
    return raw.trim().split(/\s+/).map((term) => `"${term}"`).join(' ');
}
/** Factory that produces a /search route handler. */
export function createSearchRoute(vstore) {
    return async (query) => {
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
//# sourceMappingURL=search.js.map