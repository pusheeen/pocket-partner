import { readFileSync } from "fs";
import { join } from "path";

interface Chunk {
  id: string;
  text: string;
  title: string;
  guest: string;
  date: string;
  type: string;
  source: string;
}

let chunks: Chunk[] | null = null;
let embeddings: number[][] | null = null;

function loadData() {
  if (chunks && embeddings) return;
  const dataDir = join(process.cwd(), "src/data");
  chunks = JSON.parse(readFileSync(join(dataDir, "lenny-chunks.json"), "utf-8"));
  embeddings = JSON.parse(
    readFileSync(join(dataDir, "lenny-embeddings.json"), "utf-8")
  );
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function retrieveContext(
  query: string,
  topK: number = 4
): Promise<string> {
  loadData();
  if (!chunks || !embeddings || embeddings.length === 0) return "";

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: query,
    }),
  });

  if (!res.ok) return "";

  const data = await res.json();
  const queryEmbedding: number[] = data.data[0].embedding;

  const scored = chunks.map((chunk, i) => ({
    chunk,
    score: cosineSimilarity(queryEmbedding, embeddings![i]),
  }));

  scored.sort((a, b) => b.score - a.score);
  const topChunks = scored.slice(0, topK);

  if (topChunks.length === 0 || topChunks[0].score < 0.3) return "";

  const context = topChunks
    .map(
      ({ chunk, score }) =>
        `[Source: ${chunk.title}${chunk.guest ? ` — ${chunk.guest}` : ""} (${chunk.type}, ${chunk.date}), relevance: ${score.toFixed(2)}]\n${chunk.text.slice(0, 1000)}`
    )
    .join("\n\n---\n\n");

  return `\n\nRelevant insights from Lenny's Podcast/Newsletter:\n\n${context}`;
}
