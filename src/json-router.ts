import { readFileSync, existsSync } from "fs";
import type { Router, RouterResult, ScoredSkill } from "./types.js";
import { SKILL_INDEX_PATH, DEFAULT_TOP_K, SIMILARITY_THRESHOLD } from "./constants.js";

interface IndexEntry {
  name: string;
  description: string;
  source_repo: string;
  dir: string;
  file_path: string;
  embedding: number[];
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export class JsonRouter implements Router {
  readonly kind = "json" as const;
  private index: IndexEntry[] | null = null;

  private load(): IndexEntry[] {
    if (this.index) return this.index;
    if (!existsSync(SKILL_INDEX_PATH)) return [];
    this.index = JSON.parse(readFileSync(SKILL_INDEX_PATH, "utf-8")) as IndexEntry[];
    return this.index;
  }

  async search(query: string, topK = DEFAULT_TOP_K): Promise<RouterResult> {
    const start = Date.now();
    const entries = this.load();
    if (entries.length === 0) {
      return { skills: [], kind: "json", latencyMs: Date.now() - start, error: "No index" };
    }

    const queryEmbed = await this.embed(query);
    if (!queryEmbed) {
      return { skills: [], kind: "json", latencyMs: Date.now() - start, error: "Embed failed" };
    }

    const scored = entries
      .map(e => ({ e, sim: cosineSimilarity(queryEmbed, e.embedding) }))
      .filter(x => x.sim >= SIMILARITY_THRESHOLD)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, topK);

    const skills: ScoredSkill[] = scored.map(x => ({
      id: x.e.name,
      name: x.e.name,
      description: x.e.description,
      sourceRepo: x.e.source_repo,
      dir: x.e.dir,
      filePath: x.e.file_path,
      score: x.sim,
      matchedBy: `json:${query} (${x.sim.toFixed(3)})`
    }));

    return { skills, kind: "json", latencyMs: Date.now() - start };
  }

  private async embed(text: string): Promise<number[] | null> {
    try {
      const resp = await fetch("http://localhost:11434/api/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "nomic-embed-text", input: text })
      });
      if (!resp.ok) return null;
      const data: any = await resp.json();
      return data.embeddings?.[0] ?? null;
    } catch {
      return null;
    }
  }

  async health(): Promise<boolean> {
    if (!existsSync(SKILL_INDEX_PATH)) return false;
    try {
      const resp = await fetch("http://localhost:11434/api/tags");
      return resp.ok;
    } catch {
      return false;
    }
  }
}
