import { build } from 'esbuild';
await build({ entryPoints: ['src/runner/worker.ts'], outfile: 'public/runner.js', bundle: true, minify: true, platform: 'browser', format: 'iife', target: 'es2022', legalComments: 'eof' });
