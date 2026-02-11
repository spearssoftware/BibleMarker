#!/usr/bin/env node
/**
 * Creates latest.json for Tauri updater from GitHub release assets.
 * Run after all platform artifacts are uploaded.
 *
 * Usage: node scripts/create-latest-json.js <tag> [version]
 * Example: node scripts/create-latest-json.js app-v0.7.2 0.7.2
 */

import { execSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const tag = process.argv[2];
const version = process.argv[3] || tag?.replace(/^app-v/, '') || '0.0.0';
if (!tag) {
  console.error('Usage: node scripts/create-latest-json.js <tag> [version]');
  process.exit(1);
}

const PLATFORM_PATTERNS = [
  { pattern: /BibleMarker-darwin-aarch64\.app\.tar\.gz$/i, key: 'darwin-aarch64' },
  { pattern: /BibleMarker-darwin-x86_64\.app\.tar\.gz$/i, key: 'darwin-x86_64' },
  { pattern: /BibleMarker.*linux.*x86_64.*\.tar\.gz$/i, key: 'linux-x86_64' },
  { pattern: /BibleMarker.*windows.*x86_64.*\.zip$/i, key: 'windows-x86_64' },
  { pattern: /\.AppImage\.tar\.gz$/i, key: 'linux-x86_64' },
  { pattern: /\.nsis\.zip$/i, key: 'windows-x86_64' },
];

function getAssetKey(name) {
  if (name.endsWith('.sig')) return null;
  for (const { pattern, key } of PLATFORM_PATTERNS) {
    if (pattern.test(name)) return key;
  }
  return null;
}

const out = execSync(`gh release view "${tag}" --json assets --repo spearssoftware/BibleMarker`, {
  encoding: 'utf-8',
});
const { assets } = JSON.parse(out);

const platforms = {};
const tmpDir = mkdtempSync(join(tmpdir(), 'latest-json-'));

try {
  for (const asset of assets) {
    const key = getAssetKey(asset.name);
    if (!key) continue;
    if (platforms[key]) continue;

    const sigAsset = assets.find((a) => a.name === asset.name + '.sig');
    let signature = '';
    if (sigAsset) {
      execSync(`gh release download "${tag}" -p "${sigAsset.name}" -D "${tmpDir}" --repo spearssoftware/BibleMarker`, {
        stdio: 'pipe',
      });
      signature = readFileSync(join(tmpDir, sigAsset.name), 'utf-8').trim();
    }

    const downloadUrl = `https://github.com/spearssoftware/BibleMarker/releases/download/${tag}/${asset.name}`;
    platforms[key] = { url: downloadUrl, signature };
  }

  const latest = {
    version,
    notes: '',
    pub_date: new Date().toISOString(),
    platforms,
  };

  const outputPath = join(tmpDir, 'latest.json');
  writeFileSync(outputPath, JSON.stringify(latest, null, 2));
  execSync(`gh release upload "${tag}" "${outputPath}" --clobber --repo spearssoftware/BibleMarker`, {
    stdio: 'inherit',
  });
  console.log('Uploaded latest.json');
} finally {
  rmSync(tmpDir, { recursive: true });
}
