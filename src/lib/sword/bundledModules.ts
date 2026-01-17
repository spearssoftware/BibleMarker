/**
 * Bundled SWORD Modules
 * 
 * Pre-bundled public domain Bible translations to avoid CORS issues.
 * These modules are included in the app bundle and installed automatically.
 */

import { db } from '@/lib/db';
import { parseModuleConf } from './confParser';
import JSZip from 'jszip';
import type { SwordModuleConfig } from '@/types/sword';

/**
 * Bundled module data - loaded from public/modules directory
 * Each module should be a SWORD module ZIP file
 */
const BUNDLED_MODULES = [
  {
    name: 'ASV',
    path: '/modules/ASV.zip',
    config: {
      name: 'ASV',
      dataPath: './modules/texts/rawcom/ASV/',
      modDrv: 'RawText',
      description: 'American Standard Version (1901)',
      about: 'The American Standard Version (ASV) of the Holy Bible is in the Public Domain.',
      distributionLicense: 'Public Domain',
      category: 'Biblical Texts',
      lang: 'en',
      encoding: 'UTF-8',
      sourceType: 'OSIS',
      raw: {},
    } as SwordModuleConfig,
  },
  {
    name: 'KJV',
    path: '/modules/KJV.zip',
    config: {
      name: 'KJV',
      dataPath: './modules/texts/rawcom/KJV/',
      modDrv: 'RawText',
      description: 'King James Version (1769)',
      about: 'King James Version (1769) with Strongs Numbers and Morphology and CatchWords.',
      distributionLicense: 'Public Domain',
      category: 'Biblical Texts',
      lang: 'en',
      encoding: 'UTF-8',
      sourceType: 'OSIS',
      raw: {},
    } as SwordModuleConfig,
  },
  {
    name: 'GodsWord',
    path: '/modules/GodsWord.zip',
    config: {
      name: 'GodsWord',
      dataPath: './modules/texts/rawcom/GodsWord/',
      modDrv: 'RawText',
      description: "GOD'S WORD to the Nations",
      about: "GOD'S WORD to the Nations Bible translation.",
      distributionLicense: 'Public Domain',
      category: 'Biblical Texts',
      lang: 'en',
      encoding: 'UTF-8',
      sourceType: 'OSIS',
      raw: {},
    } as SwordModuleConfig,
  },
];

/**
 * Install a bundled module from the public directory
 */
async function installBundledModule(
  moduleName: string,
  modulePath: string,
  defaultConfig: SwordModuleConfig,
  onProgress?: (progress: number) => void
): Promise<string> {
  try {
    // Check if already installed
    const existing = await db.modules.get(moduleName);
    if (existing && existing.status === 'installed') {
      return moduleName;
    }

    // Update status to installing
    await db.modules.put({
      id: moduleName,
      config: defaultConfig,
      status: 'installing',
      installedAt: new Date(),
      size: 0,
    });

    // Fetch the bundled ZIP file from public directory
    const response = await fetch(modulePath);
    if (!response.ok) {
      if (response.status === 404) {
        // Module file not found - skip this module (user hasn't added it yet)
        console.log(`Bundled module ${moduleName} not found at ${modulePath}, skipping`);
        await db.modules.update(moduleName, {
          status: 'not_installed',
        });
        return moduleName;
      }
      throw new Error(`Failed to load bundled module: ${response.statusText}`);
    }

    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();

    // Check if the response is actually a ZIP file (not HTML redirect)
    // ZIP files start with "PK" (PKZIP signature)
    const firstBytes = new Uint8Array(arrayBuffer.slice(0, 2));
    const isZipFile = firstBytes[0] === 0x50 && firstBytes[1] === 0x4B; // "PK"
    
    if (!isZipFile) {
      // Likely an HTML redirect page or invalid file
      const text = await blob.text();
      if (text.trim().startsWith('<')) {
        console.warn(
          `Bundled module ${moduleName} at ${modulePath} appears to be an HTML redirect, not a ZIP file. ` +
          `Please run 'pnpm download-modules' to download the actual module files, or download them manually ` +
          `from https://crosswire.org/sword/modules/ModDisp.jsp?modType=Bibles`
        );
        await db.modules.update(moduleName, {
          status: 'not_installed',
        });
        return moduleName;
      }
      throw new Error(`File at ${modulePath} is not a valid ZIP file`);
    }

    if (onProgress) {
      onProgress(50); // Midpoint
    }

    // Extract ZIP
    const zip = await JSZip.loadAsync(arrayBuffer);
    const config: SwordModuleConfig = { ...defaultConfig };

    const files: Array<{ path: string; data: ArrayBuffer }> = [];
    let confContent: string | null = null;
    const entries = Object.keys(zip.files);
    let processed = 0;

    for (const path of entries) {
      const file = zip.files[path];
      if (file.dir) continue;

      const data = await file.async('arraybuffer');

      // Look for .conf file
      if (path.endsWith('.conf')) {
        const text = await file.async('text');
        confContent = text;
        const parsedConfig = parseModuleConf(text, moduleName);
        Object.assign(config, parsedConfig);
      }

      files.push({ path, data });

      processed++;
      if (onProgress) {
        // Progress from 50% to 100%
        onProgress(50 + (processed / entries.length) * 50);
      }
    }

    if (!confContent) {
      // If no .conf file, use the default config
      console.warn(`No .conf file found in ${moduleName}, using default config`);
    }

    // Save module files to IndexedDB
    await db.moduleFiles.bulkPut(
      files.map(({ path, data }) => ({
        id: `${moduleName}:${path}`,
        moduleId: moduleName,
        path,
        data: new Uint8Array(data),
      }))
    );

    // Update module record
    await db.modules.update(moduleName, {
      config,
      status: 'installed',
      updatedAt: new Date(),
      size: arrayBuffer.byteLength,
    });

    if (onProgress) {
      onProgress(100);
    }

    return moduleName;
  } catch (error) {
    await db.modules.update(moduleName, {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Install all bundled modules
 * This should be called on app initialization
 */
export async function installBundledModules(
  onProgress?: (module: string, progress: number) => void
): Promise<void> {
  for (const module of BUNDLED_MODULES) {
    try {
      if (onProgress) {
        await installBundledModule(module.name, module.path, module.config, (p) => {
          onProgress(module.name, p);
        });
      } else {
        await installBundledModule(module.name, module.path, module.config);
      }
    } catch (error) {
      console.error(`Failed to install bundled module ${module.name}:`, error);
      // Continue with other modules even if one fails
    }
  }
}

/**
 * Get list of bundled modules
 */
export function getBundledModules() {
  return BUNDLED_MODULES.map(m => m.name);
}

/**
 * Check if a module is bundled
 */
export function isBundledModule(moduleName: string): boolean {
  return BUNDLED_MODULES.some(m => m.name === moduleName);
}
