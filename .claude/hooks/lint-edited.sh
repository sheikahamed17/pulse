#!/usr/bin/env bash
# PostToolUse hook — lint a just-edited TypeScript/TSX file with the project's
# ESLint, so lint ERRORS (react-hooks purity, setState-in-effect, refs-in-render,
# …) surface immediately instead of only at the merge gate (where they also fail
# the Cloudflare deploy's Lint step).
#
# Reads the tool-use payload as JSON on stdin. jq isn't available here, so the
# file path is extracted with node (always present — this is a Node project).
# Exit 2 surfaces ESLint's output back to Claude; exit 0 is silent. ESLint exits
# non-zero only on ERRORS (not warnings), matching `pnpm lint`'s deploy behavior,
# so this catches exactly the deploy-breaking problems without spamming warnings.
# Never hard-blocks the session.

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

f=$(node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{process.stdout.write((JSON.parse(s).tool_input&&JSON.parse(s).tool_input.file_path)||'')}catch{}})")

case "$f" in
  *.ts|*.tsx)
    o=$(pnpm exec eslint "$f" 2>&1) || { printf 'ESLint flagged %s:\n%s\n' "$f" "$o"; exit 2; }
    ;;
esac
exit 0
