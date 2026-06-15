import { execFileSync } from "child_process";
import type { Router, RouterResult, ScoredSkill } from "./types.js";
import { BRIDGE_PATH, BRIDGE_TIMEOUT, DEFAULT_TOP_K, SIMILARITY_THRESHOLD } from "./constants.js";

interface BridgeResult {
  name: string;
  description: string;
  source_repo: string;
  dir: string;
  file_path: string;
  similarity: number;
  score: number;
}

interface HealthResult {
  status: string;
  services: Record<string, any>;
}

export class VectorRouter implements Router {
  readonly kind = "vector" as const;

  async search(query: string, topK = DEFAULT_TOP_K): Promise<RouterResult> {
    const start = Date.now();
    try {
      const out = execFileSync("python3", [
        BRIDGE_PATH,
        "--query", query,
        "--top-k", String(topK),
        "--threshold", String(SIMILARITY_THRESHOLD)
      ], { timeout: BRIDGE_TIMEOUT, maxBuffer: 10 * 1024 * 1024 });

      const raw: BridgeResult[] = JSON.parse(out.toString());
      const skills: ScoredSkill[] = raw.map(r => ({
        id: r.name,
        name: r.name,
        description: r.description || "",
        sourceRepo: r.source_repo || "",
        dir: r.dir || "",
        filePath: r.file_path || "",
        score: r.score,
        matchedBy: `vector:${query} (${r.similarity.toFixed(3)})`
      }));

      return { skills, kind: "vector", latencyMs: Date.now() - start };
    } catch (e: any) {
      return {
        skills: [],
        kind: "vector",
        latencyMs: Date.now() - start,
        error: e.message || String(e)
      };
    }
  }

  async health(): Promise<boolean> {
    try {
      const out = execFileSync("python3", [BRIDGE_PATH, "--health"], { timeout: 5000 });
      const result: HealthResult = JSON.parse(out.toString());
      return result.status === "ok";
    } catch {
      return false;
    }
  }
}
