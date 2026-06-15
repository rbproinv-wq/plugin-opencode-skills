import { loadSkillFromVault, applySubstitutions, applyDynamicInjections } from "./vault.js";
import { getRouter } from "./router.js";
import { executeInSubagent } from "./subagent.js";
import type { ScoredSkill, Router } from "./types.js";

export interface SkillToolContext {
  metadata(input: { title?: string; metadata?: Record<string, any> }): void;
}

export interface SkillExecuteArgs {
  query: string;
  name?: string;
}

export async function getSkillEnum(query: string): Promise<string[]> {
  const router = await getRouter();
  const result = await router.search(query, 5);
  return result.skills.map(s => s.name);
}

export async function executeSkill(
  args: SkillExecuteArgs,
  ctx: SkillToolContext
): Promise<{ output: string; title: string }> {
  const { query, name } = args;
  const router = await getRouter();
  let skill: ScoredSkill | null = null;

  if (name) {
    const result = await router.search(name, 5);
    skill = result.skills.find(s => s.name === name) ?? null;
  } else {
    const result = await router.search(query, 3);
    skill = result.skills[0] ?? null;
  }

  if (!skill) {
    return { output: "No matching skill found.", title: "Skill not found" };
  }

  ctx.metadata({
    title: `\uD83D\uDD27 ${skill.name}`,
    metadata: { skill: skill.name, matchedBy: skill.matchedBy }
  });

  const loaded = loadSkillFromVault(skill.dir);
  if (!loaded) {
    return { output: `Skill "${skill.name}" not found in vault.`, title: "Skill error" };
  }

  let content = applySubstitutions(loaded.body, { ...args, skillName: skill.name });
  content = applyDynamicInjections(content);

  const todoSuggestion = `\n\n[TODO: in_progress - medium] Skill: ${skill.name} — ${query.slice(0, 80)}`;

  if (loaded.frontmatter.context === "fork") {
    const subResult = await executeInSubagent(content, loaded.frontmatter);
    return {
      output: `SKILL ROUTED: ${skill.name} (fork)\n${subResult}${todoSuggestion}`,
      title: `\uD83D\uDD27 ${skill.name} (fork)`
    };
  }

  return {
    output: `SKILL ROUTED: ${skill.name}\n${content}${todoSuggestion}`,
    title: `\uD83D\uDD27 ${skill.name}`
  };
}
