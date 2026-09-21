#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/.."

FILES=(
  tests/stateMachine.test.ts
  tests/hashing.test.ts
  tests/validation.test.ts
  tests/dto.test.ts
  tests/rateLimiter.test.ts
  tests/idempotency.test.ts
  tests/workerLifecycle.test.ts
  tests/reEvaluation.test.ts
  tests/sweeper.test.ts
  tests/resultAggregation.test.ts
  tests/executionProvider.test.ts
  tests/api.test.ts
  tests/reactRender.test.ts
  tests/endToEnd.test.ts
)

total_files=0
failed_files=0

for f in "${FILES[@]}"; do
  total_files=$((total_files + 1))
  echo "=============================================================="
  echo "RUNNING: $f"
  echo "=============================================================="
  if ! npx tsx "$f"; then
    failed_files=$((failed_files + 1))
    echo "!!! FAILED: $f !!!"
  fi
done

echo ""
echo "=============================================================="
echo "SUMMARY: $((total_files - failed_files))/$total_files test files passed"
echo "=============================================================="

if [ "$failed_files" -ne 0 ]; then
  exit 1
fi
