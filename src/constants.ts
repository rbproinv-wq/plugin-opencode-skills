import { homedir } from "os";
import { join } from "path";

export function expandHome(p: string): string {
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

export const VAULT_BASE = expandHome("~/.opencode-skills-vault");
export const MANIFEST_PATH = expandHome("~/skills_manifest.json");
export const SKILL_INDEX_PATH = expandHome("~/.opencode/skills_index.json");

export const DEFAULT_TOP_K = 5;
export const SIMILARITY_THRESHOLD = 0.30;

export const BRIDGE_PATH = expandHome("~/oc-project/skl/bridge_search.py");
export const BRIDGE_TIMEOUT = 15_000;

export const SKILL_SYSTEM_INSTRUCTION = `
## @skill-name Convention
When the user types @skill-name (e.g., @angular-analyze), they are referring to a skill.
Call the skill() tool with name="skill-name" to load and execute it.

## Todo Convention for Skills
When a skill is routed (output contains [TODO: status - priority]), use the todowrite tool
to create a todo entry with the skill's name and description as content.
`;
