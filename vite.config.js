import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = (p) => fileURLToPath(new URL(p, import.meta.url));

// Builds the extension into dist/: popup + dashboard pages, and background.js as an ES module
// service worker. public/ (manifest, content script, icons, vendored confetti) is copied as-is.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        popup: root('popup.html'),
        dashboard: root('dashboard.html'),
        background: root('src/background.js'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
});
