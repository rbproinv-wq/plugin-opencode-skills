import { expandHome } from "./constants.js";

export interface SkillMeta {
  id: string;
  name: string;
  description: string;
  sourceRepo: string;
  dir: string;
  filePath: string;
}

export interface ScoredSkill extends SkillMeta {
  score: number;
  matchedBy: string;
}

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  when_to_use?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  context?: "fork" | "main";
  agent?: string;
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  risk?: "safe" | "none" | "unknown" | "critical";
  notify?: boolean;
  disableModelInvocation?: boolean;
  userInvocable?: boolean;
  tags?: string[];
  category?: string;
  paths?: string[];
}

export type RouterKind = "vector" | "json" | "keyword";

export interface RouterResult {
  skills: ScoredSkill[];
  kind: RouterKind;
  latencyMs: number;
  error?: string;
}

export interface Router {
  readonly kind: RouterKind;
  search(query: string, topK?: number): Promise<RouterResult>;
  health(): Promise<boolean>;
}

export interface PluginState {
  enabled: boolean;
  activeRouter: RouterKind;
  currentSkills: ScoredSkill[];
  activeSkillTrack: ActiveSkillTrack[];
}

export interface ActiveSkillTrack {
  skillName: string;
  taskQuery: string;
  startedAt: number;
  messageID?: string;
}
