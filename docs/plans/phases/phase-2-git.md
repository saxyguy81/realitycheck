# Phase 2: Git Baseline and Fingerprinting

## Overview

Implement git-based change tracking for evidence gathering. The GitManager provides workspace fingerprinting and diff utilities that the Stop hook uses to assess what changed during a task.

## Prerequisites

**Files that must exist from Phase 1:**
- `package.json`, `tsconfig.json` - Project configuration
- `src/types/index.ts` - Core type definitions
- `src/config/index.ts` - Configuration system
- `src/ledger/index.ts` - LedgerManager

**Verify Phase 1 complete:**
```bash
npm run build  # Should succeed
npm test       # Should pass
```

## Context

RealityCheck needs to track workspace changes to:
1. Create a baseline snapshot when a task starts
2. Compute fingerprints to detect if work is happening between stop attempts
3. Generate diffs to show the judge what changed

The system degrades gracefully for non-git projects.

## Deliverables

### 1. Git Manager (`src/git/index.ts`)

```typescript
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface GitStatus {
  isRepo: boolean;
  headCommit?: string;
  branch?: string;
  dirtyFiles: string[];
  untrackedFiles: string[];
}

export interface GitDiff {
  files: Array<{
    path: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    additions: number;
    deletions: number;
  }>;
  summary: string;
  patch?: string;
}

export class GitManager {
  constructor(private projectDir: string) {}

  isGitRepo(): boolean
  getStatus(): GitStatus
  computeFingerprint(): string
  getDiffSince(baselineCommit: string): GitDiff | null
  getCurrentDiff(options?: { maxSize?: number }): GitDiff | null
  createBaseline(snapshotDir: string): Promise<{
    headCommit?: string;
    timestamp: string;
    dirtyFiles: string[];
  }>
}
```

### Key Implementation Details

**`isGitRepo()`**
- Run `git rev-parse --git-dir` in project directory
- Return true if exits 0, false otherwise

**`getStatus()`**
- If not a git repo, return `{ isRepo: false, dirtyFiles: [], untrackedFiles: [] }`
- Parse `git status --porcelain` output
- Lines starting with `??` are untracked
- All other non-empty lines are dirty files

**`computeFingerprint()`**
- Combines `git diff HEAD` + `git status --porcelain`
- Returns SHA-256 hash (first 16 chars)
- For non-git repos: hash of file mtimes for key files (package.json, tsconfig.json)

**`getCurrentDiff(options)`**
- Uses `git diff --stat HEAD` for summary
- Uses `git diff --numstat HEAD` for file-level stats
- Optionally includes full patch if under maxSize (default 50KB)

**`createBaseline(snapshotDir)`**
- Gets current status
- Copies all dirty/untracked files to snapshotDir for later comparison
- Returns baseline info for storing in ledger

### 2. Export from index (`src/index.ts`)

Add:
```typescript
export * from './git/index.js';
```

### 3. Unit Tests (`src/git/index.test.ts`)

Test cases:
- `isGitRepo()` returns false for non-git directory
- `isGitRepo()` returns true for git directory
- `computeFingerprint()` returns consistent hash for unchanged workspace
- `computeFingerprint()` returns different hash after file modification
- `getStatus()` correctly identifies dirty and untracked files
- `getCurrentDiff()` returns null for non-git repos
- `createBaseline()` copies dirty files to snapshot directory

Use temp directories with `fs.mkdtempSync()` for isolation.

## Verification Criteria

### Automated
- [ ] `npm run build` succeeds
- [ ] `npm test -- src/git` passes all git tests

### Manual
- [ ] In a git repo: `computeFingerprint()` returns consistent hash
- [ ] Modify a file, call `computeFingerprint()` again - hash changes
- [ ] `createBaseline()` copies dirty files to snapshot directory
- [ ] In a non-git directory: methods degrade gracefully (no errors)

## Implementation Notes

1. Use `execSync` with `{ cwd: projectDir, encoding: 'utf-8', stdio: 'pipe' }`
2. Wrap git commands in try-catch - some may fail in edge cases
3. Set `maxBuffer: 10 * 1024 * 1024` for large diffs
4. The fingerprint is used for loop detection - different fingerprint = work happened

## After Completion

Run `/clear` and proceed to **Phase 3: Hook Implementations**.
