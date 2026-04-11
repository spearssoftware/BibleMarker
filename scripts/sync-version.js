#!/usr/bin/env node
/**
 * Syncs version from package.json to src-tauri/Cargo.toml and iOS Info.plist.
 * Keeps all platform versions in sync with the single source of truth.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const version = pkg.version;
const iosVersion = version.replace(/-.*$/, '');

// Sync to Cargo.toml
const cargoPath = join(root, 'src-tauri', 'Cargo.toml');
let cargo = readFileSync(cargoPath, 'utf-8');
cargo = cargo.replace(/^version\s*=\s*"[^"]*"/m, `version = "${version}"`);
writeFileSync(cargoPath, cargo);
console.log(`Synced version ${version} to src-tauri/Cargo.toml`);

// Sync to iOS Info.plist
const iosInfoPath = join(root, 'src-tauri', 'gen', 'apple', 'biblemarker_iOS', 'Info.plist');
if (existsSync(iosInfoPath)) {
  let plist = readFileSync(iosInfoPath, 'utf-8');
  plist = plist.replace(
    /(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]*(<\/string>)/,
    `$1${iosVersion}$2`
  );
  plist = plist.replace(
    /(<key>CFBundleVersion<\/key>\s*<string>)[^<]*(<\/string>)/,
    `$1${iosVersion}$2`
  );
  writeFileSync(iosInfoPath, plist);
  console.log(`Synced version ${iosVersion} to iOS Info.plist`);
}

// Sync to Xcode project.yml
const projectYmlPath = join(root, 'src-tauri', 'gen', 'apple', 'project.yml');
if (existsSync(projectYmlPath)) {
  let yml = readFileSync(projectYmlPath, 'utf-8');
  yml = yml.replace(
    /CFBundleShortVersionString:\s*.+/,
    `CFBundleShortVersionString: ${iosVersion}`
  );
  yml = yml.replace(
    /CFBundleVersion:\s*".+"/,
    `CFBundleVersion: "${iosVersion}"`
  );
  writeFileSync(projectYmlPath, yml);
  console.log(`Synced version ${iosVersion} to project.yml`);
}
