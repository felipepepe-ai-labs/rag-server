# Token Optimization — @sandman/rag-server

## How to keep token usage low in this project

### Codebase Graph (codebase-memory-mcp)
- **DO NOT reindex every session.** The graph snapshot lasts until the next structural change.
- Reindex only when: new source files are added/removed, routes change, or DB schema changes.
- In session-start: just use `get_architecture` + `search_graph` — they're cheap compared to full indexing.

### Session Management
- Run `/session-end` at the end of each work block (not just when leaving permanently). This resets the cache and avoids paying for accumulated context.
- When starting a new session after closing: run `/session-start` fresh — don't try to "continue" a stale session.

### Large File Reads
- Files >100 lines: use headroom compression before reasoning about them.
  ```bash
  headroom compress <file>   # then reason on the compressed output
  ```
- Avoid reading `node_modules/`, `pnpm-lock.yaml`, or OpenSpec artifact directories unless needed — they're already indexed in the codebase graph.

### Multi-Agent Workflows
- **Hard limit: max 10 agents per workflow.** Each agent costs ~500-800K tokens (context + synthesis). More than that is wasteful.
- Use `pipeline()` instead of `parallel()` when stages don't need cross-item context — saves wall-clock and avoids wasted agents on items no longer needed.
- If a task can be solved with a single agent, **never** use a workflow.
- For unknown-size discovery (bug finding, edge cases): prefer loop-until-count over loop-until-budget when budget is set.

### Session Lifecycle
- Run `/session-end` after completing a work block (not just at the very end). This:
  - Saves Engram context for future sessions
  - Resets Claude Code's internal cache
  - Avoids paying accumulated token cost across idle sessions
- When you notice 3+ consecutive tasks completed: suggest `/session-end` before the next task starts.
- Idle sessions >5 min lose their prompt-cache — start a fresh session instead of resuming.

### RTK Commands
- All bash commands are automatically rewritten by RTK hooks. No manual `rtk` prefix needed.
- Top money-saving patterns already active: git (80% savings), vitest (80%), grep/find (~40%).
- Run `rtk gain` to see live token usage analytics for the current session.
