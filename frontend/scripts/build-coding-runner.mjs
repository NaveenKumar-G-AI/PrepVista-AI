import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { runnerAttribution } from './coding-runner-attribution.mjs';
const result = await build({
  entryPoints: ['src/modules/coding/runner/worker.ts'],
  outfile: 'public/coding-assets/runner-v1.js',
  bundle: true, minify: true, platform: 'browser', format: 'iife',
  target: 'es2022', legalComments: 'eof',
  metafile: true,
  banner: { js: '/*! Package notices: /coding-assets/runner-v1.NOTICES.txt */' },
});
const output = 'public/coding-assets/runner-v1';
const attribution = await runnerAttribution(process.cwd(), Object.keys(result.metafile.inputs), await readFile(`${output}.js`));
await writeFile(`${output}.NOTICES.txt`, attribution.notices, 'utf8');
await writeFile(`${output}.manifest.json`, JSON.stringify(attribution.manifest, null, 2) + '\n', 'utf8');
