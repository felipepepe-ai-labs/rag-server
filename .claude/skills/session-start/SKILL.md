---
name: session-start
description: Load project context at session start. Run once per session to re-establish state — branch, git status, engram memory, codebase graph, active specs.
allowed-tools: Bash, Read, mcp__codebase-memory-mcp*, mcp__plugin_engram_engram*
---

## When to Use This Skill

- The user opens a new session on a project and wants to resume context
- The user says "where did we leave off", "bring me up to speed", "project state"
- Before starting to code in a non-trivial repo (more than 5 files)

Do NOT use if:
- The user asks something specific that does NOT require reloading project context
- session-start has already been run in this same session

---

## Protocol

Execute steps in parallel where possible. Read only — write nothing to disk.

### Step 1 — Git State (parallel)

```bash
git status --short
git branch --show-current
git log --oneline -5
git stash list
```

Flag uncommitted changes or stashes in the briefing.

### Step 2 — Codebase Graph (if indexed)

```bash
# via MCP: get_architecture(project), index_status(project)
```

If codebase graph exists → note it. If stale, flag but do not block.

### Step 3 — Persistent Memory (parallel)

- `mem_context(project=<current>)` — recent observations from Engram
- Direct read of project STATE/IMPLEMENTATION_SUMMARY if they exist
- For SDD projects: check `openspec/changes/*/tasks.md` for pending checkboxes

### Step 4 — Active Spec (SDD projects)

Read the last spec with pending checkboxes (`- [ ]`) and recent edit.

```bash
find openspec/changes -name "tasks.md" -newer openspec/config.yaml | sort | tail -3
```

### Step 5 — Briefing to User

Return a structured summary:

```
## Resumption point — <project>

**Branch:** <branch> · **Last commit:** <hash> <msg>
**Uncommitted changes:** <N files> | none
**Codebase graph:** indexed as of <commit/date> | stale (N behind) | not indexed

### Project state
- <bullet with key metrics from STATE/IMPLEMENTATION_SUMMARY>
- <bullet with active spec if any>

### Suggested next step
<1-2 concrete sentences based on the last journal and pending tasks>
```

**Onboarding variant — first contact.** When all memory is empty:

```
## First contact — <project>

### What it is
<purpose in 2-3 lines from README/CLAUDE.md>

### Stack & conventions
<manifests: language, framework, package manager, test runner>
<CLAUDE.md rules>

### Structure
<directory tree / entry points>

### Entry points & hotspots
<main/server/app + top fan-in symbols>

### How to run / test
<build, test, dev commands>

### Health signals
<tests present?, CI?, uncommitted work?>
```

After the briefing → STOP. Do not propose code or begin tasks until the user replies.

---

## Operational Rules

- Read only. Write nothing to disk.
- Parallelize reads where possible (git + mem_context + stat).
- Fail gracefully: if MCP/memory doesn't respond → omit that section, don't block.
