import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

const LENNY_DIR = join(process.env.HOME!, "Documents/lennys-newsletterpodcastdata");
const OUTPUT = join(process.cwd(), "src/data/lenny-chunks.json");
const CHUNK_SIZE = 800; // ~words per chunk
const OVERLAP = 100;

interface Chunk {
  id: string;
  text: string;
  title: string;
  guest: string;
  date: string;
  type: "podcast" | "newsletter";
  source: string;
}

function parseFrontmatter(content: string) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const [key, ...rest] = line.split(":");
    if (key && rest.length) {
      meta[key.trim()] = rest.join(":").trim().replace(/^"|"$/g, "");
    }
  }
  return { meta, body: match[2] };
}

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(" ");
    if (chunk.length > 50) chunks.push(chunk);
  }

  return chunks;
}

function processFile(filePath: string, type: "podcast" | "newsletter"): Chunk[] {
  const raw = readFileSync(filePath, "utf-8");
  const { meta, body } = parseFrontmatter(raw);
  const filename = filePath.split("/").pop()!.replace(".md", "");

  const textChunks = chunkText(body, CHUNK_SIZE, OVERLAP);

  return textChunks.map((text, i) => ({
    id: `${type}-${filename}-${i}`,
    text,
    title: meta.title || filename,
    guest: meta.guest || "",
    date: meta.date || "",
    type,
    source: `${type}/${filename}.md`,
  }));
}

function main() {
  const chunks: Chunk[] = [];

  // Process podcasts
  const podcastDir = join(LENNY_DIR, "podcasts");
  for (const file of readdirSync(podcastDir)) {
    if (!file.endsWith(".md")) continue;
    chunks.push(...processFile(join(podcastDir, file), "podcast"));
  }

  // Process newsletters
  const newsletterDir = join(LENNY_DIR, "newsletters");
  for (const file of readdirSync(newsletterDir)) {
    if (!file.endsWith(".md")) continue;
    chunks.push(...processFile(join(newsletterDir, file), "newsletter"));
  }

  // Ensure output dir exists
  const outDir = join(process.cwd(), "src/data");
  try { require("fs").mkdirSync(outDir, { recursive: true }); } catch {}

  writeFileSync(OUTPUT, JSON.stringify(chunks, null, 0));
  console.log(`Wrote ${chunks.length} chunks to ${OUTPUT}`);

  // Show stats
  const podcasts = chunks.filter((c) => c.type === "podcast");
  const newsletters = chunks.filter((c) => c.type === "newsletter");
  console.log(`  Podcasts: ${podcasts.length} chunks from ${new Set(podcasts.map(c => c.source)).size} files`);
  console.log(`  Newsletters: ${newsletters.length} chunks from ${new Set(newsletters.map(c => c.source)).size} files`);
}

main();
