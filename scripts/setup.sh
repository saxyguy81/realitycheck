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
