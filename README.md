# plugin-opencode-skills

Hybrid skill routing engine for OpenCode — combines **vector search**, **JSON index**, and **keyword fallback** to route skill queries across 2,963 community skills without bloating the LLM context window.

## Architecture

```
User query
    │
    ▼
┌─────────────────────────────────────────────────┐
│                  Router Chain                    │
│                                                   │
│  VectorRouter (PG pgvector + Ollama) ◄── Primary │
│       │ fail                                     │
│       ▼                                          │
│  JsonRouter (cosine sim on 30MB index)  ◄── Cache│
│       │ fail                                     │
│       ▼                                          │
│  KeywordRouter (TF-IDF scoring)       ◄── Fallback│
└─────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────┐
│              Skill Lazy Loader                   │
│  Reads SKILL.md from ~/.opencode-skills-vault/  │
│  Applies $ARGUMENTS, ${ENV} substitutions       │
│  Executes dynamic injections (`` !`cmd` ``)     │
└─────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────┐
│              LLM Context                         │
│  Injected via tool.execute.before/after hooks   │
│  Toast notifications + TUI sidebar              │
└─────────────────────────────────────────────────┘
```

## Features

- **3-router chain**: Vector (PostgreSQL pgvector) → JSON index → Keyword scoring
- **Lazy loading**: Only skill name + description in prompt upfront; full SKILL.md loads on invocation
- **Frontmatter parsing**: Extracts `allowed-tools`, `context: fork`, `risk`, `effort`, etc.
- **Substitutions**: `$ARGUMENTS`, `$0..$9`, `${ENV_VAR}`, named args
- **Dynamic injections**: `` !`shell command` `` blocks execute at load time
- **TUI integration**: Toast notifications + sidebar active skills tracker
- **@skill-name convention**: LLM instruction for invoking skills by name

## Requirements

| Component | Version | Purpose |
|-----------|---------|---------|
| OpenCode | >=1.14.0 | Plugin API host |
| PostgreSQL 16 | +pgvector | Vector storage (2963 skills, 768-dim) |
| Ollama | >=0.1.0 | Embeddings (nomic-embed-text) |
| Redis | >=6.0 | Embedding cache (LRU, 24h TTL) |
| Python 3 | >=3.10 | Bridge to PostgreSQL |

## Quick start

```bash
# 1. Clone the plugin
git clone https://github.com/rbproinv-wq/plugin-opencode-skills.git

# 2. Add to opencode config
# Edit .opencode/opencode.json:
```

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "./plugin-opencode-skills"
  ]
}
```

The plugin loads immediately. From within opencode:
- `/skills status` — check which router is active
- `/skills check` — verify all infrastructure components
- `/skills setup` — show step-by-step setup guide
- `/skills search <query>` — search available skills

**No external dependencies required** — the bundled bridge Python file
and keyword fallback router make it self-contained.

### Full infrastructure (optional, for vector search)

```bash
# System deps
sudo apt-get install -y postgresql postgresql-16-pgvector redis-server
curl -fsSL https://ollama.com/install.sh | sh
pip3 install --break-system-packages psycopg2-binary redis
ollama pull nomic-embed-text

# Database
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
sudo -u postgres createdb skills_db
sudo -u postgres psql -d skills_db -c "CREATE EXTENSION IF NOT EXISTS vector;"
# Create tables (see schema below)

# Skill vault + migration
# Clone community skills into ~/.opencode-skills-vault/
# (see SETUP_OPENCODE.md for the full script)
python3 bridge/bridge_search.py --health
python3 migrate_skills.py
bash build-index.sh
```

## Usage

### In OpenCode chat

```
# List available skills
/skills search database

# Get router status
/skills status

# Invoke a skill directly
@database-migrations-sql-migrations help me plan a migration

# Let the LLM auto-select
skill(query: "I need to set up PostgreSQL replication")
```

### CLI bridge (bundled)

```bash
cd plugin-opencode-skills
python3 bridge/bridge_search.py --health
python3 bridge/bridge_search.py --query "security audit" --top-k 5
python3 bridge/bridge_search.py --export-json > skills_with_vectors.json
```

## Router fallback chain

| Router | Backend | Latency | When active |
|--------|---------|---------|-------------|
| Vector | PostgreSQL + pgvector | ~500ms | PG + Ollama online |
| JSON | `~/.opencode/skills_index.json` | ~100ms | PG down, Ollama online |
| Keyword | `~/skills_manifest.json` | ~10ms | Both PG + Ollama down |

## Project structure

```
plugin-opencode-skills/
├── src/
│   ├── index.ts              # Plugin entry point + hooks
│   ├── router.ts             # Router chain factory
│   ├── vector-router.ts      # PostgreSQL pgvector search
│   ├── json-router.ts        # JSON index cosine similarity
│   ├── keyword-router.ts     # TF-IDF keyword scoring
│   ├── frontmatter.ts        # SKILL.md YAML parser
│   ├── vault.ts              # Lazy loader + substitutions
│   ├── tool-def.ts           # Skill tool executor
│   ├── notifier.ts           # Toast notifications
│   ├── tracker.ts            # Active skills KV tracking
│   ├── subagent.ts           # context: fork placeholder
│   ├── constants.ts          # Paths + defaults
│   └── types.ts              # Core TypeScript types
├── tui/
│   └── sidebar.tsx           # TUI sidebar slot plugin
├── bridge/
│   └── bridge_search.py      # Python bridge to PostgreSQL pgvector
├── scripts/
│   └── setup.sh              # Infrastructure check script
├── build-index.sh            # Rebuild JSON index from PG
├── deploy.sh                 # Deploy helper
├── package.json
└── tsconfig.json
```

## Performance

- **2963 skills** with 768-dim embeddings in PostgreSQL (32MB)
- **JSON fallback index**: 30MB, loads in <200ms
- **Redis LRU cache**: 24h TTL, reduces Ollama calls
- **Router chain timeout**: 15s (vector) → 5s (json) → instant (keyword)
- **Per-query cost**: ~500ms end-to-end with hot Redis cache

## Development

```bash
npm install
npx tsc --noEmit     # Type-check
```

## Replication

To set up on a fresh server with a single command, feed `SETUP_OPENCODE.md` to a new OpenCode session.

## License

MIT
