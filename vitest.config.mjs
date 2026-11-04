import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: [
      'tests/unit/**/*.{test,spec}.js',
      'tests/integration/**/*.{test,spec}.js'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['script.js']
    }
  }
});
