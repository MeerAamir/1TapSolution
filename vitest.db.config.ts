import { defineConfig } from 'vitest/config'

// Database integration tests: real migrations against a local Postgres.
// Requires TEST_DATABASE_URL (defaults to postgresql://postgres@127.0.0.1:54329/postgres).
export default defineConfig({
  test: {
    include: ['tests/db/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
})
