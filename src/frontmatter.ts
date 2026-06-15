import type { SkillFrontmatter } from "./types.js";

const VALID_RISKS = ["safe", "none", "unknown", "critical"];
const VALID_EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const VALID_CONTEXTS = ["fork", "main"];

export function parseFrontmatter(content: string): {
  meta: SkillFrontmatter;
  body: string;
} | null {
  const match = content.match(/^---\n([\s\S]*?)\n(?:---|---)\n([\s\S]*)$/);
  if (!match) return null;

  const raw = match[1].trim();
  const body = match[2].trim();
  const meta = parseYamlSimple(raw);
  if (!meta) return null;

  return { meta: validateFrontmatter(meta), body };
}

export function extractFrontmatterRaw(content: string): {
  name?: string;
  description?: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n(?:---|---)\n/);
  if (!match) return {};

  const raw = match[1];
  const name = raw.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const desc = raw.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  return { name, description: desc };
}

function parseYamlSimple(raw: string): Record<string, any> | null {
  const result: Record<string, any> = {};
  const lines = raw.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(\w[\w_-]*):\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    let value: string = match[2].trim();

    if (value === "" || value === "|") {
      const blockLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].startsWith("  ")) {
        blockLines.push(lines[i].trimStart());
        i++;
      }
      i--;
      value = blockLines.join("\n");
    }

    if (value.startsWith("[") && value.endsWith("]")) {
      result[key] = value.slice(1, -1).split(",").map((s: string) => s.trim().replace(/^['"]|['"]$/g, ""));
    } else if (value === "true") result[key] = true;
    else if (value === "false") result[key] = false;
    else result[key] = value;
  }

  return result;
}

function validateFrontmatter(meta: Record<string, any>): SkillFrontmatter {
  return {
    name: typeof meta.name === "string" ? meta.name : undefined,
    description: typeof meta.description === "string" ? meta.description : undefined,
    when_to_use: typeof meta.when_to_use === "string" ? meta.when_to_use : undefined,
    allowedTools: Array.isArray(meta["allowed-tools"] ?? meta.allowedTools)
      ? (meta["allowed-tools"] ?? meta.allowedTools).filter(Boolean) : undefined,
    disallowedTools: Array.isArray(meta["disallowed-tools"] ?? meta.disallowedTools)
      ? (meta["disallowed-tools"] ?? meta.disallowedTools).filter(Boolean) : undefined,
    context: VALID_CONTEXTS.includes(meta.context) ? meta.context : undefined,
    agent: typeof meta.agent === "string" ? meta.agent : undefined,
    model: typeof meta.model === "string" ? meta.model : undefined,
    effort: VALID_EFFORTS.includes(meta.effort) ? meta.effort as any : undefined,
    risk: VALID_RISKS.includes(meta.risk) ? meta.risk as any : "unknown",
    notify: meta.notify === true,
    disableModelInvocation: meta["disable-model-invocation"] === true || meta.disableModelInvocation === true,
    userInvocable: meta["user-invocable"] !== false,
    tags: Array.isArray(meta.tags) ? meta.tags : undefined,
    category: typeof meta.category === "string" ? meta.category : undefined,
    paths: Array.isArray(meta.paths) ? meta.paths : undefined,
  };
}
