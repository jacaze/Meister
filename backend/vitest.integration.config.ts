import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.integration.test.ts', 'src/**/*.integration.test.ts'],
    globals: false,
    testTimeout: 25000,
    fileParallelism: false,
    env: {
      TELEGRAM_WEBHOOK_SECRET: 'test_webhook_secret_telegram_32_chars_long',
    },
  },
});
