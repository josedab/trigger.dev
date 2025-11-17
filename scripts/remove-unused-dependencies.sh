#!/bin/bash

# Dependency Cleanup Script
# Based on Dependency Audit Report - November 2025
#
# This script removes clearly unused dependencies identified by depcheck
# Phase 1: Low-risk removals (30 packages)

set -e

echo "🔍 Dependency Cleanup - Phase 1"
echo "================================"
echo ""

cd "$(dirname "$0")/.."

echo "📦 Removing unused production dependencies..."

# Remove unused production dependencies from webapp
cd apps/webapp

pnpm remove \
  @aws-sdk/client-sqs \
  @codemirror/lang-javascript \
  @electric-sql/react \
  @remix-run/v1-meta \
  @types/pg \
  @whatwg-node/fetch \
  eventsource \
  humanize-duration \
  jsonpointer \
  lodash.omit \
  non.geist \
  ohash \
  simple-oauth2 \
  sqs-consumer \
  ulidx

echo "✅ Removed 15 unused production dependencies"
echo ""

echo "🛠️  Removing unused dev dependencies..."

pnpm remove -D \
  @types/bcryptjs \
  @types/eslint \
  @types/humanize-duration \
  @types/json-query \
  @types/lodash.omit \
  @types/node-fetch \
  @types/qs \
  @types/react-collapse \
  @types/simple-oauth2 \
  @types/tar \
  css-loader \
  postcss-loader \
  prop-types \
  rimraf \
  style-loader

echo "✅ Removed 15 unused dev dependencies"
echo ""

cd ../..

echo "🧹 Running pnpm install to clean up..."
pnpm install

echo ""
echo "✨ Cleanup complete!"
echo "📊 Removed 30 packages total"
echo ""
echo "Next steps:"
echo "1. Run 'pnpm run build' to ensure everything still builds"
echo "2. Run 'pnpm run test' to ensure tests pass"
echo "3. Review docs/dependency-audit-2025.md for Phase 2 and 3 items"
