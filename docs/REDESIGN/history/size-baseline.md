# 🦐 Size baseline

The paths below are old Shrimpy's, under `shrimpy-old/` since 2026-10-04.

Measured at `574bb2c` from tracked files. Counts are raw lines, including blanks and comments.

```bash
for d in src/*/ extensions web test; do printf '%-18s %6s\n' "$d" "$(git ls-files "$d" | grep -E '\.(ts|tsx|js|mjs|css|html)$' | xargs cat | wc -l)"; done
```

| Area | Lines |
|---|---|
| `src/commands/` | 7,436 |
| `src/sessions/` | 6,108 |
| `src/surfaces/` | 4,426 |
| `src/context/` | 3,964 |
| `src/skills/` | 3,824 |
| `src/channels/` | 3,211 |
| `src/tui/` | 2,498 |
| `src/gateway/` | 2,282 |
| `src/watches/` | 2,238 |
| `src/setup/` | 1,908 |
| `src/workers/` | 1,424 |
| `src/workspace/` | 1,301 |
| `src/agents/` | 1,200 |
| `src/config/` | 811 |
| `src/tools/` | 605 |
| `src/app/` | 599 |
| `src/instructions/` | 438 |
| `src/util/` | 378 |
| `src/update/` | 356 |
| `src/cli.ts`, `src/gateway.ts` | 235 |
| root `extensions/` | 192 |
| `src/inference/` | 102 |
| **`src/` and `extensions/`** | **45,536** |
| `web/` | 3,099 |
| `test/` | 27,026 |

Each review pause adds a row to the size log. Note any directory that grew or shrank unexpectedly beside it.

| Phase | `src/` + `extensions/` | `web/` | `test/` | Net vs baseline |
|---|---|---|---|---|
| Baseline `574bb2c` | 45,536 | 3,099 | 27,026 | — |
| 0. Spike `a3c6ae4` | 45,536 | 3,099 | 27,026 | 0 in the old tree; `next/spike/` adds 2,054 lines of probe code |
| Seed: spike realigned | 45,536 | 3,099 | 27,026 | 0 in the old tree; `next/` holds 1,803 lines (about 800 of product code, 780 of tests and test support, 220 of lint) and the spike's code is gone |
| Review pause, 2026-10-05 | 45,536 | 3,099 | 27,026 | 0 in the old tree, which is `shrimpy-old/` now. The new tree's `src/` holds 20,080 lines of product code, 13,403 of tests and 4,441 of test support, and `lint/` holds 265 |
