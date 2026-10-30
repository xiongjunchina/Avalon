import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { normalizeBasePath } from '../../packages/contracts/src/deployment-path.ts';
const base = normalizeBasePath(process.env.APP_BASE_PATH);
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)), base,
  define: { __APP_BASE_PATH__: JSON.stringify(base) },
  plugins: [react(), {name: 'deployment-path', generateBundle() {
    this.emitFile({type: 'asset', fileName: 'base-path.txt', source: base});
  }}],
  server: { host: '127.0.0.1', port: 5173, strictPort: true,
    proxy: { [base + 'api']: { target: 'http://127.0.0.1:3001', ws: true,
      rewrite: path => base === '/' ? path : path.slice(base.length - 1) } } },
  build: { outDir: 'dist', emptyOutDir: true },
});
