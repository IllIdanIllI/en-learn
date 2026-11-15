import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(import.meta.dirname, 'src') },
    ],
  },
  worker: { format: 'es' },
  // The voice worker is requested only at the first speaker press. Found that late, these packages made the dev server
  // re-bundle and reload the whole app at that press (the app restarted with the voice idle). Bundled at start instead.
  optimizeDeps: { include: ['kokoro-js', '@huggingface/transformers'] },
});
