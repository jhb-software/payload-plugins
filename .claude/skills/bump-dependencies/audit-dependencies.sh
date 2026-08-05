#!/bin/bash
# audit-dependencies.sh — consolidated `pnpm audit` across every plugin workspace.
#
# Runs `pnpm audit` in each folder that has its own pnpm-lock.yaml and prints a
# single deduplicated table (one row per advisory, with the count of affected
# plugins) — the Dependabot-style overview that a per-folder loop can't give.
#
# Usage (from the repo root):
#   ./.claude/skills/bump-dependencies/audit-dependencies.sh [severity]
#
#   severity (optional): low | moderate | high | critical
#     Exit non-zero only when an advisory at or above this level remains.
#     Default: any advisory (low) fails. Use `high` for a CI gate that
#     tolerates dev-only moderate/low noise.

set -uo pipefail

THRESHOLD="${1:-low}"
# macOS ships bash 3.2 (no associative arrays); use a case lookup.
rank_of() {
    case "$1" in
        low) echo 1 ;; moderate) echo 2 ;; high) echo 3 ;; critical) echo 4 ;;
        *) echo 1 ;;
    esac
}
MIN_RANK="$(rank_of "$THRESHOLD")"

# Discover workspaces: every depth-1 dir with its own lockfile.
PLUGINS=()
for lock in */pnpm-lock.yaml; do
    [ -f "$lock" ] && PLUGINS+=("$(dirname "$lock")")
done
if [ ${#PLUGINS[@]} -eq 0 ]; then
    echo "No */pnpm-lock.yaml found. Run this from the repo root." >&2
    exit 2
fi

TMPDIR_AUDIT="$(mktemp -d)"
trap 'rm -f "$TMPDIR_AUDIT"/*.json 2>/dev/null; rmdir "$TMPDIR_AUDIT" 2>/dev/null' EXIT

for p in "${PLUGINS[@]}"; do
    pnpm -C "$p" audit --json > "$TMPDIR_AUDIT/$p.json" 2>/dev/null || true
done

python3 - "$TMPDIR_AUDIT" "$MIN_RANK" "${PLUGINS[@]}" <<'PY'
import sys, os, json
from collections import defaultdict

tmp = sys.argv[1]
min_rank = int(sys.argv[2])
plugins = sys.argv[3:]
RANK = {"low": 1, "moderate": 2, "high": 3, "critical": 4, "info": 0}

adv = {}                       # id -> advisory dict
affected = defaultdict(set)    # id -> {plugin}
for p in plugins:
    path = os.path.join(tmp, f"{p}.json")
    try:
        data = json.load(open(path))
    except Exception:
        continue
    for aid, a in (data.get("advisories") or {}).items():
        adv[aid] = a
        affected[aid].add(p)

if not adv:
    print("\n✓ No known vulnerabilities in any workspace.")
    sys.exit(0)

rows = []
for aid, a in adv.items():
    sev = a.get("severity", "info")
    patched = a.get("patched_versions", "") or ""
    fixable = "yes" if patched and patched not in ("<0.0.0", "") else "NO"
    rows.append((RANK.get(sev, 0), sev, a.get("module_name", "?"),
                 (a.get("vulnerable_versions") or "")[:15],
                 (patched or "")[:13], fixable, len(affected[aid]),
                 (a.get("title") or "").strip()[:46], a.get("url", "")))
rows.sort(key=lambda r: (-r[0], r[2]))

print(f"\n{'sev':<9}{'package':<22}{'vulnerable':<16}{'patched':<14}{'fix':<5}{'#plug':<6}title")
print("-" * 100)
worst = 0
for rank, sev, mod, vuln, patched, fixable, n, title, url in rows:
    worst = max(worst, rank)
    print(f"{sev:<9}{mod:<22}{vuln:<16}{patched:<14}{fixable:<5}{n:<6}{title}")
    print(f"{'':<9}{url}")

tot = defaultdict(int)
for r in rows:
    tot[r[1]] += 1
print(f"\n{len(rows)} unique advisories: " + ", ".join(f"{k} {v}" for k, v in
      sorted(tot.items(), key=lambda kv: -RANK.get(kv[0], 0))))

# Exit non-zero when anything at/above the threshold remains.
sys.exit(1 if worst >= min_rank else 0)
PY
