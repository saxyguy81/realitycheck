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
