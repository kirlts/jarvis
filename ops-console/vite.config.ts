import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/admin': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    exclude: ['e2e/**', 'node_modules/**'],
    deps: {
      optimizer: {
        web: {
          enabled: true,
          include: [
            '@refinedev/core',
            '@refinedev/rest',
            'react-router',
            '@refinedev/react-router',
            'react',
            'react-dom',
          ],
        },
      },
    },
  },
});
