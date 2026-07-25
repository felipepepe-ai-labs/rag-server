import { env } from '../config/env.js';
/** Chunk size and overlap from environment (configurable). */
const CHUNK_SIZE = env.searchTopK ?? 512;
const CHUNK_OVERLAP = Math.floor(CHUNK_SIZE * 0.1); // 10% overlap by default
const FILE_MAX = 100;
/** Read text content from request body (extracts multipart files). */
export async function readFileContents(req) {
    const chunks = [];
    await new Promise((resolve) => {
        req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        req.on('end', () => resolve());
    });
    const body = Buffer.concat(chunks);
    // Parse multipart/form-data boundaries
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.startsWith('multipart/form-data')) {
        throw new TypeError('Content-Type must be multipart/form-data');
    }
    const boundaryMatch = contentType.match(/boundary=(.+)$/);
    if (!boundaryMatch)
        throw new TypeError('Invalid Content-Type: no boundary found');
    const boundary = boundaryMatch[1];
    const sep = `\r\n--${boundary}\r\n`;
    const idx = body.indexOf(sep);
    if (idx === -1)
        throw new TypeError('Invalid multipart body: missing boundary separator');
    const parts = body.slice(idx + sep.length).toString().split(sep);
    // Remove trailing \r\n--boundary\r\n or \r\n--boundary--\r\n
    parts.pop();
    return parts.map((part) => {
        const headerMatch = part.match(/Content-Disposition:\s*form-data;\s*name="([^"]+)";\s*filename="([^"]*)"/);
        if (!headerMatch)
            throw new TypeError('Invalid multipart header');
        const name = headerMatch[1];
        const filename = headerMatch[2];
        const content = part.split('\r\n\r\n')[1] ?? '';
        return { name, filename, content: content.trim() };
    });
}
/** Validate uploaded files (count + filenames). */
export function validateFiles(files) {
    if (!files.length)
        throw new TypeError('At least one file is required');
    if (files.some(f => !f.filename))
        throw new TypeError('All files must have a filename');
    if (files.length > FILE_MAX)
        throw new TypeError(`Too many files: max ${FILE_MAX} allowed`);
}
/** Chunk text into overlapping word-boundary segments. */
export function chunkByWords(text, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    if (!words.length)
        return [];
    const chunks = [];
    let start = 0;
    while (start < words.length) {
        const end = Math.min(start + size, words.length);
        const chunk = words.slice(start, end).join(' ');
        if (chunk.length > 0) {
            chunks.push(chunk);
        }
        start = end === words.length ? words.length : end - overlap;
    }
    return chunks.filter(c => c.length > 0);
}
/** Generate embedding for text via Ollama API. */
async function generateEmbedding(text) {
    const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const model = process.env.EMBEDDING_MODEL || 'nomic-embed-text';
    const response = await fetch(`${baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: text }),
    });
    if (!response.ok)
        throw new Error(`Ollama embed failed: ${response.status} ${response.statusText}`);
    const json = await response.json();
    if (!json.embeddings || !json.embeddings[0])
        throw new Error('Empty embeddings from Ollama');
    return json.embeddings[0];
}
/** Factory that produces a /documents/import route handler. */
export function createImportRoute(vstore) {
    const handler = async (req) => {
        // Read and validate multipart files
        const files = await readFileContents(req);
        validateFiles(files);
        let totalInserted = 0;
        const sources = [];
        for (const file of files) {
            // Chunk the content
            const chunks = chunkByWords(file.content, CHUNK_SIZE, CHUNK_OVERLAP);
            let chunkCount = 0;
            for (const chunk of chunks) {
                try {
                    // Generate embedding for each chunk
                    const vec = await generateEmbedding(chunk);
                    const vecJson = JSON.stringify(vec);
                    // Insert into vector store (synchronous in our implementation)
                    const id = vstore.insert(chunk, vecJson);
                    if (id > 0) {
                        totalInserted++;
                        chunkCount++;
                    }
                }
                catch (embedError) {
                    const msg = embedError instanceof Error ? embedError.message : 'Unknown error';
                    console.error(`Embedding failed for file ${file.filename}, chunk skipped:`, msg);
                    // Continue to next chunk rather than failing entire import
                }
            }
            sources.push({ filename: file.filename, chunks: chunkCount });
        }
        return { status: 'ok', inserted: totalInserted, sources };
    };
    return handler;
}
/** Alias for backward compatibility with test imports. */
export const createDocumentImportRoute = createImportRoute;
/** Chunk size and overlap configuration. */
export { CHUNK_SIZE, CHUNK_OVERLAP, FILE_MAX };
//# sourceMappingURL=documents.js.map