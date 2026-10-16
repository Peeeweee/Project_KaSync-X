import { fileURLToPath } from 'node:url';
import { build, type Plugin } from 'vite';

/** MediaPipe 0.10.3 loads its WASM glue with importScripts, requiring a classic worker. */
export function classicTrackingWorker(): Plugin {
  let compiled: Promise<string> | null = null;
  const entry = fileURLToPath(new URL('../src/tracking/handTracking.worker.ts', import.meta.url));
  const compile = () => compiled ??= (async () => {
    const result = await build({
      configFile: false, publicDir: false, logLevel: 'error',
      build: {
        write: false, target: 'es2022', minify: true,
        lib: { entry, name: 'KasyncHandTrackingWorker', formats: ['iife'] },
      },
    });
    const output = Array.isArray(result) ? result[0] : result;
    if (!('output' in output)) throw new Error('Tracking worker build did not produce a bundle.');
    const chunk = output.output.find(item => item.type === 'chunk');
    if (!chunk || chunk.type !== 'chunk') throw new Error('Tracking worker bundle is missing.');
    return chunk.code;
  })();
  return {
    name: 'kasync-classic-tracking-worker',
    configureServer(server) {
      server.watcher.on('change', path => { if (path.replaceAll('\\', '/').includes('/src/tracking/')) compiled = null; });
      server.middlewares.use('/hand-tracking.worker.js', (_request, response, next) => {
        void compile().then(code => {
          response.setHeader('Content-Type', 'application/javascript');
          response.setHeader('Cache-Control', 'no-cache');
          response.end(code);
        }).catch(error => { compiled = null; next(error); });
      });
    },
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'hand-tracking.worker.js', source: await compile() });
    },
  };
}
