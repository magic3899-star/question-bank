import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: 'out/main', rollupOptions: { input: resolve('src/app/main/index.ts') } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: resolve('src/app/preload/index.ts'),
        output: { format: 'cjs', entryFileNames: 'index.js' },
      },
    },
  },
  // Fast Refresh의 인라인 시작 스크립트 대신 엄격한 CSP를 개발 모드에서도 유지한다.
  renderer: {
    root: 'src/app/renderer',
    plugins: [react()],
    server: { hmr: false },
    build: {
      outDir: resolve('out/renderer'),
      rollupOptions: { input: resolve('src/app/renderer/index.html') },
    },
  },
});
