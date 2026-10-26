#!/usr/bin/env node
/**
 * Fails when a @tauri-apps npm package and its paired Rust crate disagree on
 * major.minor. The Tauri CLI refuses to build such a pair, but it only notices
 * inside `tauri build` — which no CI job runs — so drift introduced by a
 * one-sided dependency bump stays invisible until a release build fails.
 *
 * Reads the resolved versions from the lockfiles, not the ranges in
 * package.json / Cargo.toml: a `^` range can resolve past the crate's minor,
 * which is how the drift happened both times.
 *
 * Pairing is derived from the names — `tauri` <-> `@tauri-apps/api` and
 * `tauri-plugin-<name>` <-> `@tauri-apps/plugin-<name>` — so a newly added
 * plugin is checked without touching this script. A crate or package with no
 * counterpart is reported rather than skipped.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

/** Pair key for a crate name, or null when the crate has no JS counterpart. */
function crateToPair(name) {
  if (name === 'tauri') return 'tauri';
  const plugin = /^tauri-plugin-(.+)$/.exec(name);
  return plugin ? `tauri-plugin-${plugin[1]}` : null;
}

/** Pair key for an npm package name, or null when it has no crate counterpart. */
function packageToPair(name) {
  if (name === '@tauri-apps/api') return 'tauri';
  const plugin = /^@tauri-apps\/plugin-(.+)$/.exec(name);
  return plugin ? `tauri-plugin-${plugin[1]}` : null;
}

function jsNameFor(pair) {
  return pair === 'tauri' ? '@tauri-apps/api' : pair.replace('tauri-plugin-', '@tauri-apps/plugin-');
}

/** Resolved crate versions from Cargo.lock, keyed by pair. */
function readCrateVersions() {
  const lock = readFileSync(join(root, 'src-tauri', 'Cargo.lock'), 'utf-8');
  const versions = new Map();
  const entry = /\[\[package\]\]\nname = "([^"]+)"\nversion = "([^"]+)"/g;
  for (const [, name, version] of lock.matchAll(entry)) {
    const pair = crateToPair(name);
    if (pair) versions.set(pair, version);
  }
  return versions;
}

/**
 * Resolved versions of the root importer's direct dependencies from
 * pnpm-lock.yaml, keyed by pair. Parsed line by line rather than with a YAML
 * library so the check stays dependency-free.
 */
function readPackageVersions() {
  const lines = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf-8').split('\n');
  const versions = new Map();
  let inRootImporter = false;
  let pair = null;

  for (const line of lines) {
    // Importers are keyed at two spaces; '.' is the app itself, and anything
    // else at that indent (e.g. 'worker:') ends its block.
    if (/^ {2}\S/.test(line)) {
      inRootImporter = line.trim() === '.:';
      pair = null;
      continue;
    }
    if (!inRootImporter) continue;

    const name = /^ {6}'?([^':]+)'?:$/.exec(line);
    if (name) {
      pair = packageToPair(name[1]);
      continue;
    }
    // pnpm appends peer resolutions, e.g. `version: 2.1.10(react@19.2.8)`.
    const version = /^ {8}version: ([^(\s]+)/.exec(line);
    if (version && pair) {
      versions.set(pair, version[1]);
      pair = null;
    }
  }
  return versions;
}

const minor = (version) => version.split('.').slice(0, 2).join('.');

/** The later of two major.minor strings, compared numerically (2.10 > 2.9). */
function laterMinor(a, b) {
  const [aMajor, aMinor] = a.split('.').map(Number);
  const [bMajor, bMinor] = b.split('.').map(Number);
  if (aMajor !== bMajor) return aMajor > bMajor ? a : b;
  return aMinor > bMinor ? a : b;
}

const crates = readCrateVersions();
const packages = readPackageVersions();
const problems = [];

for (const pair of [...new Set([...crates.keys(), ...packages.keys()])].sort()) {
  const crate = crates.get(pair);
  const pkg = packages.get(pair);
  const jsName = jsNameFor(pair);

  if (!crate) {
    problems.push(
      `${jsName} ${pkg} is a dependency, but no ${pair} crate is in src-tauri/Cargo.lock.\n` +
        `    Add ${pair} to src-tauri/Cargo.toml, or drop ${jsName} from package.json.`
    );
    continue;
  }
  if (!pkg) {
    problems.push(
      `${pair} ${crate} is in src-tauri/Cargo.lock, but ${jsName} is not a direct dependency.\n` +
        `    Add ${jsName} to package.json so its version is checked, or drop the crate.`
    );
    continue;
  }
  if (minor(crate) !== minor(pkg)) {
    problems.push(
      `${pair} ${crate} (crate) vs ${jsName} ${pkg} (npm) — ${minor(crate)} != ${minor(pkg)}.\n` +
        `    Move whichever side is behind to ${laterMinor(minor(crate), minor(pkg))}.x.`
    );
  }
}

if (problems.length > 0) {
  console.error(
    `Tauri JS packages and Rust crates must agree on major.minor; ${problems.length} do not:\n`
  );
  for (const problem of problems) console.error(`  - ${problem}\n`);
  console.error(
    '`tauri build` rejects a mismatched pair, which is why this runs here and not at release time.'
  );
  process.exit(1);
}

console.log(`Tauri JS/Rust versions agree on major.minor (${crates.size} pairs checked)`);
