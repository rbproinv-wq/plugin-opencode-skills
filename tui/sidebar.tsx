import type { TuiPlugin, TuiPluginApi, TuiSlotContext } from "@opencode-ai/plugin/tui";

const ACTIVE_KEY = "opencode-skills:active";

const tuiPlugin: TuiPlugin = async (api: TuiPluginApi, _options, _meta) => {
  let interval: ReturnType<typeof setInterval> | null = null;

  api.slots.register({
    id: "plugin-opencode-skills-sidebar",
    slots: {
      sidebar_footer: (ctx: TuiSlotContext) => {
        const [active, setActive] = (ctx as any).createSignal<any[]>([]);

        (ctx as any).onMount(() => {
          interval = setInterval(async () => {
            try {
              const raw = await api.kv.get(ACTIVE_KEY);
              if (raw) setActive(JSON.parse(raw));
            } catch {
              // silent fallback
            }
          }, 2000);

          (ctx as any).onCleanup(() => {
            if (interval) clearInterval(interval);
          });
        });

        if (!active() || active().length === 0) return null;

        return (
          <div
            style={{
              padding: "4px 8px",
              borderTop: "1px solid " + ctx.theme.current.muted,
              fontSize: "12px"
            }}
          >
            <div style={{ fontWeight: "bold", marginBottom: "4px", color: ctx.theme.current.text }}>
              Active Skills
            </div>
            {(active() as any[]).map((track: any) => (
              <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "2px" }}>
                <span style={{ color: ctx.theme.current.accent }}>●</span>
                <span style={{ color: ctx.theme.current.text }}>
                  {track.skillName}
                </span>
                <span style={{ color: ctx.theme.current.muted, fontSize: "11px" }}>
                  — {(track.taskQuery || "").slice(0, 40)}
                </span>
              </div>
            ))}
          </div>
        );
      }
    }
  });
};

export default tuiPlugin;
