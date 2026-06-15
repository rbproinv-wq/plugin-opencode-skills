#!/bin/bash
set -e

echo "=== plugin-opencode-skills setup check ==="

# Bridge
BRIDGE_PATH="${1:-./bridge/bridge_search.py}"
echo ""
echo "--- Bridge ---"
if python3 "$BRIDGE_PATH" --health 2>/dev/null; then
    echo "  ✅ Bridge health check passed"
else
    echo "  ⚠️  Bridge health check failed (partial setup)"
fi

# PostgreSQL
echo ""
echo "--- PostgreSQL ---"
if pg_isready -q 2>/dev/null; then
    DB_OK=$(PGPASSWORD=postgres psql -U postgres -h localhost -d skills_db -t -c "SELECT count(*) FROM skills" 2>/dev/null | tr -d ' ')
    echo "  ✅ PostgreSQL running, ${DB_OK:-0} skills in database"
else
    echo "  ⚠️  PostgreSQL not running — install: sudo apt-get install postgresql"
fi

# Redis
echo ""
echo "--- Redis ---"
if redis-cli ping >/dev/null 2>&1; then
    echo "  ✅ Redis running"
else
    echo "  ⚠️  Redis not running — install: sudo apt-get install redis-server"
fi

# Ollama
echo ""
echo "--- Ollama ---"
if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
    MODEL=$(curl -s http://localhost:11434/api/tags | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['models'][0]['name'] if d.get('models') else 'no models')" 2>/dev/null)
    echo "  ✅ Ollama running (${MODEL})"
else
    echo "  ⚠️  Ollama not running — install: curl -fsSL https://ollama.com/install.sh | sh"
fi

# Vault
VAULT="${HOME}/.opencode-skills-vault"
echo ""
echo "--- Skill vault ---"
if [ -d "$VAULT" ]; then
    COUNT=$(find "$VAULT" -name SKILL.md 2>/dev/null | wc -l)
    echo "  ✅ Vault found: ${COUNT} skills"
else
    echo "  ⚠️  Vault not found at $VAULT"
fi

# JSON index
INDEX="${HOME}/.opencode/skills_index.json"
echo ""
echo "--- JSON index ---"
if [ -f "$INDEX" ]; then
    SIZE=$(du -h "$INDEX" | cut -f1)
    echo "  ✅ Index found (${SIZE})"
else
    echo "  ⚠️  Index not found — run: bash build-index.sh"
fi

# scoring.ts patch (opencode-triage)
echo ""
echo "--- Triage bridge patch ---"
CACHE_DIR="${HOME}/.cache/opencode/packages"
PATCHED=$(grep -l "bridge_search" "$CACHE_DIR"/opencode-triage@latest/node_modules/opencode-triage/src/scoring.ts 2>/dev/null || echo "")
if [ -n "$PATCHED" ]; then
    echo "  ✅ Triage scoring.ts patched with bridge"
else
    echo "  ⚠️  Triage not patched — bridge will be called from plugin only"
fi

echo ""
echo "=== Done ==="
