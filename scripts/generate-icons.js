#!/usr/bin/env node

/**
 * Generate app icons from SVG source
 * 
 * This script generates all required icon sizes for:
 * - PWA (192x192, 512x512)
 * - Apple touch icon (180x180)
 * - Tauri (various sizes)
 * 
 * Requirements:
 * - sharp: npm install -D sharp
 * - OR use ImageMagick: brew install imagemagick
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const publicDir = join(projectRoot, 'public');
const iconSvg = join(publicDir, 'icon.svg');

// Icon sizes needed
const iconSizes = {
  pwa: [192, 512],
  apple: [180],
  tauri: [32, 128, 256, 512, 1024],
  favicon: [16, 32, 48]
};

async function generateIcons() {
  console.log('🎨 Generating app icons...\n');

  // Check if sharp is available
  let sharp;
  try {
    sharp = (await import('sharp')).default;
    console.log('✅ Using sharp for icon generation\n');
  } catch (e) {
    console.error('❌ sharp not found. Installing...\n');
    console.log('Please run: pnpm add -D sharp\n');
    console.log('Or use ImageMagick manually:\n');
    console.log('  convert -background none -resize 192x192 icon.svg pwa-192x192.png');
    console.log('  convert -background none -resize 512x512 icon.svg pwa-512x512.png');
    console.log('  convert -background none -resize 180x180 icon.svg apple-touch-icon.png\n');
    process.exit(1);
  }

  if (!existsSync(iconSvg)) {
    console.error(`❌ Icon source not found: ${iconSvg}`);
    console.log('Please create icon.svg in the public/ directory');
    process.exit(1);
  }

  const svgBuffer = readFileSync(iconSvg);

  // Generate PWA icons
  console.log('📱 Generating PWA icons...');
  for (const size of iconSizes.pwa) {
    const outputPath = join(publicDir, `pwa-${size}x${size}.png`);
    await sharp(svgBuffer)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outputPath);
    console.log(`  ✓ Created pwa-${size}x${size}.png`);
  }

  // Generate Apple touch icon
  console.log('\n🍎 Generating Apple touch icon...');
  for (const size of iconSizes.apple) {
    const outputPath = join(publicDir, `apple-touch-icon.png`);
    await sharp(svgBuffer)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outputPath);
    console.log(`  ✓ Created apple-touch-icon.png (${size}x${size})`);
  }

  // Generate favicon.ico (multi-size)
  console.log('\n🔖 Generating favicon...');
  const faviconSizes = iconSizes.favicon.map(size => ({
    size,
    buffer: sharp(svgBuffer).resize(size, size).png().toBuffer()
  }));
  const faviconBuffers = await Promise.all(faviconSizes.map(f => f.buffer));
  
  // Note: sharp doesn't create .ico files directly, but we can create PNG favicons
  // For .ico, you'd need a different tool or online converter
  const faviconPath = join(publicDir, 'favicon-32x32.png');
  await sharp(faviconBuffers[1]).toFile(faviconPath);
  console.log(`  ✓ Created favicon-32x32.png`);
  console.log(`  ⚠️  For .ico file, use an online converter or ImageMagick`);

  // Generate Tauri icons directory structure
  console.log('\n🖥️  Generating Tauri icons...');
  const tauriIconsDir = join(projectRoot, 'src-tauri', 'icons');
  if (!existsSync(tauriIconsDir)) {
    mkdirSync(tauriIconsDir, { recursive: true });
  }

  for (const size of iconSizes.tauri) {
    const outputPath = join(tauriIconsDir, `${size}x${size}.png`);
    await sharp(svgBuffer)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outputPath);
    console.log(`  ✓ Created ${size}x${size}.png`);
  }

  // Generate @2x versions for macOS
  console.log('\n📱 Generating @2x icons for macOS...');
  for (const size of [128, 256, 512]) {
    const outputPath = join(tauriIconsDir, `${size}x${size}@2x.png`);
    await sharp(svgBuffer)
      .resize(size * 2, size * 2, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outputPath);
    console.log(`  ✓ Created ${size}x${size}@2x.png`);
  }

  // Generate .icns for macOS (requires additional tool)
  console.log('\n🍎 For .icns file (macOS app icon):');
  console.log('   Run: iconutil -c icns src-tauri/icons/icon.iconset');
  console.log('   Or use online converter: https://cloudconvert.com/png-to-icns\n');

  console.log('✅ Icon generation complete!\n');
  console.log('📝 Next steps:');
  console.log('   1. Review generated icons in public/ and src-tauri/icons/');
  console.log('   2. For Tauri: Run "pnpm tauri icon public/icon.svg" to auto-generate all formats');
  console.log('   3. For .ico: Convert favicon-32x32.png to favicon.ico using online tool\n');
}

generateIcons().catch(console.error);
