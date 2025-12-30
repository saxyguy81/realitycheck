# RealityCheck

A Claude Code quality gate plugin that ensures task completion before allowing the agent to stop.

## What It Does

RealityCheck intercepts Claude Code's Stop events and uses an AI judge to evaluate whether your request was fully completed. If not, it blocks the stop and provides specific next steps to complete the task.

## Installation

### Option 1: From Marketplace (Recommended)

```bash
# Add the marketplace (one-time)
claude /plugin install realitycheck@saxyguy81-plugins

# Or via CLI
claude plugin install realitycheck@saxyguy81-plugins --scope user
```

### Option 2: Local Development

```bash
# Clone the repo
git clone https://github.com/saxyguy81/realitycheck.git
cd realitycheck

# Install dependencies and build
npm install
npm run build

# Test locally with Claude Code
claude --plugin-dir ./
```

### Option 3: Manual Installation (Legacy)

```bash
# Clone and setup
git clone https://github.com/saxyguy81/realitycheck.git
cd realitycheck
npm run setup

# Copy hooks to your project
cp examples/claude-hooks-config.json YOUR_PROJECT/.claude/settings.local.json
```

## Configuration (Optional)

Create `.claude/realitycheck.config.json` in your project to customize:

```json
{
  "judge": {
    "model": "opus",
    "timeout": 30000
  },
  "limits": {
    "maxConsecutiveFailures": 3,
    "maxTotalAttempts": 5,
    "noProgressThreshold": 3
  },
  "debug": false
}
```

## How It Works

1. **UserPromptSubmit**: Captures user directives and stores them in a task ledger
2. **PostToolUse**: Tracks progress via git fingerprinting after Bash commands
3. **Stop**: Invokes an AI judge to evaluate task completion before allowing stop
4. **SessionStart**: Restores context after `/clear` or session resume

## Uninstall

### Plugin
```bash
claude plugin uninstall realitycheck
```

### Legacy (npm link)
```bash
cd /path/to/realitycheck
npm run uninstall
```

Remove `.claude/settings.local.json` from your projects.

## Development

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Type check
npm run typecheck

# Lint
npm run lint

# Full check
npm run check
```

## License

MIT
