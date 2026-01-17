#!/bin/bash
# Build validation script - Verify build succeeds and artifacts are valid

set -e

echo "🏗️  Building application..."

# Clean previous builds
rm -rf dist/

# Run the build
npm run build

# Verify build artifacts exist
if [ ! -d "dist/public" ]; then
  echo "❌ Client build failed - dist/public directory not found"
  exit 1
fi

if [ ! -f "dist/index.js" ]; then
  echo "❌ Server build failed - dist/index.js not found"
  exit 1
fi

# Check that key files exist in client build
if [ ! -f "dist/public/index.html" ]; then
  echo "❌ Client index.html not found"
  exit 1
fi

# Check that CSS was generated
if ! find dist/public/assets -name "*.css" | grep -q .; then
  echo "⚠️  No CSS files found in build"
  exit 1
fi

# Check that JS bundles were generated
if ! find dist/public/assets -name "*.js" | grep -q .; then
  echo "❌ No JS bundles found in client build"
  exit 1
fi

# Report build sizes
echo ""
echo "📊 Build Summary:"
echo "  Client bundle:"
du -sh dist/public || true
echo "  Server bundle:"
du -sh dist/index.js || true

echo ""
echo "✓ Build validation passed"
exit 0
