/**
 * SWORD Module .conf File Parser
 * 
 * Parses the INI-like configuration files that describe SWORD modules.
 * Format: https://crosswire.org/sword/develop/swordmodule/
 */

import type { 
  SwordModuleConfig, 
  ModuleDriver, 
  CompressionType, 
  BlockType, 
  SourceType,
  Encoding,
  ModuleCategory 
} from '@/types/sword';

/**
 * Parse a SWORD module .conf file
 */
export function parseModuleConf(confContent: string, moduleName?: string): SwordModuleConfig {
  const lines = confContent.split(/\r?\n/);
  const raw: Record<string, string> = {};
  let currentKey: string | null = null;
  let currentValue = '';
  let detectedName = moduleName || '';

  for (const line of lines) {
    // Section header like [ModuleName]
    if (line.startsWith('[') && line.endsWith(']')) {
      detectedName = line.slice(1, -1);
      continue;
    }

    // Skip empty lines and comments
    if (!line.trim() || line.startsWith('#')) {
      continue;
    }

    // Continuation of previous value (starts with whitespace or is a continuation)
    if (currentKey && (line.startsWith(' ') || line.startsWith('\t'))) {
      currentValue += '\n' + line.trim();
      continue;
    }

    // Save previous key-value if exists
    if (currentKey) {
      raw[currentKey] = currentValue;
    }

    // New key=value pair
    const eqIndex = line.indexOf('=');
    if (eqIndex > 0) {
      currentKey = line.slice(0, eqIndex).trim();
      currentValue = line.slice(eqIndex + 1).trim();
    }
  }

  // Save last key-value
  if (currentKey) {
    raw[currentKey] = currentValue;
  }

  // Build typed config from raw values
  return buildConfig(detectedName, raw);
}

/**
 * Build typed SwordModuleConfig from raw key-value pairs
 */
function buildConfig(name: string, raw: Record<string, string>): SwordModuleConfig {
  const config: SwordModuleConfig = {
    name,
    dataPath: raw['DataPath'] || '',
    modDrv: (raw['ModDrv'] as ModuleDriver) || 'zText',
    raw,
  };

  // Basic info
  if (raw['Description']) config.description = raw['Description'];
  if (raw['About']) config.about = cleanAboutText(raw['About']);
  if (raw['Version']) config.version = raw['Version'];
  if (raw['Lang']) config.lang = raw['Lang'];
  if (raw['Encoding']) config.encoding = raw['Encoding'] as Encoding;
  if (raw['SourceType']) config.sourceType = raw['SourceType'] as SourceType;

  // Compression
  if (raw['CompressType']) config.compressType = raw['CompressType'] as CompressionType;
  if (raw['BlockType']) config.blockType = raw['BlockType'] as BlockType;

  // Category
  if (raw['Category']) config.category = raw['Category'] as ModuleCategory;

  // Licensing
  if (raw['DistributionLicense']) config.distributionLicense = raw['DistributionLicense'];
  if (raw['Copyright']) config.copyright = raw['Copyright'];
  if (raw['CopyrightHolder']) config.copyrightHolder = raw['CopyrightHolder'];
  if (raw['CopyrightDate']) config.copyrightDate = raw['CopyrightDate'];
  if (raw['CopyrightNotes']) config.copyrightNotes = raw['CopyrightNotes'];
  if (raw['CopyrightContactName']) config.copyrightContactName = raw['CopyrightContactName'];
  if (raw['CopyrightContactEmail']) config.copyrightContactEmail = raw['CopyrightContactEmail'];
  if (raw['CopyrightContactAddress']) config.copyrightContactAddress = raw['CopyrightContactAddress'];
  if (raw['ShortPromo']) config.shortPromo = raw['ShortPromo'];

  // Features (can be multiple)
  const features: string[] = [];
  for (const key of Object.keys(raw)) {
    if (key === 'Feature' || key.startsWith('Feature')) {
      features.push(raw[key]);
    }
  }
  if (features.length > 0) config.feature = features;

  // Global option filters
  const filters: string[] = [];
  for (const key of Object.keys(raw)) {
    if (key === 'GlobalOptionFilter' || key.startsWith('GlobalOptionFilter')) {
      filters.push(raw[key]);
    }
  }
  if (filters.length > 0) config.globalOptionFilter = filters;

  // Versification
  if (raw['Versification']) config.versification = raw['Versification'];

  // Display
  if (raw['Direction']) config.direction = raw['Direction'] as 'LtoR' | 'RtoL' | 'BiDi';
  if (raw['Font']) config.font = raw['Font'];

  // Text identifiers
  if (raw['TextSource']) config.textSource = raw['TextSource'];
  if (raw['LCSH']) config.lcsh = raw['LCSH'];

  // Timestamps
  if (raw['InstallSize']) config.installSize = parseInt(raw['InstallSize'], 10);
  if (raw['SwordVersionDate']) config.sword_version_date = raw['SwordVersionDate'];

  // Lock info
  if (raw['CipherKey']) config.cipherKey = raw['CipherKey'];

  return config;
}

/**
 * Clean About text which often contains RTF-like formatting
 */
function cleanAboutText(about: string): string {
  return about
    // Replace RTF line breaks
    .replace(/\\par\s*/g, '\n')
    .replace(/\\pard\s*/g, '')
    // Replace escaped characters
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    // Remove RTF control words
    .replace(/\\[a-z]+\d*\s*/gi, '')
    // Clean up whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Serialize a module config back to .conf format
 */
export function serializeModuleConf(config: SwordModuleConfig): string {
  const lines: string[] = [];
  
  lines.push(`[${config.name}]`);
  lines.push(`DataPath=${config.dataPath}`);
  lines.push(`ModDrv=${config.modDrv}`);
  
  if (config.description) lines.push(`Description=${config.description}`);
  if (config.about) lines.push(`About=${config.about.replace(/\n/g, '\\par ')}`);
  if (config.version) lines.push(`Version=${config.version}`);
  if (config.lang) lines.push(`Lang=${config.lang}`);
  if (config.encoding) lines.push(`Encoding=${config.encoding}`);
  if (config.sourceType) lines.push(`SourceType=${config.sourceType}`);
  if (config.compressType) lines.push(`CompressType=${config.compressType}`);
  if (config.blockType) lines.push(`BlockType=${config.blockType}`);
  if (config.category) lines.push(`Category=${config.category}`);
  if (config.distributionLicense) lines.push(`DistributionLicense=${config.distributionLicense}`);
  if (config.copyright) lines.push(`Copyright=${config.copyright}`);
  if (config.versification) lines.push(`Versification=${config.versification}`);
  
  if (config.feature) {
    for (const f of config.feature) {
      lines.push(`Feature=${f}`);
    }
  }
  
  if (config.globalOptionFilter) {
    for (const f of config.globalOptionFilter) {
      lines.push(`GlobalOptionFilter=${f}`);
    }
  }
  
  return lines.join('\n');
}
