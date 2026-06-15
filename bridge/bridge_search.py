#!/usr/bin/env python3
"""
Bridge between opencode (Node.js) and PostgreSQL pgvector.
Supports: semantic search, health check, JSON export.
"""

import json, os, sys, time, hashlib, urllib.request, urllib.error
import psycopg2, redis as redis_lib

DB_DSN = os.environ.get("SKILL_DB_DSN", "dbname=skills_db user=postgres password=postgres host=localhost")
REDIS_URL = os.environ.get("SKILL_REDIS_URL", "redis://localhost:6379/0")
OLLAMA_URL = "http://localhost:11434/api/embed"
EMBED_MODEL = "nomic-embed-text"
VAULT_BASE = os.path.expanduser("~/.opencode-skills-vault")
THRESHOLD = float(os.environ.get("SKILL_THRESHOLD", "0.30"))
TOP_K = int(os.environ.get("SKILL_TOP_K", "15"))

r = redis_lib.Redis.from_url(REDIS_URL)

def embed(text):
    key = f"embed:{hashlib.md5(text.encode()[:2048]).hexdigest()}"
    try:
        cached = r.get(key)
        if cached:
            return json.loads(cached)
    except redis_lib.RedisError:
        pass
    for attempt in range(3):
        try:
            payload = json.dumps({"model": EMBED_MODEL, "input": text[:2048]}).encode()
            req = urllib.request.Request(OLLAMA_URL, data=payload, headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw_data = json.loads(resp.read())
                if not isinstance(raw_data, dict) or "embeddings" not in raw_data:
                    return None
                emb_list = raw_data["embeddings"]
                if not emb_list or not isinstance(emb_list, list):
                    return None
                emb = emb_list[0]
                try:
                    r.set(key, json.dumps(emb), ex=86400)
                except redis_lib.RedisError:
                    pass
                return emb
        except Exception:
            if attempt < 2:
                time.sleep(2 ** attempt)
            else:
                return None
    return None

def find_skill_file(dir_name):
    md_path = os.path.join(VAULT_BASE, dir_name, "SKILL.md")
    if os.path.exists(md_path):
        return md_path
    return None

def search(query, top_k=TOP_K):
    if not query or not query.strip():
        return []
    query_emb = embed(query)
    if query_emb is None:
        return []
    pg = psycopg2.connect(DB_DSN)
    try:
        with pg.cursor() as cur:
            cur.execute("""
                SELECT s.name, s.description, s.source_repo, s.dir,
                       1 - (e.embedding <=> %s::vector) AS similarity
                FROM skill_embeddings e
                JOIN skills s ON s.id = e.skill_id
                WHERE 1 - (e.embedding <=> %s::vector) > %s
                ORDER BY e.embedding <=> %s::vector
                LIMIT %s
            """, (query_emb, query_emb, THRESHOLD, query_emb, top_k))
            results = []
            for row in cur.fetchall():
                file_path = find_skill_file(row[3]) if row[3] else None
                results.append({
                    "name": row[0],
                    "description": row[1] or "",
                    "source_repo": row[2] or "",
                    "dir": row[3] or "",
                    "file_path": file_path or "",
                    "similarity": round(float(row[4]), 4),
                    "score": round(float(row[4]) * 100, 1)
                })
            return results
    finally:
        pg.close()

def check_health():
    result = {"status": "ok", "services": {}}
    try:
        conn = psycopg2.connect(DB_DSN, connect_timeout=2)
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM skills")
            row = cur.fetchone()
            skill_count = row[0] if row else 0
            result["services"]["postgres"] = {"status": "ok", "skills": skill_count}
        conn.close()
    except Exception as e:
        result["services"]["postgres"] = {"status": "error", "error": str(e)}
        result["status"] = "degraded"
    try:
        payload = json.dumps({"model": EMBED_MODEL, "input": "health"}).encode()
        req = urllib.request.Request(OLLAMA_URL, data=payload, headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=5) as resp:
            result["services"]["ollama"] = {"status": "ok", "model": EMBED_MODEL}
    except Exception as e:
        result["services"]["ollama"] = {"status": "error", "error": str(e)}
        if result["status"] == "ok":
            result["status"] = "degraded"
    try:
        r.ping()
        result["services"]["redis"] = {"status": "ok"}
    except Exception as e:
        result["services"]["redis"] = {"status": "error", "error": str(e)}
    result["vault"] = {"exists": os.path.isdir(VAULT_BASE)}
    return result

def export_index():
    query_emb = embed("export all skills")
    if query_emb is None:
        print(json.dumps({"error": "Cannot generate embedding for export"}))
        return
    pg = psycopg2.connect(DB_DSN)
    try:
        with pg.cursor() as cur:
            cur.execute("""
                SELECT s.name, s.description, s.source_repo, s.dir, e.embedding::text
                FROM skills s
                JOIN skill_embeddings e ON s.id = e.skill_id
                WHERE e.content_type = 'description'
            """)
            entries = []
            for row in cur.fetchall():
                vec_str = row[4].strip('{}')
                if not vec_str:
                    continue
                embedding = [float(x) for x in vec_str.split(',')]
                entries.append({
                    "name": row[0],
                    "description": row[1] or "",
                    "source_repo": row[2] or "",
                    "dir": row[3] or "",
                    "file_path": os.path.join(VAULT_BASE, row[3] or row[0], "SKILL.md"),
                    "embedding": embedding
                })
            print(json.dumps(entries))
    finally:
        pg.close()

def main():
    if len(sys.argv) > 1:
        if sys.argv[1] == "--health":
            print(json.dumps(check_health()))
            return
        elif sys.argv[1] == "--export-json":
            export_index()
            return
        elif sys.argv[1] == "--query":
            idx = sys.argv.index("--query") if "--query" in sys.argv else -1
            query = sys.argv[idx + 1] if idx >= 0 and idx + 1 < len(sys.argv) else ""
            top_k = TOP_K
            if "--top-k" in sys.argv:
                tk_idx = sys.argv.index("--top-k")
                if tk_idx + 1 < len(sys.argv):
                    try:
                        top_k = int(sys.argv[tk_idx + 1])
                    except ValueError:
                        pass
            if "--threshold" in sys.argv:
                th_idx = sys.argv.index("--threshold")
                if th_idx + 1 < len(sys.argv):
                    try:
                        THRESHOLD = float(sys.argv[th_idx + 1])
                    except ValueError:
                        pass
            results = search(query, top_k)
            print(json.dumps(results, ensure_ascii=False))
            return
        try:
            input_data = json.loads(sys.argv[1])
        except json.JSONDecodeError:
            print(json.dumps({"error": f"Invalid JSON or unknown flag: {sys.argv[1]}"}), file=sys.stderr)
            sys.exit(1)
    else:
        input_data = json.loads(sys.stdin.read())

    query = input_data.get("query", "").strip()
    top_k = input_data.get("top_k", TOP_K)
    if not query:
        print(json.dumps([]))
        return
    results = search(query, top_k)
    print(json.dumps(results, ensure_ascii=False))

if __name__ == "__main__":
    main()
