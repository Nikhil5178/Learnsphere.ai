// RAG pipeline utilities: chunking text and creating embeddings.
//
// Embeddings: We use HuggingFace's free Inference API with the
// sentence-transformers/all-MiniLM-L6-v2 model (384 dimensions) since Groq
// does not currently offer an embeddings endpoint. Get a free token at
// https://huggingface.co/settings/tokens and set HUGGINGFACE_API_KEY.

const HF_API_URL =
  'https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2';

export interface TextChunk {
  content: string;
  page_number: number | null;
  chunk_index: number;
}

/**
 * Splits raw extracted PDF text into overlapping chunks suitable for
 * embedding + retrieval. Tries to break on paragraph boundaries first.
 */
export function chunkText(
  text: string,
  options: { chunkSize?: number; overlap?: number } = {}
): TextChunk[] {
  const chunkSize = options.chunkSize ?? 1000;
  const overlap = options.overlap ?? 150;

  const cleaned = text.replace(/\s+/g, ' ').trim();
  const chunks: TextChunk[] = [];

  let start = 0;
  let index = 0;

  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length);
    let sliceEnd = end;

    // Try to break on a sentence boundary near the end of the chunk
    if (end < cleaned.length) {
      const lastPeriod = cleaned.lastIndexOf('. ', end);
      if (lastPeriod > start + chunkSize * 0.5) {
        sliceEnd = lastPeriod + 1;
      }
    }

    chunks.push({
      content: cleaned.slice(start, sliceEnd).trim(),
      page_number: null, // populated by caller if page-level extraction is available
      chunk_index: index,
    });

    index += 1;
    start = sliceEnd - overlap;
    if (start <= 0 || sliceEnd >= cleaned.length) break;
  }

  return chunks.filter((c) => c.content.length > 20);
}

/**
 * Calls HuggingFace's free inference API to generate a 384-dim embedding.
 * Falls back to a deterministic hash-based pseudo-embedding if no API key
 * is configured, so the app still runs end-to-end without that key (search
 * quality will be lower, but nothing crashes).
 */
export async function embedText(text: string): Promise<number[]> {
  const apiKey = process.env.HUGGINGFACE_API_KEY;

  if (!apiKey) {
    return pseudoEmbedding(text);
  }

  try {
    const res = await fetch(HF_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
    });

    if (!res.ok) {
      console.error('HF embedding failed', await res.text());
      return pseudoEmbedding(text);
    }

    const data = await res.json();
    // HF returns either a flat array or nested array depending on model state
    if (Array.isArray(data) && typeof data[0] === 'number') return data;
    if (Array.isArray(data) && Array.isArray(data[0])) return data[0];
    return pseudoEmbedding(text);
  } catch (err) {
    console.error('Embedding error, falling back to pseudo-embedding:', err);
    return pseudoEmbedding(text);
  }
}

/**
 * Deterministic fallback embedding (NOT semantically meaningful — just keeps
 * the pipeline functional without an API key). Replace with a real
 * embedding provider for production-quality retrieval.
 */
function pseudoEmbedding(text: string, dims = 384): number[] {
  const vec = new Array(dims).fill(0);
  for (let i = 0; i < text.length; i++) {
    vec[i % dims] += text.charCodeAt(i);
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}
