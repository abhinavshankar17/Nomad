import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app.html'),
        profile: resolve(__dirname, 'profile.html'),
        planner: resolve(__dirname, 'planner.html'),
        marketplace: resolve(__dirname, 'marketplace.html'),
      },
    },
  },
});
