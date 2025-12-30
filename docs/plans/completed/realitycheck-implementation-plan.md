# RealityCheck Implementation Plan

## Overview

RealityCheck is a Claude Code plugin that acts as a quality gate to ensure task completion. It intercepts the agent's Stop events and evaluates whether the user's original request (including any mid-task feedback) has been fully implemented. If not, it either forces the agent to continue working or requires the agent to ask the user clarifying questions.

The system uses an **event-sourced Task Ledger** architecture with a **courthouse model**: every user directive is captured, evidence is gathered through git diffs and command logs, and an external **Judge** (a separate Claude process) evaluates completion before allowing the session to stop.

## Current State Analysis

- **Codebase**: Greenfield project (empty directory)
- **Target Runtime**: TypeScript/Node.js
- **Hook System**: Claude Code supports 10 hook event types with command-type hooks receiving full JSON input via stdin
- **Key Constraint**: Prompt-based Stop hooks only receive metadata (not transcript content), so we must use command-type hooks that read files directly

### Key Discoveries from Research:

- Stop hooks can block completion by returning `{"decision": "block", "reason": "..."}` (hooks.md)
- `stop_hook_active` field prevents infinite loops (hooks.md)
- `transcript_path` points to JSONL session transcript (hooks.md)
- UserPromptSubmit receives `prompt` field with raw user input (hooks.md)
- CLI flags `--tools ""`, `--setting-sources`, `--max-turns` enable isolated judge processes (cli-reference.md)
- Agent SDK supports programmatic `/compact` and `/clear` for testing (agent-sdk/slash-commands)

## Desired End State

A fully functional RealityCheck plugin that:

1. **Captures all user intent** - Every prompt (including mid-task feedback) is recorded in a durable Task Ledger
2. **Tracks evidence** - Git baseline snapshots and workspace fingerprints track what changed
3. **Enforces completion** - Stop hook blocks premature completion with specific next-step instructions
4. **Intelligent loop detection** - Detects forward progress vs stuck loops; exits gracefully when appropriate
5. **Language-agnostic** - Does not hardcode linters/test tools; relies on LLM judge to understand context
6. **Performant** - Minimizes latency through caching, early exits, and parallel operations
7. **Testable** - Comprehensive test suite using Agent SDK

### Verification Criteria (All Automated):

- [ ] `npm run build` succeeds with no TypeScript errors
- [ ] `npm test` passes all unit tests
- [ ] `npm run test:e2e` passes all e2e/integration tests
- [ ] Plugin installs correctly via `npm link` (verified by e2e test)
- [ ] E2E test confirms Stop hook blocks incomplete tasks (mocked judge)
- [ ] E2E test confirms mid-task feedback is preserved in ledger
- [ ] Performance: Stop hook completes in <5 seconds (verified by test timeout)

## What We're NOT Doing

- **Not replacing Claude Code's built-in compaction** - We work alongside it, not against it
- **Not implementing language-specific linters** - The judge LLM determines if tests/linting should have run
- **Not building a CI/CD system** - This is a quality gate, not a full pipeline
- **Not requiring git** - Git baseline is optional; plugin degrades gracefully without it
- **Not modifying user files** - Plugin only reads and creates state files in `.claude/realitycheck/`

## Implementation Approach

### Architecture Overview

```
                                    ┌─────────────────────┐
                                    │   Task Ledger       │
                                    │ .claude/realitycheck/    │
                                    │  task_ledger.json   │
                                    └─────────┬───────────┘
                                              │
     ┌────────────────┐                       │
     │ UserPromptSubmit├───── Updates ────────┤
     │     Hook       │                       │
     └────────────────┘                       │
                                              │
     ┌────────────────┐                       │
     │ PostToolUse    ├───── Records ─────────┤
     │ (Bash) Hook    │     fingerprints      │
     └────────────────┘                       │
                                              │
     ┌────────────────┐     ┌─────────┐       │
     │   Stop Hook    ├────►│  Judge  │◄──────┤
     │                │     │(claude -p)      │
     └───────┬────────┘     └────┬────┘       │
             │                   │            │
             │◄─── RealityCheck ──┘            │
             │                                │
             ▼                                │
     ┌───────────────┐                        │
     │ Block/Allow   │                        │
     │  Decision     │                        │
     └───────────────┘                        │
                                              │
     ┌────────────────┐                       │
     │  SessionStart  ├───── Restores ────────┘
     │     Hook       │     state after /clear
     └────────────────┘
```

### Core Components

1. **Task Ledger** (`src/ledger/`) - Event-sourced storage for directives, criteria, and status
2. **Git Baseline** (`src/git/`) - Snapshot and diff utilities
3. **Hooks** (`src/hooks/`) - UserPromptSubmit, PostToolUse, Stop, SessionStart
4. **Judge** (`src/judge/`) - External Claude process for semantic evaluation
5. **CLI** (`src/cli/`) - Entry point for hooks, invoked by Claude Code
6. **Config** (`src/config/`) - Settings management with sensible defaults

---

## Phase 1: Project Setup and Core Infrastructure

### Overview
Set up the TypeScript project structure, define core types, and implement the Task Ledger.

### Changes Required:

#### 1. Project Configuration

**File**: `package.json`
```json
{
  "name": "realitycheck",
  "version": "0.1.0",
  "description": "RealityCheck - Claude Code quality gate plugin that ensures task completion",
  "main": "dist/index.js",
  "bin": {
    "realitycheck": "./dist/cli/index.js"
  },
  "scripts": {
    "build": "tsc",
    "watch": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "lint": "eslint src/**/*.ts",
    "typecheck": "tsc --noEmit",
    "check": "npm run typecheck && npm run lint && npm run test"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0",
    "eslint": "^8.56.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0"
  },
  "dependencies": {
    "zod": "^3.22.0"
  }
}
```

**File**: `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

#### 2. Core Types

**File**: `src/types/index.ts`
```typescript
import { z } from 'zod';

// === Hook Input Schemas ===

export const BaseHookInputSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string(),
  cwd: z.string(),
  permission_mode: z.enum(['default', 'plan', 'acceptEdits', 'bypassPermissions']).optional(),
  hook_event_name: z.string(),
});

export const UserPromptSubmitInputSchema = BaseHookInputSchema.extend({
  hook_event_name: z.literal('UserPromptSubmit'),
  prompt: z.string(),
});

export const StopHookInputSchema = BaseHookInputSchema.extend({
  hook_event_name: z.literal('Stop'),
  stop_hook_active: z.boolean(),
});

export const PostToolUseInputSchema = BaseHookInputSchema.extend({
  hook_event_name: z.literal('PostToolUse'),
  tool_name: z.string(),
  tool_input: z.record(z.unknown()),
  tool_response: z.unknown(),
  tool_use_id: z.string(),
});

export const SessionStartInputSchema = BaseHookInputSchema.extend({
  hook_event_name: z.literal('SessionStart'),
  source: z.enum(['startup', 'resume', 'clear', 'compact']),
});

// === Hook Output Schemas ===

export const HookDecisionSchema = z.object({
  decision: z.enum(['block', 'approve', 'allow', 'deny', 'undefined']).optional(),
  reason: z.string().optional(),
  continue: z.boolean().optional(),
  stopReason: z.string().optional(),
  suppressOutput: z.boolean().optional(),
  systemMessage: z.string().optional(),
});

// === Task Ledger Schemas ===

export const DirectiveStatusSchema = z.enum([
  'active',        // Currently applicable
  'superseded',    // Replaced by a later directive
  'completed',     // Marked done by judge
  'abandoned',     // User explicitly cancelled
]);

export const DirectiveSchema = z.object({
  id: z.string(),
  timestamp: z.string().datetime(),
  rawText: z.string(),
  normalizedIntent: z.string().optional(),
  type: z.enum(['initial', 'feedback', 'clarification', 'correction']),
  status: DirectiveStatusSchema,
  supersededBy: z.string().optional(),
  sourcePromptIndex: z.number(),
});

export const AcceptanceCriterionSchema = z.object({
  id: z.string(),
  description: z.string(),
  derivedFrom: z.array(z.string()), // Directive IDs
  status: z.enum(['pending', 'satisfied', 'failed', 'blocked']),
  evidence: z.string().optional(),
});

export const StopAttemptSchema = z.object({
  timestamp: z.string().datetime(),
  attemptNumber: z.number(),
  verdict: z.enum(['blocked', 'allowed']),
  reason: z.string(),
  workspaceFingerprint: z.string().optional(),
  judgeAnalysis: z.object({
    missingItems: z.array(z.string()),
    questionsForUser: z.array(z.string()),
    forwardProgress: z.boolean(),
    convergenceEstimate: z.number().optional(), // Estimated attempts to completion
  }).optional(),
});

export const TaskLedgerSchema = z.object({
  version: z.literal(1),
  taskId: z.string(),
  sessionId: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),

  // Git baseline (optional)
  baseline: z.object({
    headCommit: z.string().optional(),
    timestamp: z.string().datetime(),
    dirtyFiles: z.array(z.string()),
    baselineSnapshotPath: z.string().optional(),
  }).optional(),

  // User directives (append-only, with supersession)
  directives: z.array(DirectiveSchema),

  // Derived acceptance criteria
  acceptanceCriteria: z.array(AcceptanceCriterionSchema),

  // Open questions that must be answered
  openQuestions: z.array(z.string()),

  // Evidence: workspace fingerprints after commands
  fingerprints: z.array(z.object({
    timestamp: z.string().datetime(),
    hash: z.string(),
    afterCommand: z.string().optional(),
  })),

  // Stop attempt history (for loop detection)
  stopAttempts: z.array(StopAttemptSchema),

  // Configurable limits
  config: z.object({
    maxConsecutiveFailures: z.number().default(20),
    maxTotalAttempts: z.number().default(50),
    judgeModel: z.enum(['opus', 'sonnet']).default('opus'),
  }),
});

// Type exports
export type BaseHookInput = z.infer<typeof BaseHookInputSchema>;
export type UserPromptSubmitInput = z.infer<typeof UserPromptSubmitInputSchema>;
export type StopHookInput = z.infer<typeof StopHookInputSchema>;
export type PostToolUseInput = z.infer<typeof PostToolUseInputSchema>;
export type SessionStartInput = z.infer<typeof SessionStartInputSchema>;
export type HookDecision = z.infer<typeof HookDecisionSchema>;
export type Directive = z.infer<typeof DirectiveSchema>;
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>;
export type StopAttempt = z.infer<typeof StopAttemptSchema>;
export type TaskLedger = z.infer<typeof TaskLedgerSchema>;
```

#### 3. Configuration System

**File**: `src/config/index.ts`
```typescript
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

export const RealityCheckConfigSchema = z.object({
  // Judge settings
  judge: z.object({
    model: z.enum(['opus', 'sonnet']).default('opus'),
    timeout: z.number().default(30000), // ms
    maxTokens: z.number().default(4096),
  }).default({}),

  // Loop detection
  limits: z.object({
    maxConsecutiveFailures: z.number().default(20),
    maxTotalAttempts: z.number().default(50),
    noProgressThreshold: z.number().default(5), // consecutive attempts with no progress
  }).default({}),

  // Storage
  storage: z.object({
    basePath: z.string().default('.claude/realitycheck'),
  }).default({}),

  // Git integration
  git: z.object({
    enabled: z.boolean().default(true),
    snapshotDirtyFiles: z.boolean().default(true),
  }).default({}),

  // Performance
  performance: z.object({
    skipJudgeIfDeterministicPass: z.boolean().default(true),
    cacheJudgeResults: z.boolean().default(true),
    parallelFingerprinting: z.boolean().default(true),
  }).default({}),

  // Debug
  debug: z.object({
    verbose: z.boolean().default(false),
    logPath: z.string().optional(),
  }).default({}),
});

export type RealityCheckConfig = z.infer<typeof RealityCheckConfigSchema>;

const CONFIG_FILENAME = 'realitycheck.config.json';

export function loadConfig(projectDir: string): RealityCheckConfig {
  const configPaths = [
    path.join(projectDir, '.claude', CONFIG_FILENAME),
    path.join(projectDir, CONFIG_FILENAME),
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        return RealityCheckConfigSchema.parse(raw);
      } catch (e) {
        // Log warning but continue with defaults
        console.error(`Warning: Failed to parse ${configPath}: ${e}`);
      }
    }
  }

  return RealityCheckConfigSchema.parse({});
}

export function getStoragePath(config: RealityCheckConfig, projectDir: string): string {
  return path.join(projectDir, config.storage.basePath);
}
```

#### 4. Task Ledger Implementation

**File**: `src/ledger/index.ts`
```typescript
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import {
  TaskLedger,
  TaskLedgerSchema,
  Directive,
  AcceptanceCriterion,
  StopAttempt,
} from '../types/index.js';
import { RealityCheckConfig, getStoragePath } from '../config/index.js';

const LEDGER_FILENAME = 'task_ledger.json';

export class LedgerManager {
  private ledger: TaskLedger | null = null;
  private ledgerPath: string;

  constructor(
    private config: RealityCheckConfig,
    private projectDir: string,
    private sessionId: string,
  ) {
    const storagePath = getStoragePath(config, projectDir);
    this.ledgerPath = path.join(storagePath, LEDGER_FILENAME);
  }

  /**
   * Initialize or load existing ledger
   */
  async initialize(): Promise<TaskLedger> {
    // Ensure storage directory exists
    const storageDir = path.dirname(this.ledgerPath);
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    // Try to load existing ledger
    if (fs.existsSync(this.ledgerPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.ledgerPath, 'utf-8'));
        this.ledger = TaskLedgerSchema.parse(raw);

        // Update session ID if different (session resumed)
        if (this.ledger.sessionId !== this.sessionId) {
          this.ledger.sessionId = this.sessionId;
          this.ledger.updatedAt = new Date().toISOString();
          await this.save();
        }

        return this.ledger;
      } catch (e) {
        // Corrupted ledger - archive and create new
        const archivePath = `${this.ledgerPath}.${Date.now()}.bak`;
        fs.renameSync(this.ledgerPath, archivePath);
        console.error(`Archived corrupted ledger to ${archivePath}`);
      }
    }

    // Create new ledger
    this.ledger = this.createNewLedger();
    await this.save();
    return this.ledger;
  }

  private createNewLedger(): TaskLedger {
    const now = new Date().toISOString();
    return {
      version: 1,
      taskId: randomUUID(),
      sessionId: this.sessionId,
      createdAt: now,
      updatedAt: now,
      directives: [],
      acceptanceCriteria: [],
      openQuestions: [],
      fingerprints: [],
      stopAttempts: [],
      config: {
        maxConsecutiveFailures: this.config.limits.maxConsecutiveFailures,
        maxTotalAttempts: this.config.limits.maxTotalAttempts,
        judgeModel: this.config.judge.model,
      },
    };
  }

  /**
   * Add a new directive from user prompt
   */
  async addDirective(
    rawText: string,
    type: Directive['type'],
    normalizedIntent?: string,
  ): Promise<Directive> {
    if (!this.ledger) {
      throw new Error('Ledger not initialized');
    }

    const directive: Directive = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      rawText,
      normalizedIntent,
      type,
      status: 'active',
      sourcePromptIndex: this.ledger.directives.length,
    };

    // Check for supersession (if this contradicts earlier directives)
    // This is a simple heuristic; the judge does deeper analysis
    if (type === 'correction' || type === 'feedback') {
      // Mark previous related directives as potentially superseded
      // Actual supersession is determined by the judge
    }

    this.ledger.directives.push(directive);
    this.ledger.updatedAt = new Date().toISOString();
    await this.save();

    return directive;
  }

  /**
   * Record a stop attempt for history/loop detection
   */
  async recordStopAttempt(attempt: Omit<StopAttempt, 'attemptNumber'>): Promise<StopAttempt> {
    if (!this.ledger) {
      throw new Error('Ledger not initialized');
    }

    const fullAttempt: StopAttempt = {
      ...attempt,
      attemptNumber: this.ledger.stopAttempts.length + 1,
    };

    this.ledger.stopAttempts.push(fullAttempt);
    this.ledger.updatedAt = new Date().toISOString();
    await this.save();

    return fullAttempt;
  }

  /**
   * Record a workspace fingerprint
   */
  async recordFingerprint(hash: string, afterCommand?: string): Promise<void> {
    if (!this.ledger) {
      throw new Error('Ledger not initialized');
    }

    this.ledger.fingerprints.push({
      timestamp: new Date().toISOString(),
      hash,
      afterCommand,
    });

    this.ledger.updatedAt = new Date().toISOString();
    await this.save();
  }

  /**
   * Set git baseline
   */
  async setBaseline(baseline: TaskLedger['baseline']): Promise<void> {
    if (!this.ledger) {
      throw new Error('Ledger not initialized');
    }

    this.ledger.baseline = baseline;
    this.ledger.updatedAt = new Date().toISOString();
    await this.save();
  }

  /**
   * Get active directives (not superseded or abandoned)
   */
  getActiveDirectives(): Directive[] {
    if (!this.ledger) return [];
    return this.ledger.directives.filter(d => d.status === 'active');
  }

  /**
   * Get stop attempt history
   */
  getStopAttempts(): StopAttempt[] {
    return this.ledger?.stopAttempts ?? [];
  }

  /**
   * Check if we've hit loop limits
   */
  checkLimits(): { exceeded: boolean; reason?: string } {
    if (!this.ledger) {
      return { exceeded: false };
    }

    const attempts = this.ledger.stopAttempts;
    const config = this.ledger.config;

    // Check total attempts
    if (attempts.length >= config.maxTotalAttempts) {
      return {
        exceeded: true,
        reason: `Exceeded maximum total attempts (${config.maxTotalAttempts})`,
      };
    }

    // Check consecutive failures
    let consecutiveFailures = 0;
    for (let i = attempts.length - 1; i >= 0; i--) {
      if (attempts[i].verdict === 'blocked') {
        consecutiveFailures++;
      } else {
        break;
      }
    }

    if (consecutiveFailures >= config.maxConsecutiveFailures) {
      return {
        exceeded: true,
        reason: `Exceeded maximum consecutive failures (${config.maxConsecutiveFailures})`,
      };
    }

    return { exceeded: false };
  }

  /**
   * Analyze forward progress from stop attempts
   */
  analyzeProgress(): {
    isProgressing: boolean;
    trend: 'improving' | 'stagnant' | 'regressing';
    recentMissingItems: string[][];
  } {
    if (!this.ledger) {
      return { isProgressing: true, trend: 'improving', recentMissingItems: [] };
    }

    const recent = this.ledger.stopAttempts.slice(-5);
    const recentMissingItems = recent
      .map(a => a.judgeAnalysis?.missingItems ?? [])
      .filter(items => items.length > 0);

    if (recentMissingItems.length < 2) {
      return { isProgressing: true, trend: 'improving', recentMissingItems };
    }

    // Compare missing item counts
    const counts = recentMissingItems.map(items => items.length);
    const isDecreasing = counts.every((c, i) => i === 0 || c <= counts[i - 1]);
    const isIncreasing = counts.every((c, i) => i === 0 || c >= counts[i - 1]);
    const isStagnant = counts.every(c => c === counts[0]);

    if (isDecreasing && !isStagnant) {
      return { isProgressing: true, trend: 'improving', recentMissingItems };
    } else if (isStagnant) {
      return { isProgressing: false, trend: 'stagnant', recentMissingItems };
    } else if (isIncreasing) {
      return { isProgressing: false, trend: 'regressing', recentMissingItems };
    }

    // Mixed - assume some progress
    return { isProgressing: true, trend: 'improving', recentMissingItems };
  }

  /**
   * Get current ledger state
   */
  getLedger(): TaskLedger | null {
    return this.ledger;
  }

  /**
   * Reset ledger for new task
   */
  async reset(): Promise<TaskLedger> {
    this.ledger = this.createNewLedger();
    await this.save();
    return this.ledger;
  }

  private async save(): Promise<void> {
    if (!this.ledger) return;
    fs.writeFileSync(this.ledgerPath, JSON.stringify(this.ledger, null, 2));
  }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `npm install` completes successfully
- [ ] `npm run build` produces dist/ with no errors
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] Unit tests for LedgerManager pass: `npm test -- src/ledger`

#### Manual Verification:
- [ ] Creating a LedgerManager and calling `initialize()` creates `.claude/realitycheck/task_ledger.json`
- [ ] Adding directives persists them to the JSON file
- [ ] Ledger survives process restart (load existing data)

---

## Phase 2: Git Baseline and Fingerprinting

### Overview
Implement git-based change tracking for evidence gathering.

### Changes Required:

#### 1. Git Utilities

**File**: `src/git/index.ts`
```typescript
import { execSync, spawn } from 'child_process';
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

  /**
   * Check if directory is a git repo
   */
  isGitRepo(): boolean {
    try {
      execSync('git rev-parse --git-dir', {
        cwd: this.projectDir,
        stdio: 'pipe',
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get current git status
   */
  getStatus(): GitStatus {
    if (!this.isGitRepo()) {
      return { isRepo: false, dirtyFiles: [], untrackedFiles: [] };
    }

    try {
      const headCommit = execSync('git rev-parse HEAD', {
        cwd: this.projectDir,
        encoding: 'utf-8',
      }).trim();

      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: this.projectDir,
        encoding: 'utf-8',
      }).trim();

      const statusOutput = execSync('git status --porcelain', {
        cwd: this.projectDir,
        encoding: 'utf-8',
      });

      const dirtyFiles: string[] = [];
      const untrackedFiles: string[] = [];

      for (const line of statusOutput.split('\n').filter(Boolean)) {
        const status = line.substring(0, 2);
        const file = line.substring(3);

        if (status === '??') {
          untrackedFiles.push(file);
        } else {
          dirtyFiles.push(file);
        }
      }

      return {
        isRepo: true,
        headCommit,
        branch,
        dirtyFiles,
        untrackedFiles,
      };
    } catch (e) {
      return { isRepo: true, dirtyFiles: [], untrackedFiles: [] };
    }
  }

  /**
   * Compute workspace fingerprint (hash of current diff state)
   */
  computeFingerprint(): string {
    if (!this.isGitRepo()) {
      // Fallback: hash of file mtimes for tracked files
      return this.computeNonGitFingerprint();
    }

    try {
      // Get both staged and unstaged changes
      const diff = execSync('git diff HEAD', {
        cwd: this.projectDir,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });

      const status = execSync('git status --porcelain', {
        cwd: this.projectDir,
        encoding: 'utf-8',
      });

      const combined = `${diff}\n---STATUS---\n${status}`;
      return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 16);
    } catch {
      return this.computeNonGitFingerprint();
    }
  }

  private computeNonGitFingerprint(): string {
    // Simple fingerprint based on package.json mtime and src/ files
    const files = ['package.json', 'tsconfig.json'];
    const mtimes: string[] = [];

    for (const file of files) {
      const filePath = path.join(this.projectDir, file);
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        mtimes.push(`${file}:${stat.mtimeMs}`);
      }
    }

    return crypto.createHash('sha256').update(mtimes.join(',')).digest('hex').substring(0, 16);
  }

  /**
   * Get diff since a baseline commit
   */
  getDiffSince(baselineCommit: string): GitDiff | null {
    if (!this.isGitRepo()) return null;

    try {
      const diffStat = execSync(`git diff --stat ${baselineCommit}`, {
        cwd: this.projectDir,
        encoding: 'utf-8',
      });

      const diffNumstat = execSync(`git diff --numstat ${baselineCommit}`, {
        cwd: this.projectDir,
        encoding: 'utf-8',
      });

      const files = diffNumstat.split('\n').filter(Boolean).map(line => {
        const [additions, deletions, filePath] = line.split('\t');
        return {
          path: filePath,
          status: 'modified' as const,
          additions: parseInt(additions) || 0,
          deletions: parseInt(deletions) || 0,
        };
      });

      return {
        files,
        summary: diffStat,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get current diff (uncommitted changes)
   */
  getCurrentDiff(options?: { maxSize?: number }): GitDiff | null {
    if (!this.isGitRepo()) return null;

    const maxSize = options?.maxSize ?? 50000; // 50KB default

    try {
      const diffStat = execSync('git diff --stat HEAD', {
        cwd: this.projectDir,
        encoding: 'utf-8',
      });

      const diffNumstat = execSync('git diff --numstat HEAD', {
        cwd: this.projectDir,
        encoding: 'utf-8',
      });

      let patch: string | undefined;
      try {
        const fullPatch = execSync('git diff HEAD', {
          cwd: this.projectDir,
          encoding: 'utf-8',
          maxBuffer: maxSize,
        });
        if (fullPatch.length < maxSize) {
          patch = fullPatch;
        }
      } catch {
        // Patch too large, skip it
      }

      const files = diffNumstat.split('\n').filter(Boolean).map(line => {
        const [additions, deletions, filePath] = line.split('\t');
        return {
          path: filePath,
          status: 'modified' as const,
          additions: parseInt(additions) || 0,
          deletions: parseInt(deletions) || 0,
        };
      });

      return {
        files,
        summary: diffStat,
        patch,
      };
    } catch {
      return null;
    }
  }

  /**
   * Create baseline snapshot
   */
  async createBaseline(snapshotDir: string): Promise<{
    headCommit?: string;
    timestamp: string;
    dirtyFiles: string[];
  }> {
    const status = this.getStatus();
    const timestamp = new Date().toISOString();

    // Snapshot dirty files (copy them for later comparison)
    if (status.dirtyFiles.length > 0 || status.untrackedFiles.length > 0) {
      fs.mkdirSync(snapshotDir, { recursive: true });

      const allDirty = [...status.dirtyFiles, ...status.untrackedFiles];
      for (const file of allDirty) {
        const srcPath = path.join(this.projectDir, file);
        const destPath = path.join(snapshotDir, file);

        if (fs.existsSync(srcPath)) {
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }

    return {
      headCommit: status.headCommit,
      timestamp,
      dirtyFiles: [...status.dirtyFiles, ...status.untrackedFiles],
    };
  }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `npm run build` succeeds
- [ ] Unit tests for GitManager pass: `npm test -- src/git`
- [ ] Fingerprint changes when files are modified

#### Manual Verification:
- [ ] `computeFingerprint()` returns consistent hash for unchanged workspace
- [ ] `computeFingerprint()` returns different hash after file modification
- [ ] `createBaseline()` copies dirty files to snapshot directory

---

## Phase 3: Hook Implementations

### Overview
Implement the four hooks: UserPromptSubmit, PostToolUse (Bash), Stop, and SessionStart.

### Changes Required:

#### 1. Hook Entry Point (CLI)

**File**: `src/cli/index.ts`
```typescript
#!/usr/bin/env node

import { handleUserPromptSubmit } from '../hooks/userPromptSubmit.js';
import { handlePostToolUse } from '../hooks/postToolUse.js';
import { handleStop } from '../hooks/stop.js';
import { handleSessionStart } from '../hooks/sessionStart.js';

async function main() {
  // Read JSON input from stdin
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString('utf-8'));

  const hookEvent = input.hook_event_name;

  try {
    let result: unknown;

    switch (hookEvent) {
      case 'UserPromptSubmit':
        result = await handleUserPromptSubmit(input);
        break;
      case 'PostToolUse':
        result = await handlePostToolUse(input);
        break;
      case 'Stop':
        result = await handleStop(input);
        break;
      case 'SessionStart':
        result = await handleSessionStart(input);
        break;
      default:
        // Unknown hook type - pass through
        process.exit(0);
    }

    if (result) {
      console.log(JSON.stringify(result));
    }
    process.exit(0);
  } catch (error) {
    console.error(`RealityCheck hook error: ${error}`);
    // Exit 0 to not block on errors (fail open)
    process.exit(0);
  }
}

main();
```

#### 2. UserPromptSubmit Hook

**File**: `src/hooks/userPromptSubmit.ts`
```typescript
import { UserPromptSubmitInput, UserPromptSubmitInputSchema } from '../types/index.js';
import { loadConfig } from '../config/index.js';
import { LedgerManager } from '../ledger/index.js';
import { GitManager } from '../git/index.js';
import { expandSlashCommand } from '../utils/slashCommands.js';

export async function handleUserPromptSubmit(rawInput: unknown) {
  const input = UserPromptSubmitInputSchema.parse(rawInput);
  const config = loadConfig(input.cwd);

  const ledger = new LedgerManager(config, input.cwd, input.session_id);
  await ledger.initialize();

  const currentLedger = ledger.getLedger();
  const isFirstPrompt = currentLedger?.directives.length === 0;

  // Expand slash commands if present
  let expandedPrompt = input.prompt;
  let normalizedIntent: string | undefined;

  if (input.prompt.startsWith('/')) {
    const expanded = await expandSlashCommand(input.prompt, input.cwd);
    if (expanded) {
      expandedPrompt = expanded.expandedText;
      normalizedIntent = expanded.summary;
    }
  }

  // Determine directive type
  let type: 'initial' | 'feedback' | 'clarification' | 'correction' = 'feedback';
  if (isFirstPrompt) {
    type = 'initial';
  } else if (input.prompt.toLowerCase().includes('actually') ||
             input.prompt.toLowerCase().includes('instead') ||
             input.prompt.toLowerCase().includes('forget')) {
    type = 'correction';
  } else if (input.prompt.endsWith('?')) {
    type = 'clarification';
  }

  // Add directive to ledger
  await ledger.addDirective(expandedPrompt, type, normalizedIntent);

  // Create git baseline on first prompt
  if (isFirstPrompt && config.git.enabled) {
    const git = new GitManager(input.cwd);
    if (git.isGitRepo()) {
      const baselineDir = `${config.storage.basePath}/baseline/${currentLedger?.taskId}`;
      const baseline = await git.createBaseline(`${input.cwd}/${baselineDir}`);
      await ledger.setBaseline({
        ...baseline,
        baselineSnapshotPath: baselineDir,
      });
    }
  }

  // Inject context about RealityCheck being active (helps agent understand the system)
  // Only on first prompt to avoid noise
  if (isFirstPrompt) {
    return {
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: `[RealityCheck Quality Gate Active] Your work will be validated before completion. Ensure all requested changes are fully implemented.`,
      },
    };
  }

  // For subsequent prompts, don't inject anything
  return undefined;
}
```

#### 3. Slash Command Expansion Utility

**File**: `src/utils/slashCommands.ts`
```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ExpandedCommand {
  expandedText: string;
  summary: string;
  originalCommand: string;
  referencedFiles: string[]; // Files included via @file references
}

/**
 * Expand a slash command to its full prompt text
 */
export async function expandSlashCommand(
  prompt: string,
  projectDir: string,
): Promise<ExpandedCommand | null> {
  // Parse command and arguments
  const match = prompt.match(/^\/([^\s]+)(?:\s+(.*))?$/);
  if (!match) return null;

  const [, commandName, args] = match;

  // Look for command file in standard locations
  const commandPaths = [
    path.join(projectDir, '.claude', 'commands', `${commandName}.md`),
    path.join(os.homedir(), '.claude', 'commands', `${commandName}.md`),
  ];

  for (const commandPath of commandPaths) {
    if (fs.existsSync(commandPath)) {
      try {
        let content = fs.readFileSync(commandPath, 'utf-8');

        // Extract content after frontmatter (if present)
        const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
        if (frontmatterMatch) {
          content = frontmatterMatch[1];
        }

        // Replace argument placeholders
        if (args) {
          content = content.replace(/\$ARGUMENTS/g, args);

          // Handle positional args $1, $2, etc.
          const argParts = args.split(/\s+/);
          for (let i = 0; i < argParts.length; i++) {
            content = content.replace(new RegExp(`\\$${i + 1}`, 'g'), argParts[i]);
          }
        }

        // Expand @file references (both in command content and arguments)
        const { expandedContent, referencedFiles } = await expandFileReferences(
          content,
          projectDir
        );
        content = expandedContent;

        // Also check for @file references in the original args
        if (args) {
          const argsExpanded = await expandFileReferences(args, projectDir);
          referencedFiles.push(...argsExpanded.referencedFiles);
        }

        // Generate summary (first line or first sentence)
        const firstLine = content.split('\n')[0].trim();
        const summary = firstLine.length > 100
          ? firstLine.substring(0, 100) + '...'
          : firstLine;

        return {
          expandedText: content,
          summary: `Execute command /${commandName}: ${summary}`,
          originalCommand: prompt,
          referencedFiles,
        };
      } catch {
        // Failed to read/parse command file
        return null;
      }
    }
  }

  // Built-in command (not expandable)
  return null;
}

/**
 * Expand @file references in text content
 * Supports:
 * - @/absolute/path/to/file.ts
 * - @relative/path/to/file.ts
 * - @./relative/path/to/file.ts
 */
async function expandFileReferences(
  content: string,
  projectDir: string,
): Promise<{ expandedContent: string; referencedFiles: string[] }> {
  const referencedFiles: string[] = [];

  // Match @/path or @path patterns (but not @username style)
  // Must have a file extension or be a path with /
  const fileRefPattern = /@((?:\.{0,2}\/)?[^\s@]+\.[a-zA-Z0-9]+|(?:\.{0,2}\/)[^\s@]+)/g;

  let expandedContent = content;
  const matches = [...content.matchAll(fileRefPattern)];

  for (const match of matches) {
    const refPath = match[1];
    let fullPath: string;

    if (refPath.startsWith('/')) {
      // Absolute path
      fullPath = refPath;
    } else {
      // Relative path (resolve from project directory)
      fullPath = path.resolve(projectDir, refPath);
    }

    if (fs.existsSync(fullPath)) {
      try {
        const fileContent = fs.readFileSync(fullPath, 'utf-8');
        const fileName = path.basename(fullPath);

        // Replace the @reference with the file content wrapped in context
        const replacement = `\n<file path="${fullPath}" name="${fileName}">\n${fileContent}\n</file>\n`;
        expandedContent = expandedContent.replace(match[0], replacement);

        referencedFiles.push(fullPath);
      } catch {
        // File couldn't be read - leave reference as-is
      }
    }
  }

  return { expandedContent, referencedFiles };
}

/**
 * Extract @file references from a prompt without expanding them
 * Useful for quickly checking what files are referenced
 */
export function extractFileReferences(prompt: string, projectDir: string): string[] {
  const fileRefPattern = /@((?:\.{0,2}\/)?[^\s@]+\.[a-zA-Z0-9]+|(?:\.{0,2}\/)[^\s@]+)/g;
  const refs: string[] = [];

  for (const match of prompt.matchAll(fileRefPattern)) {
    const refPath = match[1];
    let fullPath: string;

    if (refPath.startsWith('/')) {
      fullPath = refPath;
    } else {
      fullPath = path.resolve(projectDir, refPath);
    }

    if (fs.existsSync(fullPath)) {
      refs.push(fullPath);
    }
  }

  return refs;
}
```

#### 4. PostToolUse Hook (Bash fingerprinting)

**File**: `src/hooks/postToolUse.ts`
```typescript
import { PostToolUseInput, PostToolUseInputSchema } from '../types/index.js';
import { loadConfig } from '../config/index.js';
import { LedgerManager } from '../ledger/index.js';
import { GitManager } from '../git/index.js';

export async function handlePostToolUse(rawInput: unknown) {
  const input = PostToolUseInputSchema.parse(rawInput);

  // Only process Bash tool calls
  if (input.tool_name !== 'Bash') {
    return undefined;
  }

  const config = loadConfig(input.cwd);
  const ledger = new LedgerManager(config, input.cwd, input.session_id);
  await ledger.initialize();

  // Extract command from tool input
  const command = (input.tool_input as { command?: string })?.command ?? 'unknown';

  // Compute and record fingerprint
  const git = new GitManager(input.cwd);
  const fingerprint = git.computeFingerprint();

  await ledger.recordFingerprint(fingerprint, command);

  // No output needed - just recording evidence
  return undefined;
}
```

#### 5. SessionStart Hook

**File**: `src/hooks/sessionStart.ts`
```typescript
import { SessionStartInput, SessionStartInputSchema } from '../types/index.js';
import { loadConfig } from '../config/index.js';
import { LedgerManager } from '../ledger/index.js';

export async function handleSessionStart(rawInput: unknown) {
  const input = SessionStartInputSchema.parse(rawInput);
  const config = loadConfig(input.cwd);

  const ledger = new LedgerManager(config, input.cwd, input.session_id);

  // Different behavior based on source
  switch (input.source) {
    case 'startup':
    case 'resume':
      // Load existing ledger or create new
      await ledger.initialize();
      break;

    case 'clear':
      // /clear was called - preserve the ledger but note the context reset
      await ledger.initialize();
      // Could optionally inject a reminder about active directives
      const activeDirs = ledger.getActiveDirectives();
      if (activeDirs.length > 0) {
        return {
          hookSpecificOutput: {
            hookEventName: 'SessionStart',
            additionalContext: `[RealityCheck] Context was cleared. Active task directives preserved:\n${activeDirs.map(d => `- ${d.normalizedIntent || d.rawText}`).join('\n')}`,
          },
        };
      }
      break;

    case 'compact':
      // Context was compacted - ledger remains unchanged
      await ledger.initialize();
      break;
  }

  return undefined;
}
```

#### 6. Stop Hook (Main Quality Gate)

**File**: `src/hooks/stop.ts`
```typescript
import { StopHookInput, StopHookInputSchema, HookDecision, StopAttempt } from '../types/index.js';
import { loadConfig } from '../config/index.js';
import { LedgerManager } from '../ledger/index.js';
import { GitManager } from '../git/index.js';
import { runJudge, JudgeVerdict } from '../judge/index.js';
import { readTranscript, TranscriptMessage } from '../utils/transcript.js';

export async function handleStop(rawInput: unknown): Promise<HookDecision | undefined> {
  const input = StopHookInputSchema.parse(rawInput);
  const config = loadConfig(input.cwd);

  const ledger = new LedgerManager(config, input.cwd, input.session_id);
  await ledger.initialize();

  // Check if we've exceeded limits
  const limitCheck = ledger.checkLimits();
  if (limitCheck.exceeded) {
    // Force stop - we've tried too many times
    console.error(`[RealityCheck] ${limitCheck.reason}. Allowing stop.`);
    return {
      decision: 'approve',
      reason: `Task validation limit reached. ${limitCheck.reason}`,
    };
  }

  // Check for loop/stagnation
  const progress = ledger.analyzeProgress();
  if (!progress.isProgressing && progress.trend === 'stagnant') {
    const recentAttempts = ledger.getStopAttempts().slice(-5);
    const stagnantCount = recentAttempts.filter(a =>
      a.judgeAnalysis?.forwardProgress === false
    ).length;

    if (stagnantCount >= config.limits.noProgressThreshold) {
      // Agent is stuck - force stop with explanation
      return {
        decision: 'approve',
        reason: `Agent appears stuck with no forward progress after ${stagnantCount} attempts. Stopping to allow user intervention.`,
      };
    }
  }

  // Guard against infinite Stop hook recursion
  if (input.stop_hook_active) {
    // We're already in a Stop hook continuation - be more lenient
    // Check if this is making progress compared to last attempt
    const attempts = ledger.getStopAttempts();
    const lastAttempt = attempts[attempts.length - 1];

    if (lastAttempt?.judgeAnalysis?.forwardProgress === false) {
      // No progress since last block - might be stuck
      // Allow one more try then force stop
    }
  }

  // Gather evidence
  const git = new GitManager(input.cwd);
  const currentFingerprint = git.computeFingerprint();
  const currentDiff = git.getCurrentDiff({ maxSize: 30000 });

  // Read recent transcript
  const transcript = await readTranscript(input.transcript_path, { lastN: 20 });
  const lastAssistantMessage = transcript
    .filter(m => m.role === 'assistant')
    .pop();

  // Get active directives
  const activeDirectives = ledger.getActiveDirectives();

  // If no directives, nothing to validate
  if (activeDirectives.length === 0) {
    return undefined; // Allow stop
  }

  // Run the judge
  const verdict = await runJudge({
    config,
    directives: activeDirectives,
    diff: currentDiff,
    fingerprint: currentFingerprint,
    lastMessage: lastAssistantMessage?.content,
    stopAttempts: ledger.getStopAttempts(),
    projectDir: input.cwd,
  });

  // Record this attempt
  const attempt: Omit<StopAttempt, 'attemptNumber'> = {
    timestamp: new Date().toISOString(),
    verdict: verdict.pass ? 'allowed' : 'blocked',
    reason: verdict.pass ? 'All criteria satisfied' : verdict.reason,
    workspaceFingerprint: currentFingerprint,
    judgeAnalysis: {
      missingItems: verdict.missingItems,
      questionsForUser: verdict.questionsForUser,
      forwardProgress: verdict.forwardProgress,
      convergenceEstimate: verdict.convergenceEstimate,
    },
  };
  await ledger.recordStopAttempt(attempt);

  // Decision
  if (verdict.pass) {
    return {
      decision: 'approve',
      reason: 'Task completed successfully. All directives satisfied.',
    };
  }

  // Build block reason with specific next steps
  let reason = verdict.reason;

  if (verdict.questionsForUser.length > 0) {
    reason += `\n\nYou must ask the user these questions before proceeding:\n${verdict.questionsForUser.map(q => `- ${q}`).join('\n')}`;
  }

  if (verdict.missingItems.length > 0) {
    reason += `\n\nMissing items to complete:\n${verdict.missingItems.map(item => `- ${item}`).join('\n')}`;
  }

  if (verdict.suggestedNextSteps.length > 0) {
    reason += `\n\nSuggested next steps:\n${verdict.suggestedNextSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}`;
  }

  return {
    decision: 'block',
    reason,
  };
}
```

#### 7. Transcript Reader Utility

**File**: `src/utils/transcript.ts`
```typescript
import * as fs from 'fs';
import * as readline from 'readline';

export interface TranscriptMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  toolUse?: {
    name: string;
    input: unknown;
  };
}

export async function readTranscript(
  transcriptPath: string,
  options?: { lastN?: number },
): Promise<TranscriptMessage[]> {
  const messages: TranscriptMessage[] = [];

  if (!fs.existsSync(transcriptPath)) {
    return messages;
  }

  const fileStream = fs.createReadStream(transcriptPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const entry = JSON.parse(line);

      // Extract message based on transcript format
      if (entry.message?.role) {
        const msg: TranscriptMessage = {
          role: entry.message.role,
          content: extractContent(entry.message.content),
          timestamp: entry.timestamp,
        };

        // Check for tool use
        if (entry.message.content) {
          const toolUseBlock = entry.message.content.find(
            (b: unknown) => typeof b === 'object' && b && 'type' in b && b.type === 'tool_use'
          );
          if (toolUseBlock) {
            msg.toolUse = {
              name: toolUseBlock.name,
              input: toolUseBlock.input,
            };
          }
        }

        messages.push(msg);
      }
    } catch {
      // Skip malformed lines
    }
  }

  // Return last N if specified
  if (options?.lastN && messages.length > options.lastN) {
    return messages.slice(-options.lastN);
  }

  return messages;
}

function extractContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((block): block is { type: string; text?: string } =>
        typeof block === 'object' && block !== null && 'type' in block
      )
      .filter(block => block.type === 'text' && block.text)
      .map(block => block.text)
      .join('\n');
  }

  return '';
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `npm run build` succeeds
- [ ] `npm run typecheck` passes
- [ ] Unit tests for each hook pass
- [ ] CLI entry point responds to all hook event types

#### Manual Verification:
- [ ] UserPromptSubmit creates/updates ledger on prompt submission
- [ ] PostToolUse records fingerprints after Bash commands
- [ ] SessionStart restores context after /clear
- [ ] Stop hook blocks when given incomplete work

---

## Phase 4: Judge System

### Overview
Implement the external judge that evaluates task completion using a separate Claude process.

### Changes Required:

#### 1. Judge Implementation

**File**: `src/judge/index.ts`
```typescript
import { spawn } from 'child_process';
import { RealityCheckConfig } from '../config/index.js';
import { Directive, StopAttempt } from '../types/index.js';
import { GitDiff } from '../git/index.js';
import { z } from 'zod';

export const JudgeVerdictSchema = z.object({
  pass: z.boolean(),
  reason: z.string(),
  missingItems: z.array(z.string()),
  questionsForUser: z.array(z.string()),
  forwardProgress: z.boolean(),
  convergenceEstimate: z.number().optional(),
  suggestedNextSteps: z.array(z.string()),
});

export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;

interface JudgeInput {
  config: RealityCheckConfig;
  directives: Directive[];
  diff: GitDiff | null;
  fingerprint: string;
  lastMessage?: string;
  stopAttempts: StopAttempt[];
  projectDir: string;
}

const JUDGE_SYSTEM_PROMPT = `You are RealityCheck, a strict task completion judge for coding agents.

Your role is to determine whether an agent has FULLY completed the user's requested task.

You will receive:
1. Active directives (what the user asked for, including any mid-task feedback)
2. A diff summary showing what files changed
3. The agent's last message
4. History of previous stop attempts (to assess forward progress)

## CRITICAL: Common Partial Completion Patterns to Detect

Research shows AI agents complete only 30-35% of multi-step tasks successfully. Watch for these failure patterns:

### 1. PREMATURE TERMINATION
- **Todo List Abandonment**: Agent creates todo list but completes only 50-60% of items
- **Victory Declaring Without Evidence**: Agent says "done" without any file changes or test runs
- **Post-Compaction Amnesia**: After context compaction, agent forgot earlier requirements
- **Skipped Validation Steps**: Tests/lint/typecheck mentioned in plan but never executed

### 2. SILENT FALLBACKS & PLACEHOLDERS
- Hard-coded placeholder data instead of real implementation ("test@example.com", "TODO", "FIXME")
- Simplified algorithms when complex logic was requested
- Error swallowing (empty catch blocks, console.log-only error handling)
- Mock data substituted for actual API integration

### 3. INCOMPLETE IMPLEMENTATION
- **Missing Edge Cases**: No null/undefined checks, empty array handling, bounds checking
- **Missing Error Handling**: No try-catch for I/O, no timeout/retry logic for network calls
- **Missing Input Validation**: User inputs passed directly without sanitization
- **Partial Multi-file Updates**: Function signature changed in one file but callers not updated

### 4. CODE QUALITY FAILURES
- Syntax errors preventing compilation
- Missing dependencies (imports reference packages not in package.json)
- Type errors in TypeScript code
- Runtime errors on first execution (undefined references, missing config)

### 5. REQUIREMENT DRIFT
- Mid-task user feedback was given but not incorporated
- Explicit requirements from original prompt were skipped
- Specified workflow was violated (e.g., told to write tests first but wrote impl first)
- CLAUDE.md/AGENTS.md instructions ignored

### 6. HALLUCINATION PATTERNS
- References to non-existent APIs, packages, or functions (1 in 5 AI code samples contain fake libraries)
- Outdated API usage from training data
- Fabricated function signatures that don't match actual library types

## VERIFICATION CHECKLIST

For EVERY evaluation, check:

### Automated Checks (if applicable based on project type):
- [ ] Code compiles/parses without syntax errors
- [ ] All imports resolve to real packages
- [ ] Type checking passes (TypeScript/typed languages)
- [ ] No linting errors introduced
- [ ] Tests were actually run (not just claimed)
- [ ] Build succeeds

### Implementation Completeness:
- [ ] ALL items from user's original request are addressed
- [ ] ALL mid-task feedback was incorporated (unless explicitly superseded)
- [ ] No TODO/FIXME comments for core functionality
- [ ] No placeholder data in production code paths
- [ ] Error handling exists for I/O operations
- [ ] Edge cases are handled (null, empty, boundary values)

### Evidence of Work:
- [ ] Files were actually modified (check diff)
- [ ] Changes are substantive (not just comments or formatting)
- [ ] If tests were required, test files exist and cover the feature
- [ ] If documentation was required, it was updated

## JUDGMENT RULES

1. **Be STRICT**: Partial completion is NOT completion. 50% done = NOT DONE.
2. **Require Evidence**: Claims of completion without file changes = FAIL
3. **Check All Directives**: Every active directive must be satisfied
4. **Mid-task Feedback is Binding**: Unless later superseded, it's a requirement
5. **Implicit Requirements Matter**: "Add a feature" implies it should work, have tests, handle errors
6. **When In Doubt, Block**: If unsure whether something was done, mark it missing

## FORWARD PROGRESS ASSESSMENT

Compare current attempt to previous attempts:
- Is the missing items list getting shorter? (Progress)
- Is the fingerprint different? (Files changed = work happened)
- Are the same items failing repeatedly? (Stuck)
- Is the agent asking for clarification it already received? (Regression)

If the agent is making NO progress for 3+ consecutive attempts, they may be stuck.
If the missing items are INCREASING, they may be regressing.

Respond with a JSON object matching this schema:
{
  "pass": boolean,           // true ONLY if EVERYTHING is verifiably complete
  "reason": string,          // Detailed explanation of your verdict
  "missingItems": string[],  // Specific items not yet done (be precise)
  "questionsForUser": string[], // Questions that must be answered before completion
  "forwardProgress": boolean,   // Is the agent making progress vs last attempt?
  "convergenceEstimate": number, // Estimated attempts to completion (1-10, optional)
  "suggestedNextSteps": string[] // Concrete, actionable next steps for the agent
}`;

export async function runJudge(input: JudgeInput): Promise<JudgeVerdict> {
  const { config, directives, diff, fingerprint, lastMessage, stopAttempts, projectDir } = input;

  // Build the judge prompt
  const prompt = buildJudgePrompt(directives, diff, lastMessage, stopAttempts, fingerprint);

  // Model selection
  const model = config.judge.model === 'opus'
    ? 'claude-opus-4-5-20250514'
    : 'claude-sonnet-4-20250514';

  // JSON schema for structured output
  const jsonSchema = JSON.stringify({
    type: 'object',
    properties: {
      pass: { type: 'boolean' },
      reason: { type: 'string' },
      missingItems: { type: 'array', items: { type: 'string' } },
      questionsForUser: { type: 'array', items: { type: 'string' } },
      forwardProgress: { type: 'boolean' },
      convergenceEstimate: { type: 'number' },
      suggestedNextSteps: { type: 'array', items: { type: 'string' } },
    },
    required: ['pass', 'reason', 'missingItems', 'questionsForUser', 'forwardProgress', 'suggestedNextSteps'],
  });

  try {
    const result = await runClaudeSubprocess({
      prompt,
      systemPrompt: JUDGE_SYSTEM_PROMPT,
      model,
      jsonSchema,
      timeout: config.judge.timeout,
      projectDir,
    });

    return JudgeVerdictSchema.parse(result);
  } catch (error) {
    // On judge failure, fail open (allow stop) but warn
    console.error(`[RealityCheck] Judge error: ${error}`);
    return {
      pass: true,
      reason: 'Judge evaluation failed - allowing stop',
      missingItems: [],
      questionsForUser: [],
      forwardProgress: true,
      suggestedNextSteps: [],
    };
  }
}

function buildJudgePrompt(
  directives: Directive[],
  diff: GitDiff | null,
  lastMessage: string | undefined,
  stopAttempts: StopAttempt[],
  fingerprint: string,
): string {
  const parts: string[] = [];

  // Active directives
  parts.push('## Active Directives (User Requests)\n');
  for (const d of directives) {
    const intent = d.normalizedIntent || d.rawText;
    parts.push(`- [${d.type}] ${intent}`);
  }

  // Diff summary
  if (diff) {
    parts.push('\n## Changes Made (Git Diff Summary)\n');
    parts.push('```');
    parts.push(diff.summary);
    parts.push('```');

    if (diff.patch && diff.patch.length < 10000) {
      parts.push('\n### Detailed Changes:\n');
      parts.push('```diff');
      parts.push(diff.patch);
      parts.push('```');
    }
  } else {
    parts.push('\n## Changes Made\n');
    parts.push('No git diff available (not a git repository or no changes).');
  }

  // Agent's last message
  if (lastMessage) {
    parts.push('\n## Agent\'s Final Message\n');
    parts.push('```');
    parts.push(lastMessage.substring(0, 2000)); // Limit size
    parts.push('```');
  }

  // Previous attempts (for progress analysis)
  if (stopAttempts.length > 0) {
    parts.push('\n## Previous Stop Attempts\n');
    const recent = stopAttempts.slice(-5);
    for (const attempt of recent) {
      parts.push(`- Attempt #${attempt.attemptNumber}: ${attempt.verdict}`);
      if (attempt.judgeAnalysis?.missingItems.length) {
        parts.push(`  Missing: ${attempt.judgeAnalysis.missingItems.join(', ')}`);
      }
      parts.push(`  Fingerprint: ${attempt.workspaceFingerprint}`);
    }
    parts.push(`\nCurrent fingerprint: ${fingerprint}`);
    parts.push(`(Different fingerprint = files changed since last attempt)`);
  }

  parts.push('\n## Your Task\n');
  parts.push('Evaluate whether ALL active directives have been satisfied.');
  parts.push('Consider: code changes, test coverage, documentation, and any other requirements.');
  parts.push('Be thorough but fair.');

  return parts.join('\n');
}

interface ClaudeSubprocessOptions {
  prompt: string;
  systemPrompt: string;
  model: string;
  jsonSchema: string;
  timeout: number;
  projectDir: string;
}

async function runClaudeSubprocess(options: ClaudeSubprocessOptions): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const args = [
      '-p', // Print mode (non-interactive)
      '--tools', '', // No tools
      '--max-turns', '1',
      '--output-format', 'json',
      '--json-schema', options.jsonSchema,
      '--model', options.model,
      '--system-prompt', options.systemPrompt,
      '--setting-sources', 'default', // Minimal settings to avoid loading project hooks
      options.prompt,
    ];

    const child = spawn('claude', args, {
      cwd: options.projectDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: options.timeout,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Claude subprocess exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        // Parse the JSON output
        // Claude -p with --output-format json wraps result
        const parsed = JSON.parse(stdout);

        // Extract the actual response content
        // The structure depends on Claude Code version
        if (parsed.result) {
          resolve(JSON.parse(parsed.result));
        } else if (parsed.content) {
          // Try to extract from content blocks
          const textBlock = parsed.content.find((b: { type: string }) => b.type === 'text');
          if (textBlock?.text) {
            resolve(JSON.parse(textBlock.text));
          }
        } else {
          // Try parsing stdout directly as the result
          resolve(parsed);
        }
      } catch (e) {
        reject(new Error(`Failed to parse judge response: ${e}\nStdout: ${stdout}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `npm run build` succeeds
- [ ] Unit tests for judge prompt building pass
- [ ] Mock tests for judge verdict parsing pass

#### Manual Verification:
- [ ] Judge subprocess runs without errors
- [ ] Judge returns valid JSON matching schema
- [ ] Judge correctly identifies incomplete tasks
- [ ] Judge correctly identifies complete tasks

---

## Phase 5: Configuration and Installation

### Overview
Set up the hook configuration for Claude Code and create installation/setup scripts.

### Changes Required:

#### 1. Example Hook Configuration

**File**: `examples/claude-hooks-config.json`
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "realitycheck",
            "timeout": 10
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "realitycheck",
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "realitycheck",
            "timeout": 60
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "realitycheck",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

#### 2. Setup Script

**File**: `scripts/setup.sh`
```bash
#!/bin/bash
set -e

echo "=== RealityCheck Setup ==="

# Build the project
echo "Building..."
npm run build

# Link globally (makes 'realitycheck' command available)
echo "Linking globally..."
npm link

# Verify installation
echo "Verifying..."
which realitycheck

echo ""
echo "=== Setup Complete ==="
echo ""
echo "To configure RealityCheck in your project, add the hooks configuration from"
echo "examples/claude-hooks-config.json to your .claude/settings.local.json"
echo ""
echo "Example:"
echo '  cp examples/claude-hooks-config.json .claude/settings.local.json'
echo ""
```

#### 3. Default RealityCheck Configuration

**File**: `examples/realitycheck.config.json`
```json
{
  "judge": {
    "model": "opus",
    "timeout": 30000,
    "maxTokens": 4096
  },
  "limits": {
    "maxConsecutiveFailures": 20,
    "maxTotalAttempts": 50,
    "noProgressThreshold": 5
  },
  "storage": {
    "basePath": ".claude/realitycheck"
  },
  "git": {
    "enabled": true,
    "snapshotDirtyFiles": true
  },
  "performance": {
    "skipJudgeIfDeterministicPass": true,
    "cacheJudgeResults": true,
    "parallelFingerprinting": true
  },
  "debug": {
    "verbose": false
  }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `npm run build` succeeds
- [ ] `npm link` succeeds
- [ ] `realitycheck` command is available in PATH

#### Manual Verification:
- [ ] Hook configuration can be copied to a project
- [ ] RealityCheck activates when Claude Code session starts

---

## Phase 6: Testing Infrastructure

### Overview
Create comprehensive tests using Vitest for unit tests and Agent SDK for integration tests.

### Changes Required:

#### 1. Vitest Configuration

**File**: `vitest.config.ts`
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.integration.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
```

**File**: `vitest.integration.config.ts`
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    testTimeout: 120000, // 2 minutes for agent tests
    hookTimeout: 30000,
  },
});
```

#### 2. Unit Tests for Ledger

**File**: `src/ledger/index.test.ts`
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LedgerManager } from './index.js';
import { RealityCheckConfigSchema } from '../config/index.js';

describe('LedgerManager', () => {
  let tempDir: string;
  let ledger: LedgerManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'realitycheck-test-'));
    const config = RealityCheckConfigSchema.parse({});
    ledger = new LedgerManager(config, tempDir, 'test-session-123');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('initialize', () => {
    it('creates a new ledger when none exists', async () => {
      const result = await ledger.initialize();

      expect(result.version).toBe(1);
      expect(result.sessionId).toBe('test-session-123');
      expect(result.directives).toEqual([]);
    });

    it('loads existing ledger', async () => {
      await ledger.initialize();
      await ledger.addDirective('Test directive', 'initial');

      // Create new manager pointing to same path
      const config = RealityCheckConfigSchema.parse({});
      const ledger2 = new LedgerManager(config, tempDir, 'test-session-123');
      const result = await ledger2.initialize();

      expect(result.directives).toHaveLength(1);
      expect(result.directives[0].rawText).toBe('Test directive');
    });
  });

  describe('addDirective', () => {
    it('adds a directive with correct type', async () => {
      await ledger.initialize();

      const directive = await ledger.addDirective('Build a feature', 'initial');

      expect(directive.type).toBe('initial');
      expect(directive.rawText).toBe('Build a feature');
      expect(directive.status).toBe('active');
    });

    it('increments sourcePromptIndex', async () => {
      await ledger.initialize();

      await ledger.addDirective('First', 'initial');
      const second = await ledger.addDirective('Second', 'feedback');

      expect(second.sourcePromptIndex).toBe(1);
    });
  });

  describe('checkLimits', () => {
    it('returns exceeded when max attempts reached', async () => {
      await ledger.initialize();

      // Add many stop attempts
      for (let i = 0; i < 50; i++) {
        await ledger.recordStopAttempt({
          timestamp: new Date().toISOString(),
          verdict: 'blocked',
          reason: 'test',
        });
      }

      const result = ledger.checkLimits();
      expect(result.exceeded).toBe(true);
    });

    it('returns exceeded when consecutive failures reached', async () => {
      await ledger.initialize();

      for (let i = 0; i < 20; i++) {
        await ledger.recordStopAttempt({
          timestamp: new Date().toISOString(),
          verdict: 'blocked',
          reason: 'test',
        });
      }

      const result = ledger.checkLimits();
      expect(result.exceeded).toBe(true);
    });

    it('resets consecutive count on success', async () => {
      await ledger.initialize();

      for (let i = 0; i < 10; i++) {
        await ledger.recordStopAttempt({
          timestamp: new Date().toISOString(),
          verdict: 'blocked',
          reason: 'test',
        });
      }

      await ledger.recordStopAttempt({
        timestamp: new Date().toISOString(),
        verdict: 'allowed',
        reason: 'success',
      });

      for (let i = 0; i < 5; i++) {
        await ledger.recordStopAttempt({
          timestamp: new Date().toISOString(),
          verdict: 'blocked',
          reason: 'test',
        });
      }

      const result = ledger.checkLimits();
      expect(result.exceeded).toBe(false);
    });
  });

  describe('analyzeProgress', () => {
    it('detects improving trend', async () => {
      await ledger.initialize();

      await ledger.recordStopAttempt({
        timestamp: new Date().toISOString(),
        verdict: 'blocked',
        reason: 'test',
        judgeAnalysis: {
          missingItems: ['a', 'b', 'c'],
          questionsForUser: [],
          forwardProgress: true,
        },
      });

      await ledger.recordStopAttempt({
        timestamp: new Date().toISOString(),
        verdict: 'blocked',
        reason: 'test',
        judgeAnalysis: {
          missingItems: ['a', 'b'],
          questionsForUser: [],
          forwardProgress: true,
        },
      });

      await ledger.recordStopAttempt({
        timestamp: new Date().toISOString(),
        verdict: 'blocked',
        reason: 'test',
        judgeAnalysis: {
          missingItems: ['a'],
          questionsForUser: [],
          forwardProgress: true,
        },
      });

      const result = ledger.analyzeProgress();
      expect(result.isProgressing).toBe(true);
      expect(result.trend).toBe('improving');
    });

    it('detects stagnant trend', async () => {
      await ledger.initialize();

      for (let i = 0; i < 5; i++) {
        await ledger.recordStopAttempt({
          timestamp: new Date().toISOString(),
          verdict: 'blocked',
          reason: 'test',
          judgeAnalysis: {
            missingItems: ['same', 'items'],
            questionsForUser: [],
            forwardProgress: false,
          },
        });
      }

      const result = ledger.analyzeProgress();
      expect(result.isProgressing).toBe(false);
      expect(result.trend).toBe('stagnant');
    });
  });
});
```

#### 3. Integration Tests with Agent SDK

**File**: `src/tests/integration/realitycheck.integration.test.ts`
```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

// Note: These tests require:
// 1. Claude Code CLI installed and authenticated
// 2. RealityCheck built and linked globally
// 3. Agent SDK (if using programmatic approach)

describe('RealityCheck Integration Tests', () => {
  let testProjectDir: string;

  beforeAll(() => {
    // Create test project directory
    testProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'realitycheck-integration-'));

    // Initialize git
    execSync('git init', { cwd: testProjectDir });
    execSync('git config user.email "test@test.com"', { cwd: testProjectDir });
    execSync('git config user.name "Test"', { cwd: testProjectDir });

    // Create initial file and commit
    fs.writeFileSync(path.join(testProjectDir, 'README.md'), '# Test Project\n');
    execSync('git add . && git commit -m "Initial"', { cwd: testProjectDir });

    // Create .claude directory with realitycheck config
    const claudeDir = path.join(testProjectDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });

    // Write hook configuration
    const hooksConfig = {
      hooks: {
        UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'realitycheck', timeout: 10 }] }],
        PostToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'realitycheck', timeout: 5 }] }],
        Stop: [{ hooks: [{ type: 'command', command: 'realitycheck', timeout: 60 }] }],
        SessionStart: [{ hooks: [{ type: 'command', command: 'realitycheck', timeout: 5 }] }],
      },
    };
    fs.writeFileSync(
      path.join(claudeDir, 'settings.local.json'),
      JSON.stringify(hooksConfig, null, 2)
    );

    // Write realitycheck config
    const realitycheckConfig = {
      judge: { model: 'sonnet', timeout: 30000 }, // Use sonnet for faster tests
      limits: { maxConsecutiveFailures: 3, maxTotalAttempts: 5 },
    };
    fs.writeFileSync(
      path.join(claudeDir, 'realitycheck.config.json'),
      JSON.stringify(realitycheckConfig, null, 2)
    );
  });

  afterAll(() => {
    // Cleanup
    fs.rmSync(testProjectDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Clear RealityCheck state between tests
    const realitycheckDir = path.join(testProjectDir, '.claude', 'realitycheck');
    if (fs.existsSync(realitycheckDir)) {
      fs.rmSync(realitycheckDir, { recursive: true, force: true });
    }
  });

  describe('Task Completion Scenarios', () => {
    it.skip('blocks stop when task is incomplete', async () => {
      // This test would use Agent SDK to:
      // 1. Start session with RealityCheck hooks
      // 2. Send prompt: "Create a file called hello.txt with the text 'Hello World'"
      // 3. Observe agent response
      // 4. If agent tries to stop without creating file, verify Stop hook blocks

      // Placeholder - requires Agent SDK setup
      expect(true).toBe(true);
    });

    it.skip('allows stop when task is complete', async () => {
      // This test would:
      // 1. Start session
      // 2. Send simple prompt
      // 3. Let agent complete the task
      // 4. Verify Stop hook allows completion

      expect(true).toBe(true);
    });

    it.skip('preserves mid-task feedback', async () => {
      // This test would:
      // 1. Start session
      // 2. Send initial prompt
      // 3. Send follow-up feedback before completion
      // 4. Verify both are in ledger
      // 5. Verify Stop hook considers both

      expect(true).toBe(true);
    });

    it.skip('detects stuck agent and allows stop', async () => {
      // This test would:
      // 1. Configure low limits
      // 2. Create scenario where agent keeps failing
      // 3. Verify RealityCheck eventually allows stop after limit

      expect(true).toBe(true);
    });
  });
});
```

#### 4. Test Fixtures

**File**: `src/tests/fixtures/sample-transcript.jsonl`
```json
{"timestamp":"2025-01-01T00:00:00Z","message":{"role":"user","content":[{"type":"text","text":"Create a hello world function in TypeScript"}]}}
{"timestamp":"2025-01-01T00:00:10Z","message":{"role":"assistant","content":[{"type":"text","text":"I'll create a hello world function for you."},{"type":"tool_use","id":"toolu_01","name":"Write","input":{"path":"hello.ts","content":"export function helloWorld(): string {\n  return 'Hello, World!';\n}"}}]}}
{"timestamp":"2025-01-01T00:00:15Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_01","content":"File written successfully"}]}}
{"timestamp":"2025-01-01T00:00:20Z","message":{"role":"assistant","content":[{"type":"text","text":"I've created the hello world function in hello.ts. The function returns the string 'Hello, World!'."}]}}
```

**File**: `src/tests/fixtures/incomplete-transcript.jsonl`
```json
{"timestamp":"2025-01-01T00:00:00Z","message":{"role":"user","content":[{"type":"text","text":"Create a hello world function in TypeScript and add unit tests for it"}]}}
{"timestamp":"2025-01-01T00:00:10Z","message":{"role":"assistant","content":[{"type":"text","text":"I'll create a hello world function for you."},{"type":"tool_use","id":"toolu_01","name":"Write","input":{"path":"hello.ts","content":"export function helloWorld(): string {\n  return 'Hello, World!';\n}"}}]}}
{"timestamp":"2025-01-01T00:00:15Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_01","content":"File written successfully"}]}}
{"timestamp":"2025-01-01T00:00:20Z","message":{"role":"assistant","content":[{"type":"text","text":"I've created the hello world function. Let me know if you need anything else!"}]}}
```

#### 5. Test Utilities

**File**: `src/tests/utils/mockHookInput.ts`
```typescript
import {
  UserPromptSubmitInput,
  StopHookInput,
  PostToolUseInput,
  SessionStartInput,
} from '../../types/index.js';

export function createMockUserPromptSubmitInput(
  overrides: Partial<UserPromptSubmitInput> = {}
): UserPromptSubmitInput {
  return {
    session_id: 'test-session-123',
    transcript_path: '/tmp/transcript.jsonl',
    cwd: '/tmp/test-project',
    hook_event_name: 'UserPromptSubmit',
    prompt: 'Test prompt',
    ...overrides,
  };
}

export function createMockStopHookInput(
  overrides: Partial<StopHookInput> = {}
): StopHookInput {
  return {
    session_id: 'test-session-123',
    transcript_path: '/tmp/transcript.jsonl',
    cwd: '/tmp/test-project',
    hook_event_name: 'Stop',
    stop_hook_active: false,
    ...overrides,
  };
}

export function createMockPostToolUseInput(
  overrides: Partial<PostToolUseInput> = {}
): PostToolUseInput {
  return {
    session_id: 'test-session-123',
    transcript_path: '/tmp/transcript.jsonl',
    cwd: '/tmp/test-project',
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    tool_response: { stdout: 'Tests passed', exitCode: 0 },
    tool_use_id: 'toolu_test_123',
    ...overrides,
  };
}

export function createMockSessionStartInput(
  overrides: Partial<SessionStartInput> = {}
): SessionStartInput {
  return {
    session_id: 'test-session-123',
    transcript_path: '/tmp/transcript.jsonl',
    cwd: '/tmp/test-project',
    hook_event_name: 'SessionStart',
    source: 'startup',
    ...overrides,
  };
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `npm test` passes all unit tests
- [ ] `npm run test:integration` passes (when Agent SDK available)
- [ ] Test coverage > 80% for core modules

#### Manual Verification:
- [ ] Can run integration tests against real Claude Code session
- [ ] Tests correctly identify complete vs incomplete scenarios

---

## Performance Considerations

### Latency Optimization

1. **Early Exit in Stop Hook**
   - Check `stop_hook_active` first to avoid redundant work
   - Check limits before running judge
   - Skip judge if deterministic checks fail

2. **Judge Optimization**
   - Use Sonnet for faster responses (configurable)
   - Limit diff size sent to judge (30KB default)
   - Cache judge results by fingerprint (optional)

3. **Fingerprint Computation**
   - Only compute when needed (PostToolUse Bash)
   - Use git commands which are fast for cached repos

4. **Parallel Operations**
   - Read transcript and compute fingerprint in parallel
   - (Future) Batch multiple directive analyses

### Resource Usage

- **Disk**: ~10KB per ledger, grows with stop attempts
- **Memory**: Minimal - no long-running processes
- **API Calls**: 1 per Stop hook (judge), configurable model
- **Subprocess**: One `claude -p` per Stop, times out at 60s

---

## Migration Notes

Not applicable - greenfield project.

---

## References

### Design Sources
- Chat export with design discussion: `/Users/smhanan/Downloads/chat-export (4).md`

### Claude Code Documentation
- Claude Code Hooks Documentation: https://code.claude.com/docs/en/hooks
- Claude Code CLI Reference: https://code.claude.com/docs/en/cli-reference
- Claude Agent SDK: https://platform.claude.com/docs/en/agent-sdk

### Partial Completion Research (Judge Criteria Sources)
Research findings on AI coding agent failure patterns that informed the judge criteria:

**GitHub Issues:**
- Claude Code Issue #599 - Premature termination without completing todos
- Claude Code Issue #8738 - Premature victory declaring
- Claude Code Issue #7759 - Post-compaction amnesia
- Claude Code Issue #10752 - Stopping mid-execution 50% of time

**Technical Articles:**
- VentureBeat - "Why AI coding agents aren't production-ready"
- Augment Code - "8 AI Code Failure Patterns and Fixes"
- Carnegie Mellon Study - 30-35% task completion rate for multi-step tasks

**Key Statistics:**
- 30-35% successful completion rate for multi-step tasks (Carnegie Mellon)
- 1 in 5 AI code samples contain references to fake/hallucinated libraries
- 40-45% of AI-generated code contains security vulnerabilities
- 50-60% todo list completion before premature stopping (Claude Code Issue #599)

---

## Project Structure (Final)

```
realitycheck/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── vitest.integration.config.ts
├── src/
│   ├── index.ts                    # Main exports
│   ├── types/
│   │   └── index.ts                # Zod schemas and types
│   ├── config/
│   │   └── index.ts                # Configuration loading
│   ├── ledger/
│   │   ├── index.ts                # LedgerManager
│   │   └── index.test.ts           # Unit tests
│   ├── git/
│   │   ├── index.ts                # GitManager
│   │   └── index.test.ts           # Unit tests
│   ├── judge/
│   │   ├── index.ts                # Judge implementation
│   │   └── index.test.ts           # Unit tests
│   ├── hooks/
│   │   ├── userPromptSubmit.ts
│   │   ├── postToolUse.ts
│   │   ├── stop.ts
│   │   ├── sessionStart.ts
│   │   └── *.test.ts               # Hook tests
│   ├── utils/
│   │   ├── slashCommands.ts
│   │   ├── transcript.ts
│   │   └── *.test.ts
│   ├── cli/
│   │   └── index.ts                # CLI entry point
│   └── tests/
│       ├── fixtures/
│       │   ├── sample-transcript.jsonl
│       │   └── incomplete-transcript.jsonl
│       ├── utils/
│       │   └── mockHookInput.ts
│       └── integration/
│           └── realitycheck.integration.test.ts
├── examples/
│   ├── claude-hooks-config.json
│   └── realitycheck.config.json
├── scripts/
│   └── setup.sh
└── docs/
    └── plans/
        └── realitycheck-implementation-plan.md
```
