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

## Installation

### 1. System dependencies

```bash
sudo apt-get install -y postgresql postgresql-16-pgvector redis-server
curl -fsSL https://ollama.com/install.sh | sh
pip3 install --break-system-packages psycopg2-binary redis
ollama pull nomic-embed-text
```

### 2. Database setup

```bash
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
sudo -u postgres createdb skills_db
sudo -u postgres psql -d skills_db -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

```sql
CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
    source_repo TEXT, dir TEXT, file_path TEXT, size_bytes INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS skill_embeddings (
    id SERIAL PRIMARY KEY,
    skill_id TEXT REFERENCES skills(id) ON DELETE CASCADE,
    embedding vector(768),
    content_type TEXT DEFAULT 'description',
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### 3. Skill vault & migration

```bash
# Clone community skills (see SETUP_OPENCODE.md) into ~/.opencode-skills-vault/
# Then migrate to PostgreSQL:
python3 bridge_search.py --health        # Verify stack
python3 migrate_skills.py                 # Batch embed + insert
bash build-index.sh                       # Build JSON fallback index
```

### 4. Plugin config

Add to `.opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "./plugin-opencode-skills",
    ["opencode-triage", { "autoHide": true }]
  ]
}
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

### CLI bridge

```bash
# Health check
python3 bridge_search.py --health

# Semantic search
python3 bridge_search.py --query "security audit" --top-k 5 --threshold 0.25

# Export index with embeddings
python3 bridge_search.py --export-json > skills_with_vectors.json
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
