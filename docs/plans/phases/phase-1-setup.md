# Phase 1: Project Setup and Core Infrastructure

## Overview

Set up the TypeScript project structure, define core types with Zod schemas, implement the configuration system, and build the Task Ledger.

## Prerequisites

- Empty project directory (greenfield)
- Node.js >= 18 installed
- npm available

## Context

RealityCheck is a Claude Code plugin that acts as a quality gate to ensure task completion. It intercepts Stop events and evaluates whether the user's original request has been fully implemented using an external Claude "judge" process.

This phase establishes the foundational infrastructure that all other phases depend on.

## Deliverables

### 1. Project Configuration

**File**: `package.json`
```json
{
  "name": "realitycheck",
  "version": "0.1.0",
  "description": "RealityCheck - Claude Code quality gate plugin that ensures task completion",
  "main": "dist/index.js",
  "type": "module",
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

**File**: `vitest.config.ts`
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.integration.test.ts'],
  },
});
```

### 2. Core Types (`src/types/index.ts`)

Define Zod schemas for:
- **Hook Inputs**: `BaseHookInputSchema`, `UserPromptSubmitInputSchema`, `StopHookInputSchema`, `PostToolUseInputSchema`, `SessionStartInputSchema`
- **Hook Outputs**: `HookDecisionSchema`
- **Task Ledger**: `DirectiveSchema`, `AcceptanceCriterionSchema`, `StopAttemptSchema`, `TaskLedgerSchema`

Key schema details:
- `StopHookInput` has `stop_hook_active: boolean` to detect recursion
- `DirectiveSchema` tracks user prompts with status: `active | superseded | completed | abandoned`
- `StopAttemptSchema` records each stop attempt with judge analysis for loop detection
- `TaskLedgerSchema` is the main storage structure (version 1)

### 3. Configuration System (`src/config/index.ts`)

- `RealityCheckConfigSchema` with sections for: judge, limits, storage, git, performance, debug
- `loadConfig(projectDir)` - loads from `.claude/realitycheck.config.json` or project root
- `getStoragePath(config, projectDir)` - returns `.claude/realitycheck/` path

Default values:
- Judge model: `opus`, timeout: 30000ms
- Limits: maxConsecutiveFailures: 20, maxTotalAttempts: 50, noProgressThreshold: 5
- Storage: `.claude/realitycheck`

### 4. Task Ledger (`src/ledger/index.ts`)

`LedgerManager` class with methods:
- `initialize()` - load existing or create new ledger
- `addDirective(rawText, type, normalizedIntent?)` - append user directive
- `recordStopAttempt(attempt)` - log stop attempt for history
- `recordFingerprint(hash, afterCommand?)` - record workspace state
- `setBaseline(baseline)` - set git baseline info
- `getActiveDirectives()` - return non-superseded directives
- `getStopAttempts()` - return attempt history
- `checkLimits()` - check if max attempts exceeded
- `analyzeProgress()` - detect improving/stagnant/regressing trends
- `reset()` - clear for new task

Storage: JSON file at `.claude/realitycheck/task_ledger.json`

### 5. Main Export (`src/index.ts`)

Re-export public API:
```typescript
export * from './types/index.js';
export * from './config/index.js';
export * from './ledger/index.js';
```

## Verification Criteria

### Automated
- [x] `npm install` completes successfully
- [x] `npm run build` produces `dist/` with no errors
- [x] `npm run typecheck` passes
- [x] Unit tests pass: `npm test`

### E2E Tests (No Manual Verification)
All verification automated in `src/ledger/index.test.ts`:
- [x] LedgerManager.initialize() creates task_ledger.json in temp directory
- [x] Adding directives persists them to the JSON file
- [x] Ledger survives process restart (load existing data in new instance)

## Implementation Notes

1. Use ES modules (`"type": "module"` in package.json)
2. All imports must use `.js` extension for NodeNext resolution
3. Ledger should handle corrupted files gracefully (archive and recreate)
4. Config loading should fail gracefully with defaults

## After Completion

Run `/clear` and proceed to **Phase 2: Git Baseline and Fingerprinting**.
