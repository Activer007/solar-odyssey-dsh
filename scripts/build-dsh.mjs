import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const { name } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const textures = join(root, 'public', 'textures');
const lib = join(root, 'lib');
const assets = join(lib, 'assets');
const entries = await Promise.all((await readdir(textures)).sort().map(async filename => {
  if (!/^2k_[a-z0-9_]+\.(jpg|png)$/.test(filename)) throw new Error(`Invalid texture name ${filename}`);
  const bytes = await readFile(join(textures, filename));
  const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 12);
  return { filename, emitted: filename.replace(/\.(jpg|png)$/, `-${hash}.$1`), bytes };
}));
const styleFiles = ['src/styles.css', 'src/scene/sceneLabels.css'];
const styles = (await Promise.all(styleFiles.map(file => readFile(join(root, file), 'utf8')))).join('\n');
const game = await build({
  absWorkingDir: root, entryPoints: ['src/dsh-game.tsx'], bundle: true,
  format: 'cjs', platform: 'browser', target: 'es2022', minify: true,
  external: [`${name}/client.textures.js`],
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false' },
  legalComments: 'eof', write: false, metafile: true,
  plugins: [{
    name: 'dsh-resources',
    setup(builder) {
      builder.onResolve({ filter: /\/styles\.css\?inline$/ }, () => ({ path: 'game-css', namespace: 'solar' }));
      builder.onLoad({ filter: /^game-css$/, namespace: 'solar' }, () => ({ contents: styles, loader: 'text' }));
      builder.onLoad({ filter: /[\\/]texturePath\.ts$/ }, args => {
        if (normalize(args.path) !== join(root, 'src', 'data', 'texturePath.ts')) return;
        const urls = Object.fromEntries(entries.map(({ filename, emitted }) => [filename, `plugins/${name}/assets/${emitted}`]));
        return { contents: `const urls = ${JSON.stringify(urls)}; export function texturePath(filename) {
          if (!Object.hasOwn(urls, filename)) throw new Error('Unknown Solar Odyssey texture: ' + filename);
          return typeof require.asset === 'function' ? require.asset(urls[filename])
            : require(${JSON.stringify(`${name}/client.textures.js`)})[filename];
        }` };
      });
    },
  }],
});

function factory(id, source) {
  return `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory(require) {\n` +
    `  'use strict';\n  const module = { exports: {} };\n${source}\n  return module.exports;\n} });\n`;
}

const packageDirs = new Set();
for (const file of Object.keys(game.metafile.inputs)) {
  const parts = file.split('/');
  const moduleIndex = parts.lastIndexOf('node_modules');
  if (moduleIndex === -1) continue;
  const scoped = parts[moduleIndex + 1].startsWith('@');
  packageDirs.add(resolve(root, parts.slice(0, moduleIndex + (scoped ? 3 : 2)).join('/')));
}
const notices = await Promise.all([...packageDirs].sort().map(async directory => {
  const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  const files = (await readdir(directory)).filter(file => /^(licen[cs]e|copying|notice)(?:\.|$)/i.test(file)).sort();
  const texts = await Promise.all(files.map(file => readFile(join(directory, file), 'utf8')));
  return `${pkg.name} ${pkg.version}\n${texts.length ? texts.join('\n\n') : `Declared license: ${pkg.license ?? 'see source package'}`}`;
}));

await mkdir(assets, { recursive: true });
await Promise.all(entries.map(({ emitted, bytes }) => writeFile(join(assets, emitted), bytes)));
const chunk = 'client.game.js';
await writeFile(join(lib, chunk), factory(`${name}/${chunk}`, game.outputFiles[0].text));
const legacy = 'client.textures.js';
const dataUrls = Object.fromEntries(entries.map(({ filename, bytes }) => {
  const media = filename.endsWith('.png') ? 'image/png' : 'image/jpeg';
  return [filename, `data:${media};base64,${bytes.toString('base64')}`];
}));
await writeFile(join(lib, legacy), factory(`${name}/${legacy}`, `module.exports = ${JSON.stringify(dataUrls)};`));
await writeFile(join(lib, 'THIRD-PARTY-NOTICES.txt'), notices.join('\n\n---\n\n') + '\n');
// DSH derives the Client revision from the entry. Publish it after the chunk.
await writeFile(join(lib, 'client.js'), factory(name, await readFile(join(root, 'src', 'dsh-panel.js'), 'utf8')));
console.log(`DSH Client built with ${entries.length} revisioned textures.`);
