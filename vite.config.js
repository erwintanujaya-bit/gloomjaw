import { defineConfig } from 'vite';

// base './' = relative asset paths, so the build works on GitHub Pages
// (in a sub-folder) or Netlify without changes.
export default defineConfig({
  base: './',
  server: { host: true },          // show the LAN URL so phones can connect
  build: { chunkSizeWarningLimit: 900, target: 'es2020' },
});
