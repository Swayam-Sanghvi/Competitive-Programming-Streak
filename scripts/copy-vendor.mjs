// Content scripts can't use bundler imports, so ship canvas-confetti's browser build as a plain file.
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('public/vendor', { recursive: true });
copyFileSync('node_modules/canvas-confetti/dist/confetti.browser.js', 'public/vendor/confetti.browser.js');
