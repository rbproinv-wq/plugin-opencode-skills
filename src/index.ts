import type { Plugin, Hooks } from "@opencode-ai/plugin";
import { z } from "zod";
import { getRouter, resetRouter } from "./router.js";
import { executeSkill } from "./tool-def.js";
import { Notifier } from "./notifier.js";
import { SkillTracker } from "./tracker.js";
import { SKILL_SYSTEM_INSTRUCTION, BRIDGE_PATH } from "./constants.js";
import type { PluginState, ScoredSkill } from "./types.js";
import { execSync } from "child_process";

export const plugin: Plugin = async (input: any, options?: Record<string, any>) => {
  const client = input.client as any;
  const notifier = new Notifier(client);
  const kv = client.kv || { get: async () => null, set: async () => {} };
  const tracker = new SkillTracker(kv);

  const router = await getRouter();
  const state: PluginState = {
    enabled: options?.enabled !== false,
    activeRouter: router.kind,
    currentSkills: [],
    activeSkillTrack: []
  };

  await notifier.info(`Skills ativas (${router.kind})`);

  const skillTool = {
    description:
      "Execute uma skill especializada. Skills dispon\u00EDveis: consulte /skills search",
    args: {
      query: z.string().describe("O que precisa ser feito"),
      name: z.string().optional().describe(
        "Nome exato da skill (opcional \u2014 auto-seleciona se omitido)"
      )
    },
    async execute(args: { query: string; name?: string }, context: any) {
      return await executeSkill(args, context);
    }
  };

  const skillsCmd = {
    description:
      "Gerencia o sistema de skills. A\u00E7\u00F5es: on, off, status, rebuild, search, check, setup",
    args: {
      action: z.enum(["on", "off", "status", "rebuild", "search", "check", "setup"]),
      query: z.string().optional().describe("Termo de busca (apenas para action=search)")
    },
    async execute(args: { action: string; query?: string }) {
      switch (args.action) {
        case "on":
          state.enabled = true;
          return { output: "Skills ativadas." };
        case "off":
          state.enabled = false;
          return { output: "Skills desativadas." };
        case "status": {
          const r = await getRouter();
          return {
            output: [
              `Router: ${r.kind}`,
              `Habilitado: ${state.enabled}`,
              `Skills no cat\u00E1logo: ${state.currentSkills.length}`
            ].join("\n")
          };
        }
        case "rebuild":
          resetRouter();
          const nr = await getRouter();
          return { output: `Router recriado: ${nr.kind}` };
        case "search": {
          const q = args.query || "";
          const r = await getRouter();
          const result = await r.search(q, 10);
          if (result.skills.length === 0) {
            return { output: `Nenhuma skill encontrada para "${q}"` };
          }
          const lines = result.skills.map((s: ScoredSkill, i: number) =>
            `${i + 1}. @${s.name} \u2014 ${s.description || "(sem descri\u00E7\u00E3o)"}`
          );
          return { output: `Skills para "${q}":\n${lines.join("\n")}` };
        }
        case "check": {
          try {
            const out = execSync(`python3 "${BRIDGE_PATH}" --health`, { timeout: 10000, encoding: "utf-8" });
            const health = JSON.parse(out.trim());
            const lines: string[] = [];
            for (const [svc, info] of Object.entries(health.services || {})) {
              const s = info as any;
              lines.push(`  ${s.status === "ok" ? "\u2705" : "\u274C"} ${svc}: ${s.status}${s.skills !== undefined ? ` (${s.skills} skills)` : ""}${s.error ? ` - ${s.error}` : ""}`);
            }
            if (health.vault?.exists) lines.push(`  \u2705 vault: ~/.opencode-skills-vault`);
            else lines.push(`  \u274C vault: n\u00E3o encontrado`);
            return { output: `Infraestrutura:\n${lines.join("\n")}` };
          } catch (e: any) {
            return { output: `Erro ao verificar infraestrutura: ${e.message}` };
          }
        }
        case "setup": {
          const steps: string[] = [];
          steps.push("1. PostgreSQL: sudo apt-get install -y postgresql postgresql-16-pgvector");
          steps.push("2. Redis: sudo apt-get install -y redis-server");
          steps.push("3. Ollama: curl -fsSL https://ollama.com/install.sh | sh");
          steps.push("4. Model: ollama pull nomic-embed-text");
          steps.push("5. DB: sudo -u postgres psql -c \"ALTER USER postgres PASSWORD 'postgres';\"");
          steps.push("6. DB: sudo -u postgres createdb skills_db");
          steps.push("7. Ext: sudo -u postgres psql -d skills_db -c \"CREATE EXTENSION IF NOT EXISTS vector;\"");
          steps.push("8. Python: pip3 install --break-system-packages psycopg2-binary redis");
          steps.push("9. Vault: bash scripts/setup.sh (cria ~/.opencode-skills-vault)");
          steps.push("10. Migrar: python3 bridge/bridge_search.py --health");
          steps.push("11. Index: bash build-index.sh");
          return { output: `Para configurar do zero, execute:\n\n${steps.join("\n")}\n\nDepois rode /skills check para verificar.` };
        }
      }
    }
  };

  const hooks: Hooks = {
    tool: {
      skill: skillTool,
      skills: skillsCmd
    } as any,

    "tool.definition": async (_input: any, output: any) => {
      if (!state.enabled) return;
      const def = output.definitions?.skill;
      if (def && state.currentSkills.length > 0) {
        const desc = state.currentSkills
          .map((s: ScoredSkill) =>
            `@${s.name}: ${s.description || "(sem descri\u00E7\u00E3o)"}`
          )
          .join(" | ");
        def.description =
          `Execute uma skill especializada. Op\u00E7\u00F5es dispon\u00EDveis: ${desc}. ` +
          `Use o nome exato ap\u00F3s @.`;
      }
    },

    "tool.execute.before": async (input: any, output: any) => {
      if (input.tool === "skill") {
        const name = output.args?.name || "auto";
        await notifier.skillStart(name);
        await tracker.start(name, output.args?.query || "", input.sessionID);
      }
    },

    "tool.execute.after": async (input: any, output: any) => {
      if (input.tool === "skill" && typeof output.output === "string") {
        const result = output.output;
        if (result.startsWith("SKILL ROUTED:")) {
          const name = result.split("\n")[0].replace("SKILL ROUTED:", "").trim();
          await notifier.skillActive(name, state.activeRouter);
          await tracker.active(name, input.sessionID);
        } else if (result === "No matching skill found.") {
          await notifier.warning("Nenhuma skill encontrada para esta consulta");
        }
      }
    },

    "chat.message": async (input: any, _output: any) => {
      if (!state.enabled) return;
      const text = extractTextFromEvent(input.event);
      if (!text) return;
      const r = await getRouter();
      const result = await r.search(text, 5);
      state.currentSkills = result.skills;
    },

    "experimental.chat.messages.transform": async (_input: any, output: any) => {
      if (!state.enabled) return;
      const msgs = output.messages as any[];
      if (!msgs) return;
      const sys = msgs.find((m: any) => m.role === "system");
      if (sys && typeof sys.content === "string") {
        if (!sys.content.includes("@skill-name")) {
          sys.content += SKILL_SYSTEM_INSTRUCTION;
        }
      }
    },

    "config": async (_input: any) => {},

    "dispose": async () => {
      state.enabled = false;
    }
  };

  return hooks;
};

function extractTextFromEvent(event: any): string | null {
  if (!event) return null;
  const msg = event.type === "message.v2.created"
    ? event.data?.message
    : event.message || event;
  return extractText(msg);
}

function extractText(msg: any): string | null {
  if (!msg) return null;
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    const parts = msg.content
      .map((p: any) => p.text || p.content || "")
      .filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : null;
  }
  return null;
}
