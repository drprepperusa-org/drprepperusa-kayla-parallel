import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Default environment for src/ and tests/ (React components need jsdom)
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts', './server/__tests__/setup.ts'],
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx',
      'server/**/__tests__/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
    },
    // Override environment for server tests (Node.js, no DOM)
    environmentMatchGlobs: [
      ['server/**/__tests__/**/*.test.ts', 'node'],
    ],
  },
});
