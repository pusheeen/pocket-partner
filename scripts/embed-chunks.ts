import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const CHUNKS_PATH = join(process.cwd(), "src/data/lenny-chunks.json");
const EMBEDDINGS_PATH = join(process.cwd(), "src/data/lenny-embeddings.json");
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const BATCH_SIZE = 100;

interface Chunk {
  id: string;
  text: string;
  title: string;
  guest: string;
  date: string;
  type: string;
  source: string;
}

async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: texts,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding API error: ${err}`);
  }

  const data = await res.json();
  return data.data.map((d: { embedding: number[] }) => d.embedding);
}

async function main() {
  if (!OPENAI_KEY) {
    // Try reading from .env.local
    const envPath = join(process.cwd(), ".env.local");
    const envContent = readFileSync(envPath, "utf-8");
    const match = envContent.match(/OPENAI_API_KEY=(.+)/);
    if (match) {
      process.env.OPENAI_API_KEY = match[1].trim();
    } else {
      console.error("No OPENAI_API_KEY found");
      process.exit(1);
    }
  }

  const chunks: Chunk[] = JSON.parse(readFileSync(CHUNKS_PATH, "utf-8"));
  console.log(`Embedding ${chunks.length} chunks in batches of ${BATCH_SIZE}...`);

  const allEmbeddings: number[][] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map(
      (c) => `${c.type}: ${c.title}${c.guest ? ` (${c.guest})` : ""}\n${c.text}`
    );

    const embeddings = await getEmbeddings(texts);
    allEmbeddings.push(...embeddings);

    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)} done (${allEmbeddings.length} total)`);
  }

  writeFileSync(EMBEDDINGS_PATH, JSON.stringify(allEmbeddings));
  console.log(`Wrote ${allEmbeddings.length} embeddings to ${EMBEDDINGS_PATH}`);
}

main().catch(console.error);
