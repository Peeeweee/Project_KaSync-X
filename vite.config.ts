/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
  optimizeDeps: {
    // Pre-bundle heavy deps so cold-start latency is eliminated on first dev load
    include: ['tone', '@mediapipe/tasks-vision'],
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          // MediaPipe WASM + JS loader in its own async chunk
          mediapipe: ['@mediapipe/tasks-vision'],
          // Tone.js in its own async chunk — large dep, rarely changes
          tone: ['tone'],
        },
      },
    },
  },
});
