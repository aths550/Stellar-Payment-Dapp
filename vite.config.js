import { defineConfig, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    // Transform .js files containing JSX before Rollup's import analysis
    {
      name: 'js-as-jsx',
      enforce: 'pre',
      async transform(code, id) {
        if (!id.includes('node_modules') && id.endsWith('.js')) {
          return transformWithEsbuild(code, id, { loader: 'jsx', jsx: 'automatic' });
        }
      },
    },
    react({ jsxRuntime: 'automatic' }),
  ],
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { '.js': 'jsx' },
    },
  },
});
