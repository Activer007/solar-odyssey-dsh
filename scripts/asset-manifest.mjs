import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const ASSET_NAMES = ['earth_clouds', 'earth_daymap', 'earth_nightmap', 'jupiter', 'mars', 'mercury', 'neptune', 'saturn', 'saturn_ring_alpha', 'uranus', 'venus_atmosphere']
  .map(name => `2k_${name}.${name === 'saturn_ring_alpha' ? 'png' : 'jpg'}`);
const sha256 = data => createHash('sha256').update(data).digest('hex');
const exists = async path => access(path).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
const filename = entry => entry.file.slice('public/textures/'.length);
const downloadUrl = name => `https://www.simplespacedata.org/texture/solarsystemscope/${name.replace(/^2k_/, '').replace(/\.(jpg|png)$/, '')}/latest/${name}`;
const metadata = name => ({
  file: `public/textures/${name}`,
  author: 'Solar System Scope / INOVE',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  sourcePage: 'https://www.solarsystemscope.com/textures/',
  originalSource: `https://www.solarsystemscope.com/textures/download/${name}`,
  downloadUrl: downloadUrl(name),
});

function validateManifest(manifest) {
  if (!Array.isArray(manifest) || !manifest.length) throw new Error('Asset manifest must be a nonempty array');
  const files = new Set();
  for (const entry of manifest) {
    if (!/^public\/textures\/2k_[a-z0-9_]+\.(jpg|png)$/.test(entry.file)) throw new Error('Invalid asset path in manifest');
    if (files.has(entry.file)) throw new Error(`Duplicate asset: ${entry.file}`);
    files.add(entry.file);
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes <= 0 || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error(`Invalid integrity record: ${entry.file}`);
    const expected = metadata(filename(entry));
    for (const field of ['author', 'license', 'licenseUrl', 'originalSource', 'downloadUrl']) {
      if (entry[field] !== expected[field]) throw new Error(`Unexpected ${field}: ${entry.file}`);
    }
  }
  return manifest;
}

export async function readManifest(root = PROJECT_ROOT) {
  return validateManifest(JSON.parse(await readFile(join(root, 'docs/assets-manifest.json'), 'utf8')));
}

function dataIssues(entry, data) {
  const issues = [];
  if (data.length !== entry.bytes) issues.push(`Size mismatch: ${entry.file} (expected ${entry.bytes}, found ${data.length})`);
  if (sha256(data) !== entry.sha256) issues.push(`SHA-256 mismatch: ${entry.file}`);
  return issues;
}

/** Compare every file, including unexpected directory entries, against the committed record. */
export async function verifyAssets(root, manifest, { allowMissing = false } = {}) {
  validateManifest(manifest);
  const directory = join(root, 'public/textures');
  const actual = await readdir(directory).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  const expected = new Set(manifest.map(filename));
  const issues = actual.filter(name => !expected.has(name)).map(name => `Unlisted asset: public/textures/${name}`);
  const missing = [];
  let totalBytes = 0;
  for (const entry of manifest) {
    try {
      const data = await readFile(join(root, entry.file));
      totalBytes += data.length;
      issues.push(...dataIssues(entry, data));
    } catch (error) {
      if (error.code !== 'ENOENT') { issues.push(`Unreadable asset: ${entry.file}`); continue; }
      missing.push(entry);
      if (!allowMissing) issues.push(`Missing asset: ${entry.file}`);
    }
  }
  return { valid: issues.length === 0, issues, missing, count: manifest.length - missing.length, totalBytes };
}

/** Generation is gated by the earlier SOURCES hashes, not just today's local bytes. */
export async function generateManifest(root = PROJECT_ROOT) {
  const source = await readFile(join(root, 'docs/SOURCES.md'), 'utf8');
  const rows = [...source.matchAll(/^\| `(2k_[a-z0-9_]+\.(?:jpg|png))` \| ([^|]+) \| ([^|]+) \| `([a-f0-9]{64})` \|/gm)];
  const sourceNames = rows.map(row => row[1]).sort();
  if (JSON.stringify(sourceNames) !== JSON.stringify([...ASSET_NAMES].sort())) throw new Error('SOURCES must contain exactly the eleven expected texture hashes');
  const manifest = await Promise.all(rows.map(async ([, name, content, dimensions, expectedHash]) => {
    const data = await readFile(join(root, 'public/textures', name));
    if (sha256(data) !== expectedHash) throw new Error(`SOURCES baseline SHA-256 mismatch: ${name}; manifest was not changed`);
    return { ...metadata(name), content: content.trim(), dimensions: dimensions.trim(), bytes: data.length, sha256: expectedHash };
  }));
  manifest.sort((a, b) => a.file.localeCompare(b.file, 'en'));
  const check = await verifyAssets(root, manifest);
  if (!check.valid) throw new Error(check.issues.join('\n'));
  if (await exists(join(root, 'docs/assets-manifest.json'))) {
    const committed = await verifyAssets(root, await readManifest(root));
    if (!committed.valid) throw new Error(`Existing manifest integrity failed; refusing to replace it:\n${committed.issues.join('\n')}`);
  }
  await writeFile(join(root, 'docs/assets-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return check;
}

/** Only missing files are fetched. Bytes must match the committed manifest
 * before opening the destination, even if the mirror's /latest/ has changed.
 */
export async function downloadMissing(root, manifest, fetcher = fetch) {
  const before = await verifyAssets(root, manifest, { allowMissing: true });
  if (!before.valid) throw new Error(before.issues.join('\n'));
  await mkdir(join(root, 'public/textures'), { recursive: true });
  let downloaded = 0;
  for (const entry of before.missing) {
    const response = await fetcher(entry.downloadUrl, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Download failed: ${filename(entry)} (HTTP ${response.status})`);
    const data = Buffer.from(await response.arrayBuffer());
    const issues = dataIssues(entry, data);
    if (issues.length) throw new Error(`Downloaded bytes rejected before writing:\n${issues.join('\n')}`);
    try {
      await writeFile(join(root, entry.file), data, { flag: 'wx' });
      downloaded++;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existingIssues = dataIssues(entry, await readFile(join(root, entry.file)));
      if (existingIssues.length) throw new Error(existingIssues.join('\n'));
    }
  }
  return { downloaded, ...(await verifyAssets(root, manifest)) };
}

/** Independent negative checks use only generated temporary fixtures. */
export async function selfTest() {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'solar-assets-check-'));
  try {
    await mkdir(join(temporaryRoot, 'public/textures'), { recursive: true });
    await mkdir(join(temporaryRoot, 'docs'));
    const data = Buffer.from('independent asset integrity fixture');
    const entry = { ...metadata('2k_fixture.jpg'), bytes: data.length, sha256: sha256(data) };
    const manifestPath = join(temporaryRoot, 'docs/assets-manifest.json'), assetPath = join(temporaryRoot, entry.file);
    await writeFile(assetPath, data);
    await writeFile(manifestPath, JSON.stringify([entry]));
    assert.equal((await verifyAssets(temporaryRoot, [entry])).valid, true);
    const brokenHash = { ...entry, sha256: '0'.repeat(64) };
    assert.match((await verifyAssets(temporaryRoot, [brokenHash])).issues.join('\n'), /SHA-256 mismatch/);
    await writeFile(manifestPath, JSON.stringify([brokenHash]));
    const failedCli = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'verify', '--root', temporaryRoot], { encoding: 'utf8' });
    assert.equal(failedCli.status, 1);
    assert.match(failedCli.stderr, /SHA-256 mismatch/);
    await writeFile(manifestPath, JSON.stringify([entry]));
    let requests = 0;
    const neverFetch = async () => { requests++; throw new Error('Existing file must not be fetched'); };
    assert.equal((await downloadMissing(temporaryRoot, [entry], neverFetch)).downloaded, 0);
    assert.equal(requests, 0);
    assert.deepEqual(await readFile(assetPath), data);
    const corruptExisting = Buffer.concat([data, Buffer.from('corrupt')]);
    await writeFile(assetPath, corruptExisting);
    assert.match((await verifyAssets(temporaryRoot, [entry])).issues.join('\n'), /Size mismatch/);
    await assert.rejects(downloadMissing(temporaryRoot, [entry], neverFetch), /mismatch/);
    assert.equal(requests, 0);
    assert.deepEqual(await readFile(assetPath), corruptExisting);
    await unlink(assetPath);
    assert.match((await verifyAssets(temporaryRoot, [entry])).issues.join('\n'), /Missing asset/);
    await assert.rejects(downloadMissing(temporaryRoot, [entry], async () => new Response(Buffer.from('corrupt'))), /rejected before writing/);
    assert.equal(await exists(assetPath), false);
    const sameSizeWrongHash = Buffer.from(data); sameSizeWrongHash[0] ^= 1;
    await assert.rejects(downloadMissing(temporaryRoot, [entry], async () => new Response(sameSizeWrongHash)), /SHA-256 mismatch/);
    assert.equal(await exists(assetPath), false);
    assert.equal((await downloadMissing(temporaryRoot, [entry], async () => new Response(data))).downloaded, 1);
    await writeFile(join(temporaryRoot, 'public/textures/unlisted.jpg'), data);
    assert.match((await verifyAssets(temporaryRoot, [entry])).issues.join('\n'), /Unlisted asset/);
    return 'PASS: corrupt hash exits 1; size/missing/extra detected; existing files untouched; corrupt downloads rejected; verified missing file restored (temporary fixtures only)';
  } finally {
    // The sole recursive removal is the exact directory returned by mkdtemp.
    const resolved = resolve(temporaryRoot);
    if (dirname(resolved) !== resolve(tmpdir()) || !basename(resolved).startsWith('solar-assets-check-')) throw new Error('Unsafe temporary cleanup path');
    await rm(resolved, { recursive: true, force: true });
  }
}

async function main() {
  const mode = process.argv[2] || 'verify', rootIndex = process.argv.indexOf('--root');
  if (rootIndex >= 0 && !process.argv[rootIndex + 1]) throw new Error('--root needs a directory');
  const root = rootIndex >= 0 ? resolve(process.argv[rootIndex + 1]) : PROJECT_ROOT;
  if (mode === 'self-test') { console.log(await selfTest()); return; }
  const result = mode === 'manifest' ? await generateManifest(root)
    : mode === 'verify' ? await verifyAssets(root, await readManifest(root))
      : mode === 'download' ? await downloadMissing(root, await readManifest(root)) : null;
  if (!result) throw new Error('Usage: node scripts/asset-manifest.mjs manifest|verify|download|self-test [--root directory]');
  if (!result.valid) throw new Error(result.issues.join('\n'));
  console.log(`Assets ${mode}: ${result.count} files, ${result.totalBytes} bytes${'downloaded' in result ? `, ${result.downloaded} downloaded` : ''}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
