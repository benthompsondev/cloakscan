import { defineConfig } from 'vitest/config';

/**
 * Config for the development-only private-corpus harness. Kept separate from
 * the normal unit-test config so `npm run test` never touches it.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tools/private-corpus.test.ts'],
    // The corpus can be large; give the aggregate scan room to run.
    testTimeout: 120_000,
  },
});
