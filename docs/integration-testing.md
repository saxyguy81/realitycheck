# RealityCheck Integration Testing

## Prerequisites

1. **Build RealityCheck**:
   ```bash
   npm run build
   ```

2. **Link globally** (so `realitycheck` CLI is in PATH):
   ```bash
   npm link
   ```

3. **Configure API access** - You need a valid API key. Either:
   - Set `ANTHROPIC_API_KEY` environment variable, or
   - Use ccproxy with a configured API key

4. **Start ccproxy** (API proxy at localhost:4000):
   ```bash
   ccproxy start
   ```

5. **Verify ccproxy is running**:
   ```bash
   curl http://localhost:4000/health
   ```

**Note:** If tests fail with "Claude Code process exited with code 1", check that your API key is properly configured.

## Running Integration Tests

```bash
# Run all integration tests
npm run test:integration

# Run specific test suite
npm run test:integration -- --grep "End-to-End"

# Run with verbose output
npm run test:integration -- --reporter=verbose
```

## Test Configuration

Tests use ccproxy at `localhost:4000` by default. Override with:

```bash
ANTHROPIC_BASE_URL=http://your-proxy:port npm run test:integration
```

### Model Configuration

- **User Agent**: claude-sonnet-4-20250514
- **Judge**: claude-opus-4-20250514 (configured in test project)

### Timeout Configuration

- Per-test timeout: 2 minutes
- Session timeout: 1 minute
- Hook timeout: 30 seconds

## Test Suites

| Suite | Tests | Description |
|-------|-------|-------------|
| End-to-End Scenarios | 5 | Full task completion flows |
| Judge Accuracy | 5 | Judge decision quality |
| Multi-Session Scenarios | 3 | Session persistence |
| Git Integration | 3 | Baseline and diff tracking |
| Slash Command Integration | 3 | Command expansion |
| Performance & Limits | 4 | Limit enforcement |

## Troubleshooting

### Tests Skip with "ccproxy not available"

Start ccproxy:
```bash
ccproxy start
```

### Tests Timeout

Increase timeout in `vitest.integration.config.ts`:
```typescript
testTimeout: 300000, // 5 minutes
```

### "realitycheck: command not found"

Link the package globally:
```bash
npm link
```

### Rate Limiting

If you hit API rate limits, reduce parallel execution:
```typescript
// vitest.integration.config.ts
poolOptions: {
  threads: {
    maxThreads: 1,  // Sequential execution
  },
},
```

## Test Architecture

### Components

1. **config.ts** - Test configuration (API URLs, models, timeouts)
2. **testProjectFactory.ts** - Creates isolated test projects with git and hooks
3. **agentSession.ts** - Runs Claude sessions via Agent SDK
4. **realitycheck.integration.test.ts** - All 23 integration tests

### Test Project Structure

Each test creates an isolated project with:
- Git repository (initialized with test commits)
- `.claude/settings.local.json` (RealityCheck hooks)
- `.claude/realitycheck.config.json` (RealityCheck settings)
- Optional slash commands in `.claude/commands/`

### Cleanup

Test projects are created in the system temp directory and cleaned up after each test via `project.cleanup()`.

## Adding New Tests

1. Add test to appropriate describe block in `realitycheck.integration.test.ts`
2. Use `createTestProject()` to create isolated environment
3. Use `runSession()` to interact with Claude
4. Check `project.getLedger()` for RealityCheck state
5. Call `project.cleanup()` in finally block

Example:
```typescript
it('your test description', async () => {
  if (!ccproxyAvailable) return;

  const project = createTestProject({ name: 'your-test' });

  try {
    const result = await runSession({
      prompt: 'Your prompt here',
      cwd: project.dir,
      maxTurns: 5,
    });

    const ledger = project.getLedger();
    expect(ledger).not.toBeNull();
    // ... assertions
  } finally {
    project.cleanup();
  }
});
```
