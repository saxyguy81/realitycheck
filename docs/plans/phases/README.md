# RealityCheck Implementation Phases

This directory contains self-contained implementation prompts for each phase of RealityCheck. Each phase can be executed in a fresh Claude context window.

## Phase Overview

| Phase | Name | Description | Est. Complexity |
|-------|------|-------------|-----------------|
| 1 | [Setup](./phase-1-setup.md) | Project config, types, config system, ledger | Medium |
| 2 | [Git](./phase-2-git.md) | Git baseline and fingerprinting | Low |
| 3 | [Hooks](./phase-3-hooks.md) | All 4 hook implementations + utilities | High |
| 4 | [Judge](./phase-4-judge.md) | External Claude judge system | Medium |
| 5 | [Install](./phase-5-install.md) | Scripts, examples, README | Low |
| 6 | [Testing](./phase-6-testing.md) | Unit tests for all modules | Medium |

## Execution Instructions

### Starting a Phase

1. **Run `/clear`** to start with a fresh context
2. **Open the phase file** and copy its contents as your prompt, OR reference it:
   ```
   Implement Phase N following the plan in docs/plans/phases/phase-N-*.md
   ```
3. **Verify prerequisites** - each phase lists what must exist from prior phases
4. **Implement** - follow the deliverables and verification criteria
5. **Verify completion** - run the automated checks listed

### Between Phases

After completing a phase:
1. Verify all automated checks pass (`npm run build`, `npm test`)
2. Commit your changes (optional but recommended)
3. Run `/clear` to free context for the next phase
4. Proceed to the next phase

### Quick Reference

```bash
# Phase 1 complete when:
npm run build && npm test

# Phase 2 complete when:
npm test -- src/git

# Phase 3 complete when:
npm run build && echo '{"hook_event_name":"Stop",...}' | node dist/cli/index.js

# Phase 4 complete when:
npm test -- src/judge

# Phase 5 complete when:
which realitycheck

# Phase 6 complete when:
npm test && npm run test:coverage
```

## Dependency Graph

```
Phase 1 (Setup)
    │
    ▼
Phase 2 (Git)
    │
    ▼
Phase 3 (Hooks) ◄── Stubs judge, completed in Phase 4
    │
    ▼
Phase 4 (Judge) ◄── Replaces stub from Phase 3
    │
    ▼
Phase 5 (Install)
    │
    ▼
Phase 6 (Testing)
```

## File Structure After All Phases

```
realitycheck/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── vitest.integration.config.ts
├── README.md
├── src/
│   ├── index.ts
│   ├── types/
│   │   └── index.ts
│   ├── config/
│   │   └── index.ts
│   ├── ledger/
│   │   ├── index.ts
│   │   └── index.test.ts
│   ├── git/
│   │   ├── index.ts
│   │   └── index.test.ts
│   ├── judge/
│   │   ├── index.ts
│   │   └── index.test.ts
│   ├── hooks/
│   │   ├── userPromptSubmit.ts
│   │   ├── postToolUse.ts
│   │   ├── stop.ts
│   │   ├── sessionStart.ts
│   │   └── *.test.ts
│   ├── utils/
│   │   ├── transcript.ts
│   │   ├── slashCommands.ts
│   │   └── *.test.ts
│   ├── cli/
│   │   └── index.ts
│   └── tests/
│       ├── fixtures/
│       ├── utils/
│       └── integration/
├── examples/
│   ├── claude-hooks-config.json
│   └── realitycheck.config.json
├── scripts/
│   ├── setup.sh
│   ├── uninstall.sh
│   └── install-to-project.sh
└── docs/
    └── plans/
        ├── realitycheck-implementation-plan.md
        └── phases/
            ├── README.md
            ├── phase-1-setup.md
            ├── phase-2-git.md
            ├── phase-3-hooks.md
            ├── phase-4-judge.md
            ├── phase-5-install.md
            └── phase-6-testing.md
```

## Notes

- Each phase document is self-contained with all necessary context
- The main implementation plan (`realitycheck-implementation-plan.md`) contains full code listings
- Phase documents contain summaries and key implementation notes
- When in doubt, reference the main plan for complete code examples
