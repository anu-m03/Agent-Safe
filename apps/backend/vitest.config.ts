import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    globals: false,
    restoreMocks: true,
  },
  resolve: {
    alias: {
      '@agent-safe/shared': resolve(__dirname, '../../packages/shared/src'),
    },
  },
});
