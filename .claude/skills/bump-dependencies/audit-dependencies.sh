#!/bin/bash
# audit-dependencies.sh — consolidated `pnpm audit` across every plugin workspace.
#
# Runs `pnpm audit` in every folder that has its own pnpm-lock.yaml — the repo
# root (commitlint/lint-staged/prettier tooling) and each plugin — and prints a
# single deduplicated table (one row per advisory, with the workspaces it
# affects): the Dependabot-style overview a per-folder loop can't give.
# Dependabot scans the root lockfile too, so skipping it hides real alerts.
#
# Usage (from the repo root):
#   ./.claude/skills/bump-dependencies/audit-dependencies.sh [severity]
#
#   severity (optional): low | moderate | high | critical
#     Only advisories at or above this level count. Default: low (all).
#
# Exit codes:
#   0  no fixable advisory at/above the threshold remains (advisories with no
#      patched release at all may still be listed — report them, they can't
#      be fixed yet)
#   1  at least one fixable advisory remains — fix it before shipping. An
#      advisory whose patched range is unknown counts as fixable until a
#      look at its vulnerable range proves otherwise.
#   2  an audit could not run or its output could not be parsed (network
#      error, broken lockfile). Never read this as "clean".

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

# Discover workspaces: the repo root plus every depth-1 dir with its own lockfile.
PLUGINS=()
[ -f pnpm-lock.yaml ] && PLUGINS+=(".")
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
    # `pnpm audit` exits non-zero whenever it finds advisories, so its exit
    # code can't tell "found vulnerabilities" from "failed to run"; the
    # JSON parse below does.
    pnpm -C "$p" audit --json > "$TMPDIR_AUDIT/$( [ "$p" = . ] && echo _root || echo "$p").json" 2>/dev/null || true
done

python3 - "$TMPDIR_AUDIT" "$MIN_RANK" "${PLUGINS[@]}" <<'PY'
import sys, os, json
from collections import defaultdict

tmp = sys.argv[1]
min_rank = int(sys.argv[2])
plugins = sys.argv[3:]
RANK = {"low": 1, "moderate": 2, "high": 3, "critical": 4, "info": 0}

adv = {}                       # id -> advisory dict
affected = defaultdict(set)    # id -> {workspace}
failed = []
for p in plugins:
    name = "(root)" if p == "." else p
    path = os.path.join(tmp, "_root.json" if p == "." else f"{p}.json")
    try:
        data = json.load(open(path))
        if not isinstance(data, dict) or "error" in data or "advisories" not in data:
            raise ValueError(str(data)[:200])
    except Exception as e:
        failed.append((name, str(e)[:200]))
        continue
    for aid, a in (data.get("advisories") or {}).items():
        adv[aid] = a
        affected[aid].add(name)

if failed:
    print("\n✗ Audit failed for: " + ", ".join(n for n, _ in failed), file=sys.stderr)
    for n, e in failed:
        print(f"  {n}: {e}", file=sys.stderr)

if not adv:
    if failed:
        sys.exit(2)
    print(f"\n✓ No known vulnerabilities in any workspace ({len(plugins)} audited, incl. root).")
    sys.exit(0)

rows = []
for aid, a in adv.items():
    sev = a.get("severity", "info")
    patched = a.get("patched_versions", "") or ""
    # `<0.0.0` is pnpm's marker for "no patched release". A missing range is
    # unknown, not unfixable: e.g. a `=3.1.6`-only advisory is fixed by any
    # other release, so it must still be chased.
    fixable = "NO" if patched == "<0.0.0" else ("yes" if patched else "?")
    rows.append((RANK.get(sev, 0), sev, a.get("module_name", "?"),
                 (a.get("vulnerable_versions") or "")[:15],
                 (patched or "")[:13], fixable, ",".join(sorted(affected[aid])),
                 (a.get("title") or "").strip()[:46], a.get("url", "")))
rows.sort(key=lambda r: (-r[0], r[2]))

print(f"\n{'sev':<9}{'package':<22}{'vulnerable':<16}{'patched':<14}{'fix':<5}title")
print("-" * 100)
fixable_left = 0
for rank, sev, mod, vuln, patched, fixable, where, title, url in rows:
    if rank >= min_rank and fixable != "NO":
        fixable_left += 1
    print(f"{sev:<9}{mod:<22}{vuln:<16}{patched:<14}{fixable:<5}{title}")
    print(f"{'':<9}{url}")
    print(f"{'':<9}in: {where}")

tot = defaultdict(int)
for r in rows:
    tot[r[1]] += 1
print(f"\n{len(rows)} unique advisories: " + ", ".join(f"{k} {v}" for k, v in
      sorted(tot.items(), key=lambda kv: -RANK.get(kv[0], 0))))

if failed:
    sys.exit(2)
if fixable_left:
    print(f"✗ {fixable_left} fixable advisor{'y' if fixable_left == 1 else 'ies'} at/above the threshold remain. Fix them before shipping.")
    sys.exit(1)
print("✓ No fixable advisories remain. List the unfixable ones above in the PR.")
sys.exit(0)
PY
