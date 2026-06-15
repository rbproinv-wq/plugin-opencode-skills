import type { SkillFrontmatter } from "./types.js";

export async function executeInSubagent(
  content: string,
  frontmatter: SkillFrontmatter
): Promise<string> {
  console.warn("context: fork not yet implemented, running inline");
  return content;
}
