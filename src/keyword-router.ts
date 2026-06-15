import { readFileSync, existsSync } from "fs";
import type { Router, RouterResult, ScoredSkill, SkillMeta } from "./types.js";
import { MANIFEST_PATH, VAULT_BASE, DEFAULT_TOP_K } from "./constants.js";

interface ManifestEntry {
  name: string;
  description: string;
  source_repo: string;
  dir: string;
}

export class KeywordRouter implements Router {
  readonly kind = "keyword" as const;
  private skills: SkillMeta[] | null = null;

  private loadSkills(): SkillMeta[] {
    if (this.skills) return this.skills;
    if (!existsSync(MANIFEST_PATH)) return [];

    const raw = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    const entries: ManifestEntry[] = raw.skills || raw;
    this.skills = entries.map((s: any) => ({
      id: s.name + (s.dir || ""),
      name: s.name,
      description: s.description || "",
      sourceRepo: s.source_repo || "",
      dir: s.dir || "",
      filePath: `${VAULT_BASE}/${s.dir || s.name}/SKILL.md`
    }));
    return this.skills;
  }

  async search(query: string, topK = DEFAULT_TOP_K): Promise<RouterResult> {
    const start = Date.now();
    const skills = this.loadSkills();
    if (skills.length === 0) {
      return { skills: [], kind: "keyword", latencyMs: Date.now() - start, error: "No skills" };
    }

    const tokens = this.tokenize(query);
    if (tokens.length === 0) {
      return { skills: [], kind: "keyword", latencyMs: Date.now() - start, error: "Empty query" };
    }

    const scored = skills
      .map(s => ({ ...s, score: this.computeScore(tokens, s), matchedBy: "keyword" }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return { skills: scored, kind: "keyword", latencyMs: Date.now() - start };
  }

  async health(): Promise<boolean> {
    return existsSync(MANIFEST_PATH) || existsSync(VAULT_BASE);
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase()
      .split(/[\s,.\-–—/_\\()!@#$%^&*+=[\]{}|;:'"<>?~`]+/)
      .filter(t => t.length >= 3);
  }

  private computeScore(tokens: string[], skill: SkillMeta): number {
    const nameLower = skill.name.toLowerCase();
    const descLower = skill.description.toLowerCase();
    let score = 0;

    for (const token of tokens) {
      const nameIdx = nameLower.indexOf(token);
      if (nameIdx !== -1) {
        const isWord = (nameIdx === 0 || /[-_]/.test(nameLower[nameIdx - 1])) &&
          (nameIdx + token.length >= nameLower.length || /[-_]/.test(nameLower[nameIdx + token.length]));
        score += isWord ? 15 * 3 : 10 * 3;
      }
      if (descLower.includes(token)) score += 10;
    }

    for (let i = 0; i < tokens.length - 1; i++) {
      const bigram = `${tokens[i]} ${tokens[i + 1]}`;
      if (nameLower.includes(bigram)) score += 10;
      if (descLower.includes(bigram)) score += 10;
    }

    for (let i = 0; i < tokens.length - 2; i++) {
      const phrase = tokens.slice(i, i + 3).join(" ");
      if (nameLower.includes(phrase) || descLower.includes(phrase)) {
        score += 50;
        break;
      }
    }

    return score;
  }
}
