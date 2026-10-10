/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
  },
  optimizeDeps: {
    // Pre-bundle heavy deps so cold-start latency is eliminated on first dev load
    include: ['tone', '@mediapipe/tasks-vision'],
  },
  build: {
    target: 'es2022',
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // MediaPipe WASM + JS loader in its own async chunk
          if (id.includes('@mediapipe/tasks-vision')) return 'mediapipe';
          // Tone.js in its own async chunk — large dep, rarely changes
          if (id.includes('/tone/') || id.includes('\\tone\\')) return 'tone';
          return undefined;
        },
      },
    },
  },
});
