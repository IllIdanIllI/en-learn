import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(import.meta.dirname, 'src') },
      // The Kokoro worker imports the onnxruntime-web files by `ort-dist/...`; the package exports block that path.
      { find: /^ort-dist\/(.*)$/, replacement: path.resolve(import.meta.dirname, 'node_modules/onnxruntime-web/dist') + '/$1' },
    ],
  },
  worker: { format: 'es' },
});
