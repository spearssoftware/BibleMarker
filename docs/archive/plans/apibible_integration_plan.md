# API.Bible Integration Plan

## Overview

Integrate API.Bible (American Bible Society) as a new Bible API provider to enable access to NASB and other licensed translations. API.Bible provides legally licensed access to over 1,500 Bible versions, including NASB, NIV, and many others.

## API.Bible Details

### Base Information
- **Base URL**: `https://api.scripture.api.bible/v1`
- **Authentication**: API key in `api-key` header (not Authorization header)
- **Documentation**: https://docs.api.bible/
- **Pricing**: 
  - Free tier: Public domain versions only
  - Pro Plan ($29+/month): NASB, NIV, NLT, CSB, and other copyrighted versions
- **Rate Limits**:
  - Free: 5,000 queries/day, 500 consecutive verses per request
  - Pro: Higher limits (check current docs)

### Key Endpoints

1. **List Bibles**: `GET /bibles`
   - Returns all Bibles available for the API key
   - Can filter by language, abbreviation, name

2. **Get Bible Info**: `GET /bibles/{bibleId}`
   - Returns metadata about a specific Bible

3. **List Books**: `GET /bibles/{bibleId}/books`
   - Returns all books in a Bible

4. **Get Book**: `GET /bibles/{bibleId}/books/{bookId}`
   - Returns metadata about a specific book

5. **List Chapters**: `GET /bibles/{bibleId}/books/{bookId}/chapters`
   - Returns all chapters in a book

6. **Get Chapter**: `GET /bibles/{bibleId}/chapters/{chapterId}`
   - Returns chapter content (text included)
   - Chapter ID format: `{BOOK}.{CHAPTER}` (e.g., `JHN.3`)

7. **List Verses**: `GET /bibles/{bibleId}/chapters/{chapterId}/verses`
   - Returns all verses in a chapter

8. **Get Verse**: `GET /bibles/{bibleId}/verses/{verseId}`
   - Returns verse content
   - Verse ID format: `{BOOK}.{CHAPTER}.{VERSE}` (e.g., `JHN.3.16`)

9. **Get Passage**: `GET /bibles/{bibleId}/passages/{passageId}`
   - Returns a range of verses
   - Passage ID format: `{BOOK}.{CHAPTER}.{START}-{BOOK}.{CHAPTER}.{END}` (e.g., `MAT.1.12-MAT.1.20`)

### ID Format
- Uses dot notation: `BOOK.CHAPTER.VERSE`
- Book IDs are typically 3-4 letter abbreviations (e.g., `GEN`, `MAT`, `JHN`, `1CO`)
- Need to map OSIS book IDs to API.Bible book IDs

### Response Format
- JSON responses wrapped in `data` object
- Includes `meta` object with FUMS (Fair Use Management System) information
- FUMS requires JavaScript snippet to be included for copyright compliance

### Copyright Compliance
- Must include FUMS JavaScript snippet when displaying text
- Must display copyright notices
- Each Bible has its own copyright requirements

---

## Implementation Steps

### Phase 1: Core API Client Implementation

#### Step 1.1: Update Type Definitions
**File**: `src/lib/bible-api/types.ts`

- Add `'apibible'` to `BibleApiProvider` type
- Update `ApiConfigRecord` in `src/lib/db.ts` to include `'apibible'`

**Changes**:
```typescript
export type BibleApiProvider = 'biblia' | 'esv' | 'getbible' | 'biblegateway' | 'apibible';
```

#### Step 1.2: Create API.Bible Client
**File**: `src/lib/bible-api/apibible.ts` (new file)

**Structure** (following ESV client pattern):
```typescript
export class ApiBibleClient implements BibleApiClient {
  readonly provider: BibleApiProvider = 'apibible';
  private apiKey: string | null = null;
  private baseUrl = 'https://api.scripture.api.bible/v1';
  
  // Implement all required methods:
  // - isConfigured()
  // - configure()
  // - getTranslations()
  // - getChapter()
  // - getVerse()
  // - getVerseRange()
  // - search() (optional)
}
```

**Key Implementation Details**:

1. **Authentication**:
   - Use `api-key` header (not Authorization)
   - Format: `headers: { 'api-key': this.apiKey }`

2. **Book ID Mapping**:
   - Create mapping from OSIS book IDs to API.Bible book IDs
   - API.Bible uses formats like: `GEN`, `EXO`, `LEV`, `NUM`, `DEU`, `JOS`, `JDG`, `RUT`, `1SA`, `2SA`, `1KI`, `2KI`, `1CH`, `2CH`, `EZR`, `NEH`, `EST`, `JOB`, `PSA`, `PRO`, `ECC`, `SNG`, `ISA`, `JER`, `LAM`, `EZK`, `DAN`, `HOS`, `JOL`, `AMO`, `OBA`, `JON`, `MIC`, `NAM`, `HAB`, `ZEP`, `HAG`, `ZEC`, `MAL`, `MAT`, `MRK`, `LUK`, `JHN`, `ACT`, `ROM`, `1CO`, `2CO`, `GAL`, `EPH`, `PHP`, `COL`, `1TH`, `2TH`, `1TI`, `2TI`, `TIT`, `PHM`, `HEB`, `JAS`, `1PE`, `2PE`, `1JN`, `2JN`, `3JN`, `JUD`, `REV`

3. **Chapter ID Format**:
   - Convert `{book}` and `{chapter}` to `{BOOK}.{chapter}`
   - Example: `John` + `3` → `JHN.3`

4. **Verse Parsing**:
   - API returns structured JSON with verse data
   - Extract `content` field from each verse
   - Handle HTML content if present

5. **Translation List**:
   - Fetch from `/bibles` endpoint
   - Map to `ApiTranslation` format
   - Cache results (similar to getBible client)

6. **Error Handling**:
   - Handle 401 (invalid API key)
   - Handle 403 (Bible not available with this key)
   - Handle 404 (resource not found)
   - Handle rate limiting (429)

7. **Rate Limiting**:
   - Track requests per day (similar to ESV client)
   - Store in IndexedDB: `db.apibibleRateLimit`
   - Check before making requests

#### Step 1.3: Book ID Mapping Function
Create mapping from OSIS to API.Bible format:

```typescript
const OSIS_TO_APIBIBLE: Record<string, string> = {
  'Gen': 'GEN',
  'Exod': 'EXO',
  'Lev': 'LEV',
  'Num': 'NUM',
  'Deut': 'DEU',
  'Josh': 'JOS',
  'Judg': 'JDG',
  'Ruth': 'RUT',
  '1Sam': '1SA',
  '2Sam': '2SA',
  '1Kgs': '1KI',
  '2Kgs': '2KI',
  '1Chr': '1CH',
  '2Chr': '2CH',
  'Ezra': 'EZR',
  'Neh': 'NEH',
  'Esth': 'EST',
  'Job': 'JOB',
  'Ps': 'PSA',
  'Prov': 'PRO',
  'Eccl': 'ECC',
  'Song': 'SNG',
  'Isa': 'ISA',
  'Jer': 'JER',
  'Lam': 'LAM',
  'Ezek': 'EZK',
  'Dan': 'DAN',
  'Hos': 'HOS',
  'Joel': 'JOL',
  'Amos': 'AMO',
  'Obad': 'OBA',
  'Jonah': 'JON',
  'Mic': 'MIC',
  'Nah': 'NAM',
  'Hab': 'HAB',
  'Zeph': 'ZEP',
  'Hag': 'HAG',
  'Zech': 'ZEC',
  'Mal': 'MAL',
  'Matt': 'MAT',
  'Mark': 'MRK',
  'Luke': 'LUK',
  'John': 'JHN',
  'Acts': 'ACT',
  'Rom': 'ROM',
  '1Cor': '1CO',
  '2Cor': '2CO',
  'Gal': 'GAL',
  'Eph': 'EPH',
  'Phil': 'PHP',
  'Col': 'COL',
  '1Thess': '1TH',
  '2Thess': '2TH',
  '1Tim': '1TI',
  '2Tim': '2TI',
  'Titus': 'TIT',
  'Phlm': 'PHM',
  'Heb': 'HEB',
  'Jas': 'JAS',
  '1Pet': '1PE',
  '2Pet': '2PE',
  '1John': '1JN',
  '2John': '2JN',
  '3John': '3JN',
  'Jude': 'JUD',
  'Rev': 'REV',
};
```

---

### Phase 2: Database Schema Updates

#### Step 2.1: Add Rate Limiting Table
**File**: `src/lib/db.ts`

Add new table for API.Bible rate limiting (similar to ESV):

```typescript
apibibleRateLimit!: EntityTable<{ id: string; requestTimestamps: number[] }, 'id'>;
```

In schema version:
```typescript
apibibleRateLimit: 'id',
```

#### Step 2.2: Update ApiConfigRecord Type
**File**: `src/lib/db.ts`

Update `ApiConfigRecord` interface:
```typescript
export interface ApiConfigRecord {
  provider: 'biblia' | 'esv' | 'getbible' | 'biblegateway' | 'apibible';
  // ... rest of fields
}
```

---

### Phase 3: Integration with Main API Module

#### Step 3.1: Register Client
**File**: `src/lib/bible-api/index.ts`

1. Import the new client:
```typescript
import { apiBibleClient } from './apibible';
```

2. Add to clients object:
```typescript
const clients: Record<BibleApiProvider, BibleApiClient | null> = {
  biblia: bibliaClient,
  biblegateway: bibleGatewayClient,
  esv: esvClient,
  getbible: getBibleClient,
  apibible: apiBibleClient,
};
```

3. Export the client:
```typescript
export { apiBibleClient } from './apibible';
```

#### Step 3.2: Update fetchChapter Logic
**File**: `src/lib/bible-api/index.ts`

Add API.Bible to the priority chain in `fetchChapter()`:

```typescript
// After checking cache, before getBible:
// Check API.Bible (if configured and translation matches)
if (!chapterData && (provider === 'apibible' || (!provider && apiBibleClient.isConfigured()))) {
  if (apiBibleClient.isConfigured()) {
    try {
      chapterData = await retryWithBackoff(
        () => apiBibleClient.getChapter(actualTranslationId, book, chapter),
        { maxRetries: 2, initialDelay: 1000 }
      );
    } catch (error) {
      // Handle errors
    }
  }
}
```

#### Step 3.3: Update Search Logic
**File**: `src/lib/bible-api/index.ts`

Add API.Bible to search function if search is implemented.

---

### Phase 4: UI Integration

#### Step 4.1: Update Module Manager
**File**: `src/components/MarkingToolbar/ModuleManager.tsx`

1. Add API.Bible to provider list:
```typescript
const translationsByProvider = useMemo(() => {
  const grouped: Record<BibleApiProvider, ApiTranslation[]> = {
    getbible: [],
    biblia: [],
    biblegateway: [],
    esv: [],
    apibible: [], // Add this
  };
  // ... rest of logic
}, [apiTranslations]);
```

2. Add API.Bible configuration section (similar to ESV/Biblia):
   - API key input field
   - Save/Update button
   - Status indicator (Configured/API Key Required)
   - Link to API.Bible documentation/registration

3. Add state management:
```typescript
const [apibibleApiKey, setApibibleApiKey] = useState('');
```

4. Add load/save functions:
```typescript
// In loadApiConfigs()
const apibibleConfig = prefs.apiConfigs.find(c => c.provider === 'apibible');
if (apibibleConfig?.apiKey) setApibibleApiKey(apibibleConfig.apiKey);

// In saveApiConfig()
if (provider === 'apibible') {
  await saveApiConfig({
    provider: 'apibible',
    apiKey: apiKeyOrCreds as string,
    enabled: true,
  });
}
```

#### Step 4.2: Update Settings Panel
**File**: `src/components/Settings/SettingsPanel.tsx`

Add API.Bible section similar to other providers:
- API key input
- Status indicator
- Documentation link
- Description mentioning NASB availability

#### Step 4.3: Update About Section
**File**: `src/components/Settings/AboutSection.tsx`

Add API.Bible to the list of supported APIs with description.

---

### Phase 5: FUMS (Fair Use Management System) Integration

#### Step 5.1: Add FUMS Script
**File**: `index.html` or component

API.Bible requires FUMS JavaScript to be included when displaying their text. This tracks usage for copyright compliance.

1. Add script tag to `index.html`:
```html
<script src="https://api.scripture.api.bible/fums.js" defer></script>
```

2. Or dynamically load when API.Bible text is displayed

3. Include FUMS ID in requests (from API response `meta.fums`)

**Note**: Check API.Bible documentation for current FUMS requirements - they may have changed.

---

### Phase 6: CORS and Proxy Configuration

#### Step 6.1: Check CORS Support
API.Bible should support CORS, but verify. If not, add Vite proxy:

**File**: `vite.config.ts`

```typescript
proxy: {
  // ... existing proxies
  '/api/apibible': {
    target: 'https://api.scripture.api.bible',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/apibible/, '/v1'),
  },
}
```

Update client to use proxy in development:
```typescript
const APIBIBLE_BASE_URL = import.meta.env.DEV 
  ? '/api/apibible' 
  : 'https://api.scripture.api.bible/v1';
```

---

### Phase 7: Testing

#### Step 7.1: Unit Tests
Create test file: `src/lib/bible-api/__tests__/apibible.test.ts`

Test cases:
- Configuration (isConfigured, configure)
- Book ID mapping
- Translation list fetching
- Chapter fetching
- Verse fetching
- Verse range fetching
- Error handling (401, 403, 404, 429)
- Rate limiting

#### Step 7.2: Integration Tests
- Test with real API key (use test/development key)
- Verify NASB is available
- Test chapter fetching for various books
- Test error scenarios

#### Step 7.3: Manual Testing Checklist
- [ ] API key configuration works
- [ ] Translation list loads correctly
- [ ] NASB appears in translation selector
- [ ] Chapter fetching works for NASB
- [ ] Verse fetching works
- [ ] Multi-translation view works with API.Bible translations
- [ ] Copyright notices display correctly
- [ ] Rate limiting works
- [ ] Error messages are helpful
- [ ] Offline/caching works

---

### Phase 8: Documentation Updates

#### Step 8.1: Update Roadmap
**File**: `docs/plans/bible_study_app_roadmap_9b6b0525.plan.md`

Add API.Bible to supported APIs list.

#### Step 8.2: Add User Documentation
- How to get API.Bible API key
- How to configure in Module Manager
- Pricing information
- Which translations are available

---

## Implementation Order

1. **Phase 1**: Core API client (Steps 1.1-1.3)
2. **Phase 2**: Database updates (Steps 2.1-2.2)
3. **Phase 3**: Main API integration (Steps 3.1-3.3)
4. **Phase 6**: CORS/Proxy setup (if needed)
5. **Phase 4**: UI integration (Steps 4.1-4.3)
6. **Phase 5**: FUMS integration
7. **Phase 7**: Testing
8. **Phase 8**: Documentation

---

## Key Considerations

### Rate Limiting
- Implement rate limiting similar to ESV client
- Track requests per day in IndexedDB
- Show helpful error messages when limits are exceeded

### Copyright Compliance
- Display copyright notices from API responses
- Include FUMS JavaScript as required
- Respect usage limits (500 consecutive verses)

### Error Handling
- Clear error messages for common issues:
  - Invalid API key (401)
  - Bible not available with key (403) - suggest upgrading to Pro plan
  - Rate limit exceeded (429)
  - Network errors

### Translation ID Mapping
- API.Bible uses Bible IDs (e.g., `de4e12af7f72f504-01` for NASB)
- Need to map user-friendly IDs (like "NASB") to API.Bible IDs
- Store mapping in translation cache or fetch dynamically

### Caching
- Cache translation lists (24 hours, similar to getBible)
- Cache chapters in existing `chapterCache` table
- Use same cache key format: `{translationId}:{book}:{chapter}`

### Book ID Format
- API.Bible uses specific book ID format (3-4 letter codes)
- Need robust mapping from OSIS to API.Bible format
- Handle edge cases (1-2 Samuel, 1-2 Kings, etc.)

---

## Estimated Effort

- **Phase 1**: 4-6 hours (core client implementation)
- **Phase 2**: 30 minutes (database updates)
- **Phase 3**: 1-2 hours (integration)
- **Phase 4**: 2-3 hours (UI updates)
- **Phase 5**: 1 hour (FUMS)
- **Phase 6**: 30 minutes (proxy if needed)
- **Phase 7**: 2-3 hours (testing)
- **Phase 8**: 1 hour (documentation)

**Total**: ~12-17 hours

---

## Future Enhancements

1. **Search Support**: Implement search endpoint if available
2. **Audio Support**: API.Bible may provide audio - explore integration
3. **Reading Plans**: If API.Bible offers reading plans, integrate
4. **Verse of the Day**: Use API.Bible for verse of the day feature

---

## Notes

- API.Bible Pro Plan is required for NASB ($29+/month)
- Free tier only includes public domain versions
- Consider adding a note in UI about pricing requirements
- May want to allow users to test with free tier first
- Check current API.Bible documentation for any changes to endpoints or requirements
