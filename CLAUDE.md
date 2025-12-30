# RealityCheck Project Instructions

## Testing Philosophy

**No manual verification required.** All verification criteria must be implemented as automated e2e tests that can be run via `npm test` or `npm run test:e2e`.

When implementing phases with "Manual" verification sections:
- Convert each manual verification item into an automated test
- Use real file system operations in temp directories
- Mock external dependencies (Claude CLI, network calls) where necessary
- Ensure tests are deterministic and non-flaky

## E2E Test Requirements

Installation and hook integration tests should verify:
- `npm run build` succeeds programmatically
- `npm link` / symlink creation works
- Hook configuration files are valid JSON
- CLI binary is executable and responds correctly to stdin
- Scripts run without errors in isolated environments

## Test Isolation

- Always use `fs.mkdtempSync()` for test directories
- Clean up temp directories in `afterEach` hooks
- Never pollute the actual project directory during tests
- Mock `process.cwd()` when testing path-dependent code
