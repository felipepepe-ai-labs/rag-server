---
name: session-end
description: Close a coding session — save engram summaries, reindex codebase graph if changed, update app docs. Run when task completes or user says goodbye.
allowed-tools: Bash, Read, mcp__plugin_engram_engram*, Bash(openspec:*)
---

## When to Use This Skill

- Task is complete and user is stepping away
- User says "done", "goodbye", "bye", "I'm leaving"
- Before session compaction to preserve accumulated context
- At the end of any SDD cycle

Do NOT use if:
- The task is still in progress
- The user is actively working on something else

---

## Protocol

Execute steps in order.

### Step 1 — Engram Session Summary

```
mem_session_summary(content: "{full summary with Goal, Instructions, Discoveries, Accomplished, Next Steps, Relevant Files}")
```

Content format:
```
## Goal
[One sentence: what was accomplished]

## Instructions
[User preferences and constraints discovered during session]

## Discoveries
- [Technical finding, gotcha, or learning 1]
- [Technical finding 2]
- [Important API behavior, config quirk, etc.]

## Accomplished
- ✅ [Completed task with key details]
- 🔲 [Identified but not done — for next session]

## Next Steps
- [What remains to be done]

## Relevant Files
- path/to/file.ts — what it does or changed
```

### Step 2 — Codebase Graph Reindex (if codebase was modified)

If files in `src/` were added, removed, or modified:
```bash
# via MCP: index_repository(repo_path, mode='moderate')
```

Reindexing is a compute action — confirm with user before running.

### Step 3 — Update App Docs (if architecture changed)

If the change adds/removes entry points, changes architecture, or adds new patterns:
- Read `cognitive-doc-design` guidelines
- Update relevant documentation to reflect current state
- Keep docs in sync with code structure

### Step 4 — Skill Registry Reindex (if skills changed)

If any `.claude/skills/` files were created or modified:
```bash
# Regenerate .atl/skill-registry.md if the project uses gentle-ai skill-registry
# Or update manually to reflect new/changed skills
```

### Step 5 — Confirm Completion

Report what was saved:
```
## Session End Summary

- Engram: session summary saved (Goal, Discoveries, Accomplished)
- Codebase graph: reindexed | skipped (no src changes)
- App docs: updated | skipped (no architecture change)
- Skill registry: updated if skills changed
```

---

## Rules

- **MANDATORY**: Session is not closed until mem_session_summary has been called
- Reindexing requires user confirmation — don't auto-run heavy ops
- Keep the session summary concise but actionable for the next session
