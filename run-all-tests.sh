#!/bin/bash

# Run all tests with proper configuration
echo "Running all tests..."

# Set Node options to prevent memory issues
export NODE_OPTIONS="--max-old-space-size=4096"

# Run tests with specific Jest options
npx jest \
  --maxWorkers=2 \
  --testTimeout=10000 \
  --forceExit \
  --detectOpenHandles \
  --coverage=false \
  --verbose=false \
  --silent=false \
  2>&1

# Capture exit code
TEST_EXIT_CODE=$?

# Show summary
echo ""
echo "Test run completed with exit code: $TEST_EXIT_CODE"

exit $TEST_EXIT_CODE