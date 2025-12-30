# Phase 5: Configuration and Installation

## Overview

Set up the hook configuration for Claude Code, create installation scripts, and provide example configurations for users.

## Prerequisites

**Files that must exist from Phases 1-4:**
- Complete `src/` implementation
- `package.json` with `bin` configuration
- Working `dist/cli/index.js` after build

**Verify previous phases complete:**
```bash
npm run build  # Should succeed
npm test       # Should pass
node dist/cli/index.js  # Should wait for stdin (Ctrl+C to exit)
```

## Context

RealityCheck integrates with Claude Code via the hooks system. Users need:
1. The `realitycheck` command available in PATH
2. Hook configuration in their project's `.claude/settings.local.json`
3. Optional RealityCheck configuration for tuning behavior

## Deliverables

### 1. Example Hook Configuration

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

### 2. Example RealityCheck Configuration

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

### 3. Setup Script

**File**: `scripts/setup.sh`
```bash
#!/bin/bash
set -e

echo "=== RealityCheck Setup ==="
echo ""

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "Error: Node.js 18+ required (found v$NODE_VERSION)"
  exit 1
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Build the project
echo "Building..."
npm run build

# Make CLI executable
chmod +x dist/cli/index.js

# Link globally
echo "Linking globally..."
npm link

# Verify installation
echo ""
echo "Verifying installation..."
REALITYCHECK_PATH=$(which realitycheck)
echo "  realitycheck installed at: $REALITYCHECK_PATH"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo ""
echo "1. Copy hook configuration to your project:"
echo "   cp examples/claude-hooks-config.json YOUR_PROJECT/.claude/settings.local.json"
echo ""
echo "2. (Optional) Copy RealityCheck config for customization:"
echo "   cp examples/realitycheck.config.json YOUR_PROJECT/.claude/realitycheck.config.json"
echo ""
echo "3. Start Claude Code in your project directory"
echo ""
```

### 4. Uninstall Script

**File**: `scripts/uninstall.sh`
```bash
#!/bin/bash
set -e

echo "=== RealityCheck Uninstall ==="

# Unlink globally
echo "Unlinking..."
npm unlink -g realitycheck 2>/dev/null || true

echo ""
echo "RealityCheck uninstalled."
echo ""
echo "To fully remove from a project, delete:"
echo "  - .claude/settings.local.json (or remove hooks section)"
echo "  - .claude/realitycheck/ directory"
echo "  - .claude/realitycheck.config.json (if exists)"
```

### 5. Quick Install for Users

**File**: `scripts/install-to-project.sh`
```bash
#!/bin/bash
# Run this from within a project directory to install RealityCheck hooks

set -e

PROJECT_DIR="${1:-.}"
CLAUDE_DIR="$PROJECT_DIR/.claude"

# Create .claude directory if needed
mkdir -p "$CLAUDE_DIR"

# Check if settings.local.json exists
SETTINGS_FILE="$CLAUDE_DIR/settings.local.json"

if [ -f "$SETTINGS_FILE" ]; then
  echo "Warning: $SETTINGS_FILE already exists."
  echo "Please manually merge the hooks configuration from:"
  echo "  examples/claude-hooks-config.json"
  exit 1
fi

# Copy hooks config
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp "$SCRIPT_DIR/../examples/claude-hooks-config.json" "$SETTINGS_FILE"

echo "RealityCheck hooks installed to $SETTINGS_FILE"
echo ""
echo "Optional: Copy realitycheck.config.json for customization"
```

### 6. Update package.json Scripts

Add to `package.json` scripts:
```json
{
  "scripts": {
    "setup": "bash scripts/setup.sh",
    "install-hooks": "bash scripts/install-to-project.sh"
  }
}
```

### 7. README Quick Start

**File**: `README.md`
```markdown
# RealityCheck

A Claude Code quality gate plugin that ensures task completion.

## Quick Start

### Installation

```bash
# Clone and setup
git clone <repo> realitycheck
cd realitycheck
npm run setup
```

### Add to Your Project

```bash
# In your project directory
mkdir -p .claude
cp /path/to/realitycheck/examples/claude-hooks-config.json .claude/settings.local.json
```

### Configuration (Optional)

Copy `examples/realitycheck.config.json` to your project's `.claude/` directory to customize:
- Judge model (opus/sonnet)
- Attempt limits
- Debug settings

## How It Works

RealityCheck intercepts Claude Code's Stop events and evaluates whether your request was fully completed. If not, it blocks the stop and provides specific next steps.

## Uninstall

```bash
cd /path/to/realitycheck
npm run uninstall
```

Remove `.claude/settings.local.json` from your projects.
```

### 8. .gitignore for RealityCheck State

**File**: `examples/.gitignore-addition`
```
# RealityCheck state (add to your project's .gitignore)
.claude/realitycheck/
```

## Verification Criteria

### Automated
- [ ] `npm run build` succeeds
- [ ] `npm link` succeeds
- [ ] `which realitycheck` returns a path

### Manual
- [ ] `scripts/setup.sh` runs without errors
- [ ] After setup, `realitycheck` command is available
- [ ] Hook configuration can be copied to a test project
- [ ] Starting Claude Code in test project shows no hook errors

## Implementation Notes

1. Scripts should be executable (`chmod +x scripts/*.sh`)
2. npm link creates a symlink - changes to dist/ are immediately reflected
3. For development, use `npm run watch` to auto-rebuild
4. Users on Windows may need to use WSL or adapt scripts

## After Completion

Run `/clear` and proceed to **Phase 6: Testing Infrastructure**.
