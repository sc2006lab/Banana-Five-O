import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? `postgresql://${process.env.USER}@localhost:5432/famplan_test`,
      SYNC_ON_STARTUP: 'false',
      APP_ORIGIN: 'http://localhost:5173',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
      BILLING_DEMO: 'true',
    },
    coverage: {
      provider: 'v8',
      include: ['src/scoring/**', 'src/lib/geo.ts', 'src/neighbourhoods/dedupe.ts', 'src/synchronisation/validate.ts', 'src/synchronisation/datagovsg.ts'],
      reporter: ['text', 'html'],
    },
  },
});
