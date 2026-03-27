import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared'),
        '@kioskos/shared-types': resolve('../../packages/shared-types/src'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@kioskos/shared-types': resolve('../../packages/shared-types/src'),
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@kioskos/shared-types': resolve('../../packages/shared-types/src'),
        '@renderer': resolve('src/renderer'),
      },
    },
    plugins: [vue()],
    root: resolve('src/renderer'),
    build: {
      rollupOptions: {
        input: {
          admin: resolve('src/renderer/admin/index.html'),
          webview: resolve('src/renderer/webview/index.html'),
        },
      },
    },
  },
});
