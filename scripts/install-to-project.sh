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
