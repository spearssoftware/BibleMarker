/**
 * OSIS Markup Parser
 * 
 * Converts OSIS (Open Scripture Information Standard) XML markup to HTML.
 * OSIS is the most common markup format used in SWORD modules.
 * 
 * Reference: https://crosswire.org/osis/
 */

export interface ParsedVerse {
  text: string;       // Plain text (stripped of markup)
  html: string;       // Rendered HTML
  footnotes: Footnote[];
  crossRefs: CrossRef[];
  strongs: StrongsRef[];
}

export interface Footnote {
  marker: string;
  content: string;
}

export interface CrossRef {
  refs: string[];     // OSIS references
}

export interface StrongsRef {
  word: string;
  number: string;     // e.g., "G2316" or "H430"
}

/**
 * Parse OSIS markup and convert to HTML
 */
export function parseOsis(osisText: string): ParsedVerse {
  const footnotes: Footnote[] = [];
  const crossRefs: CrossRef[] = [];
  const strongs: StrongsRef[] = [];
  
  let html = osisText;
  let text = osisText;
  
  // Process <w> elements (words with Strong's numbers, morphology)
  html = html.replace(
    /<w\s+([^>]*)>([^<]*)<\/w>/gi,
    (match, attrs, word) => {
      const lemmaMatch = attrs.match(/lemma="([^"]*)"/);
      const morphMatch = attrs.match(/morph="([^"]*)"/);
      
      if (lemmaMatch) {
        // Extract Strong's numbers (format: "strong:G2316" or "strong:H430")
        const strongsNums = lemmaMatch[1]
          .split(/\s+/)
          .filter((s: string) => s.startsWith('strong:'))
          .map((s: string) => s.replace('strong:', ''));
        
        if (strongsNums.length > 0) {
          strongs.push({ word, number: strongsNums[0] });
          return `<span class="strongs" data-strongs="${strongsNums.join(',')}" data-morph="${morphMatch?.[1] || ''}">${word}</span>`;
        }
      }
      
      return word;
    }
  );
  
  // Process <note> elements (footnotes and cross-references)
  html = html.replace(
    /<note\s+([^>]*)>([\s\S]*?)<\/note>/gi,
    (match, attrs, content) => {
      const typeMatch = attrs.match(/type="([^"]*)"/);
      const type = typeMatch?.[1] || 'footnote';
      
      if (type === 'crossReference') {
        // Extract references from content
        const refs: string[] = [];
        content.replace(/<reference\s+osisRef="([^"]*)"[^>]*>/gi, (_m: string, ref: string) => {
          refs.push(ref);
          return '';
        });
        crossRefs.push({ refs });
        return `<sup class="cross-ref" data-refs="${refs.join(',')}">†</sup>`;
      } else {
        // Regular footnote
        const marker = String.fromCharCode(97 + footnotes.length); // a, b, c...
        footnotes.push({ marker, content: stripTags(content) });
        return `<sup class="footnote" data-marker="${marker}">${marker}</sup>`;
      }
    }
  );
  
  // Process <q> elements (quotations, including words of Jesus)
  html = html.replace(
    /<q\s+([^>]*)>([\s\S]*?)<\/q>/gi,
    (match, attrs, content) => {
      const whoMatch = attrs.match(/who="([^"]*)"/);
      if (whoMatch?.[1] === 'Jesus') {
        return `<span class="words-of-jesus">${content}</span>`;
      }
      return `<q>${content}</q>`;
    }
  );
  
  // Process <transChange> elements (translator additions)
  html = html.replace(
    /<transChange\s+[^>]*>([\s\S]*?)<\/transChange>/gi,
    '<span class="trans-change">$1</span>'
  );
  
  // Process <divineName> elements
  html = html.replace(
    /<divineName\s*[^>]*>([\s\S]*?)<\/divineName>/gi,
    '<span class="divine-name">$1</span>'
  );
  
  // Process <title> elements (section headings in the source)
  html = html.replace(
    /<title\s*[^>]*>([\s\S]*?)<\/title>/gi,
    '<h4 class="section-title">$1</h4>'
  );
  
  // Process <lg> and <l> elements (poetry)
  html = html.replace(/<lg\s*[^>]*>/gi, '<div class="poetry">');
  html = html.replace(/<\/lg>/gi, '</div>');
  html = html.replace(/<l\s*[^>]*>/gi, '<div class="poetry-line">');
  html = html.replace(/<\/l>/gi, '</div>');
  
  // Process <milestone> elements (paragraph markers, etc.)
  html = html.replace(/<milestone\s+[^>]*type="x-p"[^>]*\/?>/gi, '<br class="paragraph-break">');
  
  // Process <lb/> line breaks
  html = html.replace(/<lb\s*\/?>/gi, '<br>');
  
  // Remove remaining XML tags for plain text
  text = stripTags(osisText);
  
  // Clean up any remaining unhandled tags in HTML
  html = html.replace(/<[^>]+>/g, (tag) => {
    // Keep our generated HTML tags
    if (tag.startsWith('<span') || tag.startsWith('</span') ||
        tag.startsWith('<sup') || tag.startsWith('</sup') ||
        tag.startsWith('<q') || tag.startsWith('</q') ||
        tag.startsWith('<h4') || tag.startsWith('</h4') ||
        tag.startsWith('<div') || tag.startsWith('</div') ||
        tag.startsWith('<br')) {
      return tag;
    }
    return '';
  });
  
  return { text, html, footnotes, crossRefs, strongs };
}

/**
 * Strip all XML/HTML tags from text
 */
function stripTags(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse ThML markup (older format, still used in some modules)
 */
export function parseThml(thmlText: string): ParsedVerse {
  let html = thmlText;
  let text = thmlText;
  const footnotes: Footnote[] = [];
  const crossRefs: CrossRef[] = [];
  const strongs: StrongsRef[] = [];
  
  // Process <sync> elements (Strong's numbers in ThML)
  html = html.replace(
    /<sync\s+type="Strongs"\s+value="([^"]*)"[^>]*>/gi,
    (match, value) => {
      return `<sup class="strongs-inline">${value}</sup>`;
    }
  );
  
  // Process <note> elements
  html = html.replace(
    /<note[^>]*>([\s\S]*?)<\/note>/gi,
    (match, content) => {
      const marker = String.fromCharCode(97 + footnotes.length);
      footnotes.push({ marker, content: stripTags(content) });
      return `<sup class="footnote" data-marker="${marker}">${marker}</sup>`;
    }
  );
  
  // Process <scripRef> elements
  html = html.replace(
    /<scripRef[^>]*>([\s\S]*?)<\/scripRef>/gi,
    '<span class="scripture-ref">$1</span>'
  );
  
  // Process <added> elements (translator additions)
  html = html.replace(
    /<added[^>]*>([\s\S]*?)<\/added>/gi,
    '<span class="trans-change">$1</span>'
  );
  
  text = stripTags(thmlText);
  
  return { text, html, footnotes, crossRefs, strongs };
}

/**
 * Parse GBF markup (older format)
 */
export function parseGbf(gbfText: string): ParsedVerse {
  let html = gbfText;
  let text = gbfText;
  
  // GBF uses different notation
  // <RF>footnote<Rf> - footnotes
  // <FI>italic<Fi> - italics
  // <FB>bold<Fb> - bold
  // <WH1234> - Hebrew Strong's
  // <WG1234> - Greek Strong's
  
  html = html.replace(/<RF>([\s\S]*?)<Rf>/gi, '<sup class="footnote">*</sup>');
  html = html.replace(/<FI>([\s\S]*?)<Fi>/gi, '<em>$1</em>');
  html = html.replace(/<FB>([\s\S]*?)<Fb>/gi, '<strong>$1</strong>');
  html = html.replace(/<W([HG])(\d+)>/gi, '<sup class="strongs-inline">$1$2</sup>');
  
  text = gbfText
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  return { 
    text, 
    html, 
    footnotes: [], 
    crossRefs: [], 
    strongs: [] 
  };
}

/**
 * Auto-detect markup format and parse accordingly
 */
export function parseVerseMarkup(text: string, sourceType?: string): ParsedVerse {
  if (sourceType === 'ThML' || text.includes('<sync')) {
    return parseThml(text);
  }
  
  if (sourceType === 'GBF' || text.includes('<RF>') || text.includes('<WH')) {
    return parseGbf(text);
  }
  
  // Default to OSIS
  return parseOsis(text);
}
