/**
 * Minimal face-math helpers: cosine similarity, match score conversion, embedding encode/decode.
 */

/** Decode a base64 or hex string into a Float32Array embedding. */
export function decodeEmbedding(encoded: string): Float32Array {
  const buf = Buffer.from(encoded, 'base64');
  const floats = new Float32Array(
    buf.buffer,
    buf.byteOffset,
    buf.byteLength / 4,
  );
  return floats;
}

/** Decode raw BYTEA (Buffer) stored in postgres into Float32Array. */
export function bufferToEmbedding(buf: Buffer): Float32Array {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

/** Encode Float32Array to Buffer for storage. */
export function embeddingToBuffer(embedding: Float32Array): Buffer {
  return Buffer.from(embedding.buffer);
}

/**
 * Normalize embedding-model identifiers for compatibility comparison.
 * The Android kiosk stores "mobilefacenet" while face-svc reports
 * "mobilefacenet-v1" — same weights, same 192-d vectors. Lowercase and
 * strip a trailing -v<N> so aliases of one model family compare equal
 * (arcface-buffalo_l-v1 → arcface-buffalo_l, mobilefacenet-v1 → mobilefacenet).
 */
export function normalizeEmbeddingModel(
  model: string | null | undefined,
): string | null {
  if (!model) return null;
  return (
    model
      .trim()
      .toLowerCase()
      .replace(/-v\d+$/, '') || null
  );
}

/** Cosine similarity in [-1, 1]. */
export function cosineSim(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return -1;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Normalise cosine similarity [-1,1] to a 0-1 match score. */
export function toMatchScore(sim: number): number {
  return (sim + 1) / 2;
}

/**
 * Average a list of Float32Array embeddings (for multi-frame enrolment).
 * Returns a new Float32Array of the same dimensionality.
 */
export function averageEmbeddings(embeddings: Float32Array[]): Float32Array {
  if (embeddings.length === 0) throw new Error('No embeddings to average');
  const dim = embeddings[0].length;
  const result = new Float32Array(dim);
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      result[i] += emb[i];
    }
  }
  for (let i = 0; i < dim; i++) {
    result[i] /= embeddings.length;
  }
  return result;
}
