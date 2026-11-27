import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * カメラの在席判定で使う MediaPipe の実行ファイル（wasm）を、CDN からではなく自分のサイトから配る。
 * npm パッケージの中のファイルを、開発中は /mediapipe/ で返し、ビルドでは dist/mediapipe/ に出力する。
 */
function mediapipeWasm(): Plugin {
  const dir = resolve(__dirname, 'node_modules/@mediapipe/tasks-vision/wasm');
  const files = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm'];
  const types: Record<string, string> = { js: 'text/javascript', wasm: 'application/wasm' };
  return {
    name: 'mediapipe-wasm',
    configureServer(server) {
      server.middlewares.use('/mediapipe', (req, res, next) => {
        const name = req.url?.split('?')[0].replace(/^\//, '') ?? '';
        if (!files.includes(name)) return next();
        res.setHeader('Content-Type', types[name.split('.').pop()!]);
        res.end(readFileSync(resolve(dir, name)));
      });
    },
    generateBundle() {
      for (const name of files) {
        this.emitFile({ type: 'asset', fileName: `mediapipe/${name}`, source: readFileSync(resolve(dir, name)) });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), mediapipeWasm()],
});
