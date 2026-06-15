import { homedir } from "os";
import { join } from "path";
import { fileURLToPath } from "url";

export function expandHome(p: string): string {
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, "..");

export const VAULT_BASE = expandHome("~/.opencode-skills-vault");
export const MANIFEST_PATH = expandHome("~/skills_manifest.json");
export const SKILL_INDEX_PATH = expandHome("~/.opencode/skills_index.json");
export const BRIDGE_PATH = join(__dirname, "..", "bridge", "bridge_search.py");
export const SETUP_SCRIPT = join(__dirname, "..", "scripts", "setup.sh");

export const DEFAULT_TOP_K = 5;
export const SIMILARITY_THRESHOLD = 0.30;
export const BRIDGE_TIMEOUT = 15_000;

export const SKILL_SYSTEM_INSTRUCTION = `
## @skill-name Convention
When the user types @skill-name (e.g., @angular-analyze), they are referring to a skill.
Call the skill() tool with name="skill-name" to load and execute it.
`;
