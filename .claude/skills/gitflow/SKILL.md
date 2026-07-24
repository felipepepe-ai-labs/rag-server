---
name: gitflow
description: GitFlow branch management — check current state, create feature/release/hotfix branches, merge to develop/main, push, and create PR. Trigger: commit, merge, release, PR creation, 'which branch', or before any code change (via gitflow-check.sh).
allowed-tools: Bash, Read
---

## GitFlow Workflow

This project uses GitFlow with `develop` as the development branch and `main` as the production branch.

### Current State Check

```bash
git status --short
git branch -a
git log --oneline -5 develop
git log --oneline -5 main
```

### Branch Creation Rules

| Type | Command | Base Branch | Naming Convention |
|------|---------|-------------|-------------------|
| Feature | `git checkout develop && git checkout -b feature/<name>` | develop | `feature/<description>` |
| Release | `git checkout develop && git checkout -b release/<version>` | develop | `release/x.y.z` |
| Hotfix | `git checkout main && git checkout -b hotfix/<version>` | main | `hotfix/x.y.z` |

### Before Any Code Change (gate)

Run before modifying files:
```bash
# Check for pre-existing uncommitted work
git status --short
# If there are uncommitted changes, commit or stash them first
```

If a feature branch already exists for this work → use it. Don't create duplicates.

### Merging

Feature complete:
```bash
git checkout develop && git merge feature/<name> --no-edit && git checkout main
git merge develop --no-edit  # fast-forward main
```

Release complete:
```bash
git checkout main && git merge release/<version> --no-edit
git checkout develop && git merge release/<version> --no-edit
```

### Pushing and PRs

After merging to develop:
```bash
git push origin develop
```

Create PR:
```bash
gh pr create --base develop --title "<type>: <description>"
```

If no remote configured → note "No remote — cannot push" and stop.

### Branch Cleanup

Delete merged branches:
```bash
git branch -d feature/<name>
git branch -r --delete origin/feature/<name>  # if remote existed
```

## Rules

1. Never commit directly to `main` (except hotfixes)
2. Always merge develop into feature before merging feature → develop
3. PR base is always `develop`, not `main`
4. No push without confirmed remote: `git remote -v`
5. Delete branches after they're merged and pushed

## Output Contract

- Branch ops: `BRANCH:<new-branch> FROM:<base>`
- PR created: `PR:#<number> <url>`
- Errors: `ERR:{reason}` — no push without remote
