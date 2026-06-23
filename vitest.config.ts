import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});
