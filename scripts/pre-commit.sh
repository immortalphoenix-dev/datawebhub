#!/bin/bash
# Pre-commit hook - Run lint and type checks before committing
# Copy this to .git/hooks/pre-commit and make it executable

set -e

echo "🔍 Running pre-commit checks..."

# Check if npm is available
if ! command -v npm &> /dev/null; then
  echo "❌ npm not found. Please install Node.js"
  exit 1
fi

# Run TypeScript type check
echo "📝 Type checking..."
npm run check || {
  echo "❌ TypeScript check failed"
  exit 1
}

echo "✓ All pre-commit checks passed"
exit 0
