#!/bin/bash
set -e

echo "=== Rebuilding skills index ==="

mkdir -p ~/.opencode

python3 -c "
import json, os, sys

DB_DSN = os.environ.get('SKILL_DB_DSN', 'dbname=skills_db user=postgres password=postgres host=localhost')
import psycopg2

conn = psycopg2.connect(DB_DSN)
cur = conn.cursor()

cur.execute('''
    SELECT s.name, s.description, s.source_repo, s.dir, e.embedding::text
    FROM skills s
    JOIN skill_embeddings e ON s.id = e.skill_id
    WHERE e.content_type = 'description'
''')

entries = []
count = 0
for row in cur.fetchall():
    vec_str = row[4].strip()
    # pgvector text format: [0.1,0.2,0.3,...]
    if not vec_str or vec_str == '[]':
        continue
    # strip brackets
    inner = vec_str.strip('[]')
    if not inner:
        continue
    embedding = [float(x) for x in inner.split(',')]
    skill_dir = row[3] or row[0]
    entries.append({
        'name': row[0],
        'description': row[1] or '',
        'source_repo': row[2] or '',
        'dir': skill_dir,
        'file_path': f'/home/ubuntu/.opencode-skills-vault/{skill_dir}/SKILL.md',
        'embedding': embedding
    })
    count += 1

index_path = os.path.expanduser('~/.opencode/skills_index.json')
with open(index_path, 'w') as f:
    json.dump(entries, f)

cur.close()
conn.close()

print(f'Index: {count} skills written to {index_path}')
print(f'Size: {os.path.getsize(index_path)} bytes')
"
