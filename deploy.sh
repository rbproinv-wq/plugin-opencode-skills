#!/bin/bash
set -e

echo "=== Deploy plugin-opencode-skills ==="
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 1. Infrastructure checks
echo "--- Checking PostgreSQL + pgvector ---"
pg_isready -q || { echo "PostgreSQL not running"; exit 1; }
psql -U postgres -d skills_db -c "SELECT count(*) FROM skills" >/dev/null 2>&1 || {
  echo "Creating skills_db..."
  createdb -U postgres skills_db
  psql -U postgres -d skills_db -c "CREATE EXTENSION IF NOT EXISTS vector"
}
psql -U postgres -d skills_db -c "
  CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
    source_repo TEXT, dir TEXT, file_path TEXT, size_bytes INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS skill_embeddings (
    id SERIAL PRIMARY KEY, skill_id TEXT REFERENCES skills(id) ON DELETE CASCADE,
    embedding vector(768), content_type TEXT DEFAULT 'description',
    created_at TIMESTAMPTZ DEFAULT now()
  );
"

echo "--- Checking Redis ---"
redis-cli ping >/dev/null || { echo "Redis not running"; exit 1; }
redis-cli CONFIG SET maxmemory-policy allkeys-lru >/dev/null

echo "--- Checking Ollama ---"
curl -s http://localhost:11434/api/tags >/dev/null || { echo "Ollama not running"; exit 1; }
ollama pull nomic-embed-text 2>/dev/null || true

# 2. Install plugin dependency
echo "--- Installing plugin dependencies ---"
cd "$SCRIPT_DIR"
npm install --production --no-audit 2>&1 | tail -2

# 3. Verify bridge
echo "--- Testing bridge ---"
python3 "$SCRIPT_DIR/../bridge_search.py" --health | python3 -m json.tool

echo "=== Deploy complete ==="
echo "Add to ~/.config/opencode/opencode.jsonc or .opencode/opencode.jsonc:"
echo '{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "./plugin-opencode-skills",
    ["opencode-triage", { "autoHide": true }]
  ]
}'
