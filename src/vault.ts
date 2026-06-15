import { readFileSync, existsSync } from "fs";
import type { SkillFrontmatter } from "./types.js";
import { VAULT_BASE } from "./constants.js";
import { parseFrontmatter } from "./frontmatter.js";

export interface LoadedSkill {
  raw: string;
  frontmatter: SkillFrontmatter;
  body: string;
}

export function loadSkillFromVault(skillDir: string): LoadedSkill | null {
  const path = `${VAULT_BASE}/${skillDir}/SKILL.md`;
  if (!existsSync(path)) return null;

  const raw = readFileSync(path, "utf-8");
  const parsed = parseFrontmatter(raw);
  if (!parsed) {
    return { raw, frontmatter: {}, body: raw };
  }

  return {
    raw,
    frontmatter: parsed.meta,
    body: parsed.body
  };
}

export function applySubstitutions(
  body: string,
  args: Record<string, any>
): string {
  let result = body;

  if (args.query) result = result.replace(/\$ARGUMENTS/g, args.query);
  if (args.skillName) result = result.replace(/\$0/g, args.skillName);

  result = result.replace(/\$\{([^}]+)\}/g, (_, varName: string) => {
    return process.env[varName] ?? `\${${varName}}`;
  });

  for (let i = 0; i < 10; i++) {
    const re = new RegExp(`\\$${i}`, "g");
    const val = args[String(i)] ?? args[i];
    if (val !== undefined) result = result.replace(re, String(val));
  }

  return result;
}

let _injectionEnabled = false;

export function setShellInjectionEnabled(enabled: boolean): void {
  _injectionEnabled = enabled;
}

import { execSync } from "child_process";

export function applyDynamicInjections(body: string): string {
  if (!_injectionEnabled) return body;

  return body.replace(/!`([^`]+)`/g, (_, cmd: string) => {
    try {
      return execSync(cmd, { timeout: 5000, encoding: "utf-8" }).trim();
    } catch {
      return `<!-- dynamic injection failed: ${cmd} -->`;
    }
  });
}
