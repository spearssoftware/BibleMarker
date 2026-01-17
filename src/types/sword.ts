/**
 * SWORD Module Types
 * Based on the SWORD Project module specification
 * https://crosswire.org/sword/develop/swordmodule/
 */

/** Module categories */
export type ModuleCategory = 
  | 'Biblical Texts'
  | 'Commentaries'
  | 'Lexicons / Dictionaries'
  | 'Generic Books'
  | 'Daily Devotional'
  | 'Glossaries'
  | 'Cults / Unorthodox'
  | 'Essays'
  | 'Maps'
  | 'Images';

/** Module driver types - determines how to read the module data */
export type ModuleDriver = 
  | 'RawText'      // Uncompressed Bible text
  | 'zText'        // Compressed Bible text (most common)
  | 'RawCom'       // Uncompressed commentary
  | 'zCom'         // Compressed commentary
  | 'RawLD'        // Uncompressed lexicon/dictionary
  | 'zLD'          // Compressed lexicon/dictionary
  | 'RawGenBook'   // Uncompressed generic book
  | 'RawFiles';    // Raw file collection

/** Compression types */
export type CompressionType = 'ZIP' | 'LZSS' | 'BZIP2' | 'XZ' | 'none';

/** Block types for compressed modules */
export type BlockType = 'BOOK' | 'CHAPTER' | 'VERSE';

/** Source markup type */
export type SourceType = 'OSIS' | 'ThML' | 'GBF' | 'TEI' | 'Plain';

/** Encoding */
export type Encoding = 'UTF-8' | 'Latin-1';

/** Distribution license types */
export type DistributionLicense = 
  | 'Public Domain'
  | 'Copyrighted'
  | 'Copyrighted; Free non-commercial distribution'
  | 'Copyrighted; Permission to distribute granted to CrossWire'
  | 'Creative Commons'
  | 'GFDL'
  | 'GPL'
  | string; // Other custom licenses

/** Module configuration from .conf file */
export interface SwordModuleConfig {
  // Required fields
  name: string;              // Module name (from filename/section header)
  dataPath: string;          // Path to module data relative to module root
  modDrv: ModuleDriver;      // Module driver type
  
  // Common fields
  description?: string;
  about?: string;            // Longer description, may contain RTF
  version?: string;
  lang?: string;             // ISO language code (e.g., 'en', 'grc', 'hbo')
  encoding?: Encoding;
  sourceType?: SourceType;
  
  // Compression settings
  compressType?: CompressionType;
  blockType?: BlockType;
  
  // Categorization
  category?: ModuleCategory;
  
  // Licensing
  distributionLicense?: DistributionLicense;
  copyright?: string;
  copyrightHolder?: string;
  copyrightDate?: string;
  copyrightNotes?: string;
  copyrightContactName?: string;
  copyrightContactEmail?: string;
  copyrightContactAddress?: string;
  shortPromo?: string;
  
  // Features
  feature?: string[];        // e.g., 'StrongsNumbers', 'GreekDef', 'HebrewDef'
  globalOptionFilter?: string[]; // e.g., 'OSISStrongs', 'OSISMorph', 'OSISFootnotes'
  
  // Versification
  versification?: string;    // e.g., 'KJV', 'NRSV', 'Vulgate', 'Luther'
  
  // Display
  direction?: 'LtoR' | 'RtoL' | 'BiDi';
  font?: string;
  
  // Text identifiers
  textSource?: string;
  lcsh?: string;             // Library of Congress Subject Heading
  
  // Timestamps
  installSize?: number;
  sword_version_date?: string;
  
  // Lock info (for encrypted modules)
  cipherKey?: string;
  
  // Raw config for any other fields
  raw: Record<string, string>;
}

/** Parsed verse reference */
export interface VerseRef {
  book: string;
  chapter: number;
  verse: number;
}

/** Verse range */
export interface VerseRange {
  start: VerseRef;
  end: VerseRef;
}

/** A single verse of text */
export interface Verse {
  ref: VerseRef;
  text: string;           // Raw text with OSIS/ThML markup
  html?: string;          // Rendered HTML
}

/** A chapter of verses */
export interface Chapter {
  book: string;
  chapter: number;
  verses: Verse[];
}

/** Module installation status */
export type ModuleStatus = 
  | 'not_installed'
  | 'downloading'
  | 'installing'
  | 'installed'
  | 'update_available'
  | 'error';

/** Installed module metadata */
export interface InstalledModule {
  config: SwordModuleConfig;
  status: ModuleStatus;
  installedAt: Date;
  updatedAt?: Date;
  size: number;            // Size in bytes
  error?: string;
}

/** Remote module info from repository */
export interface RemoteModule {
  name: string;
  config: SwordModuleConfig;
  size: number;
  downloadUrl: string;
}

/** Module repository */
export interface ModuleRepository {
  name: string;
  url: string;
  description?: string;
  lastUpdated?: Date;
  modules: RemoteModule[];
}
