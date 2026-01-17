#!/usr/bin/env node

/**
 * Download Script for Bundled SWORD Modules
 * 
 * Downloads public domain Bible translations (ASV, KJV, GodsWord) from CrossWire
 * and saves them to public/modules/ for bundling with the app.
 */

import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');
const MODULES_DIR = join(ROOT_DIR, 'public', 'modules');

const CROSSWIRE_SERVLET_BASE = 'https://crosswire.org/sword/servlet/SwordMod.Verify';

const MODULES = [
  {
    name: 'ASV',
    url: `${CROSSWIRE_SERVLET_BASE}?modName=ASV&pkgType=raw`,
    filename: 'ASV.zip',
  },
  {
    name: 'KJV',
    url: `${CROSSWIRE_SERVLET_BASE}?modName=KJV&pkgType=raw`,
    filename: 'KJV.zip',
  },
  {
    name: 'GodsWord',
    url: `${CROSSWIRE_SERVLET_BASE}?modName=GodsWord&pkgType=raw`,
    filename: 'GodsWord.zip',
  },
];

/**
 * Download a file with progress tracking
 */
async function downloadFile(url, outputPath, moduleName) {
  console.log(`\n📥 Downloading ${moduleName}...`);
  console.log(`   URL: ${url}`);
  
  try {
    // Follow redirects and ensure we get the actual file
    const response = await fetch(url, {
      redirect: 'follow',
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    // Check if we got HTML instead of a ZIP (servlet redirect issue)
    const contentType = response.headers.get('content-type') || '';
    const firstBytes = await response.clone().arrayBuffer().then(buf => new Uint8Array(buf.slice(0, 2)));
    const isZipFile = firstBytes[0] === 0x50 && firstBytes[1] === 0x4B; // "PK" signature
    
    if (!isZipFile && contentType.includes('text/html')) {
      // Try to extract the redirect URL from the HTML
      const text = await response.text();
      // Look for URL= or HREF= patterns in the HTML redirect
      const redirectMatch = text.match(/URL=([^"'>\s]+\.zip)/i) || 
                           text.match(/HREF=([^"'>\s]+\.zip)/i) ||
                           text.match(/href=["']([^"']+\.zip)["']/i);
      if (redirectMatch) {
        let redirectUrl = redirectMatch[1];
        // Make absolute URL if relative
        if (redirectUrl.startsWith('/')) {
          redirectUrl = `https://crosswire.org${redirectUrl}`;
        } else if (!redirectUrl.startsWith('http')) {
          redirectUrl = `https://crosswire.org/${redirectUrl}`;
        }
        console.log(`   Following redirect to: ${redirectUrl}`);
        
        // If the redirect URL has /raw/ instead of /rawzip/, try both paths
        if (redirectUrl.includes('/raw/') && !redirectUrl.includes('/rawzip/')) {
          const rawzipUrl = redirectUrl.replace('/raw/', '/rawzip/');
          try {
            console.log(`   Trying /rawzip/ path: ${rawzipUrl}`);
            return await downloadFile(rawzipUrl, outputPath, moduleName);
          } catch (err) {
            // Fall back to original /raw/ redirect URL
            console.log(`   /rawzip/ failed, trying /raw/ path: ${redirectUrl}`);
            try {
              return await downloadFile(redirectUrl, outputPath, moduleName);
            } catch (err2) {
              // If both fail, WEB might not be available in raw format
              // Try alternative: compressed format
              if (moduleName === 'WEB') {
                const compressedUrl = `https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/WEB.zip`;
                console.log(`   Trying compressed format as fallback...`);
                // Don't retry recursively to avoid infinite loop
                throw new Error(`WEB module not available. You may need to download it manually from https://crosswire.org/sword/modules/ModDisp.jsp?modType=Bibles`);
              }
              throw err2;
            }
          }
        }
        return await downloadFile(redirectUrl, outputPath, moduleName);
      }
      throw new Error('Received HTML redirect but could not extract download URL');
    }
    
    if (!isZipFile) {
      throw new Error('Downloaded file is not a valid ZIP file');
    }
    
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    const totalMB = (contentLength / (1024 * 1024)).toFixed(2);
    
    if (contentLength > 0) {
      console.log(`   Size: ${totalMB} MB`);
    }
    
    const fileStream = createWriteStream(outputPath);
    const reader = response.body.getReader();
    
    let receivedLength = 0;
    let lastProgress = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      fileStream.write(Buffer.from(value));
      receivedLength += value.length;
      
      if (contentLength > 0) {
        const progress = Math.floor((receivedLength / contentLength) * 100);
        if (progress >= lastProgress + 10) {
          process.stdout.write(`   Progress: ${progress}%\r`);
          lastProgress = progress;
        }
      }
    }
    
    fileStream.end();
    console.log(`   ✅ ${moduleName} downloaded successfully`);
    
    return true;
  } catch (error) {
    console.error(`   ❌ Failed to download ${moduleName}:`, error.message);
    return false;
  }
}

/**
 * Main download function
 */
async function main() {
  console.log('🚀 Starting module downloads...');
  console.log(`📁 Output directory: ${MODULES_DIR}\n`);
  
  // Ensure modules directory exists
  try {
    await mkdir(MODULES_DIR, { recursive: true });
    console.log(`✅ Created directory: ${MODULES_DIR}\n`);
  } catch (error) {
    if (error.code !== 'EEXIST') {
      console.error('❌ Failed to create modules directory:', error.message);
      process.exit(1);
    }
  }
  
  let successCount = 0;
  let failCount = 0;
  
  // Download each module
  for (const module of MODULES) {
    const outputPath = join(MODULES_DIR, module.filename);
    const success = await downloadFile(module.url, outputPath, module.name);
    
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Download Summary:');
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log('='.repeat(50));
  
  if (failCount > 0) {
    console.log('\n⚠️  Some downloads failed. You can:');
    console.log('   1. Run this script again to retry');
    console.log('   2. Manually download from: https://crosswire.org/sword/modules/ModDisp.jsp?modType=Bibles');
    console.log('   3. Place ZIP files in: public/modules/');
    process.exit(1);
  } else {
    console.log('\n🎉 All modules downloaded successfully!');
    console.log('   They will be bundled with your app on build.');
  }
}

// Run the script
main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
