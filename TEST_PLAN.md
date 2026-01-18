# Test Plan - Phases 1 & 2

## Phase 1: Bible API Integration Testing

### Test 1.1: API Key Configuration (Biblia)

**Setup:**
1. Open the app
2. Click the "⚙️ More" button in the toolbar
3. Click "Bible Translations"
4. Navigate to the "NASB / ESV" tab

**Steps:**
1. ✅ Verify the Biblia API section is visible
2. ✅ Click "Sign In / Register at api.biblia.com" - should open registration page
3. ✅ Click "View API Key Documentation" - should open documentation
4. ✅ Enter a test API key (or real one if you have it)
5. ✅ Click "Save"
6. ✅ Verify green checkmark appears: "✓ Configured - NASB, ESV, NIV, NKJV available"
7. ✅ Refresh the page - API key should persist

**Expected Results:**
- API key is saved to IndexedDB
- Biblia translations appear in "Installed" tab
- Configuration persists after page refresh

---

### Test 1.2: API Key Configuration (ESV)

**Steps:**
1. ✅ In the "NASB / ESV" tab, scroll to ESV API section
2. ✅ Click "View ESV API Documentation" - should open ESV docs
3. ✅ Follow instructions to get an ESV API key
4. ✅ Enter the API key
5. ✅ Click "Save"
6. ✅ Verify green checkmark: "✓ Configured - ESV available"

**Expected Results:**
- ESV translation appears in "Installed" tab
- Can switch to ESV translation

---

### Test 1.3: Loading Bible Text from API

**Prerequisites:** API keys configured (Biblia or ESV)

**Steps:**
1. ✅ Go to "Installed" tab
2. ✅ Find NASB or ESV in the list
3. ✅ Click "Use" to switch to that translation
4. ✅ Navigate to a chapter (e.g., John 1)
5. ✅ Verify chapter loads and displays text
6. ✅ Check browser console for API calls
7. ✅ Navigate to another chapter
8. ✅ Navigate back to the first chapter

**Expected Results:**
- First load: API call is made, text is fetched
- Second load: Text loads instantly from cache (no API call)
- Text is properly formatted with verse numbers
- No errors in console

---

### Test 1.4: API Error Handling

**Steps:**
1. ✅ Switch to an API translation without API key configured
2. ✅ Verify error message or fallback behavior
3. ✅ Verify getBible translations work without API key

**Expected Results:**
- API translations show appropriate error if not configured
- getBible translations work without configuration
- No crashes or broken UI

---

### Test 1.5: Module Manager UI

**Steps:**
1. ✅ Open Module Manager
2. ✅ Verify tabs: "Installed", "NASB / ESV"
3. ✅ "Installed" tab shows API translations
4. ✅ API translations have "API" badge
5. ✅ Active translation shows "Active" badge
6. ✅ Can switch between translations

**Expected Results:**
- Clear visual distinction between different API providers
- Easy to see which translation is active
- Switching works smoothly

---

## Phase 2: Key Word System Testing

### Test 2.1: Create a Key Word

**Steps:**
1. ✅ Click "⚙️ More" in toolbar
2. ✅ Click "Key Words"
3. ✅ Click "+ New" button
4. ✅ Fill in the form:
   - Word: "God"
   - Variants: "God's, LORD, Lord"
   - Symbol: Triangle (▲)
   - Color: Purple
   - Category: Identity
   - Description: "References to God the Father"
   - Auto-suggest: checked
5. ✅ Click "Save"
6. ✅ Verify key word appears in the list
7. ✅ Verify it shows the symbol, color, and category

**Expected Results:**
- Key word is saved to IndexedDB
- Appears in the list immediately
- All fields are displayed correctly

---

### Test 2.2: Edit and Delete Key Word

**Steps:**
1. ✅ Find a key word in the list
2. ✅ Click "Edit"
3. ✅ Modify the description
4. ✅ Click "Save"
5. ✅ Verify changes are saved
6. ✅ Click "Delete"
7. ✅ Confirm deletion
8. ✅ Verify key word is removed

**Expected Results:**
- Edits persist
- Deletion works and removes from list
- No errors in console

---

### Test 2.3: Key Word Auto-Detection

**Prerequisites:** At least one key word created (e.g., "God")

**Steps:**
1. ✅ Navigate to a chapter with the word "God" (e.g., John 1:1)
2. ✅ Select the word "God" in the text
3. ✅ Verify selection indicator appears at bottom
4. ✅ Look for key word suggestion in the suggestions area
5. ✅ Verify suggestion shows:
   - Key word name
   - Symbol (if defined)
   - Color (if defined)
6. ✅ Click the suggestion
7. ✅ Verify annotation is applied with the key word's style

**Expected Results:**
- Key word is detected when selecting matching text
- Suggestion appears in toolbar
- Clicking suggestion applies the key word's style
- Usage count increments

---

### Test 2.4: Key Word Finder

**Prerequisites:** Key word "God" created and used at least once

**Steps:**
1. ✅ Open Key Word Manager
2. ✅ Find "God" in the list
3. ✅ Click on it (or add a "Find" button if needed)
4. ✅ Verify Key Word Finder opens
5. ✅ Try different search scopes:
   - "This Chapter"
   - "This Book"
   - "All Books"
6. ✅ Verify occurrences are listed
7. ✅ Verify each occurrence shows:
   - Book, chapter, verse reference
   - Context with highlighted word

**Expected Results:**
- Finder shows all occurrences
- Context is helpful (shows surrounding text)
- Search scope filtering works
- Results are accurate

---

### Test 2.5: Key Word Categories and Filtering

**Steps:**
1. ✅ Create key words in different categories:
   - Identity (God, Jesus)
   - Themes (love, faith)
   - Time (therefore, then)
2. ✅ Use category filter buttons
3. ✅ Verify only matching category shows
4. ✅ Use search box
5. ✅ Verify search filters correctly

**Expected Results:**
- Category filtering works
- Search works across word, variants, and description
- Results are sorted by usage count

---

### Test 2.6: Key Word Legend

**Steps:**
1. ✅ Create several key words
2. ✅ Find where Key Word Legend is displayed (if in ChapterView)
3. ✅ Verify legend shows:
   - All key words grouped by category
   - Symbols and colors
   - Usage counts

**Expected Results:**
- Legend is helpful for quick reference
- Organized by category
- Easy to scan

---

### Test 2.7: Preset Key Words

**Steps:**
1. ✅ Check if preset key words are loaded automatically
2. ✅ If not, verify they can be created easily
3. ✅ Verify presets include:
   - God (triangle, purple)
   - Jesus (cross, red)
   - Spirit (dove, sky)
   - Therefore (arrow, orange)

**Expected Results:**
- Preset key words are available or easy to create
- They follow Precept method conventions

---

## Integration Testing

### Test 3.1: Key Word with API Translation

**Steps:**
1. ✅ Configure API key (Biblia or ESV)
2. ✅ Switch to NASB or ESV
3. ✅ Create a key word
4. ✅ Select text in the API-loaded chapter
5. ✅ Verify key word detection works
6. ✅ Apply key word style
7. ✅ Verify annotation persists

**Expected Results:**
- Key words work with API translations
- Annotations are saved correctly
- No conflicts between API text and annotations

---

### Test 3.2: Multiple Key Words on Same Text

**Steps:**
1. ✅ Create multiple key words that could match the same text
2. ✅ Select text that matches multiple key words
3. ✅ Verify all matching suggestions appear
4. ✅ Apply one suggestion
5. ✅ Verify annotation is created

**Expected Results:**
- All matching key words are suggested
- Can choose which one to apply
- No conflicts

---

## Edge Cases & Error Handling

### Test 4.1: Invalid API Key

**Steps:**
1. ✅ Enter an invalid API key
2. ✅ Try to load a chapter
3. ✅ Verify error handling

**Expected Results:**
- Error message is user-friendly
- App doesn't crash
- Can still use getBible translations (no API key required)

---

### Test 4.2: Network Issues

**Steps:**
1. ✅ Disable network
2. ✅ Try to load API translation
3. ✅ Verify fallback to cache
4. ✅ Re-enable network
5. ✅ Verify API works again

**Expected Results:**
- Graceful handling of network errors
- Cached content is used when available
- App remains functional offline

---

### Test 4.3: Empty Key Word List

**Steps:**
1. ✅ Delete all key words
2. ✅ Verify empty state message
3. ✅ Verify "Create one to get started" message

**Expected Results:**
- Helpful empty state
- Easy to create first key word

---

## Performance Testing

### Test 5.1: Large Key Word List

**Steps:**
1. ✅ Create 20+ key words
2. ✅ Verify list performance
3. ✅ Test filtering and search
4. ✅ Verify no lag

**Expected Results:**
- Smooth scrolling
- Fast filtering
- No performance issues

---

### Test 5.2: Key Word Finder Performance

**Steps:**
1. ✅ Create a key word
2. ✅ Search "All Books"
3. ✅ Verify performance with many results

**Expected Results:**
- Results load reasonably fast
- UI remains responsive
- Can scroll through results smoothly

---

## Test Checklist Summary

### Phase 1: Bible API Integration
- [ ] API key configuration (Biblia)
- [ ] API key configuration (ESV)
- [ ] Loading text from API
- [ ] Caching behavior
- [ ] API error handling
- [ ] Module Manager UI

### Phase 2: Key Word System
- [ ] Create key word
- [ ] Edit key word
- [ ] Delete key word
- [ ] Auto-detection
- [ ] Key Word Finder
- [ ] Categories and filtering
- [ ] Key Word Legend
- [ ] Preset key words

### Integration
- [ ] Key words with API translations
- [ ] Multiple key words on same text

### Edge Cases
- [ ] Invalid API key handling
- [ ] Network issues
- [ ] Empty key word list

### Performance
- [ ] Large key word list
- [ ] Key Word Finder with many results

---

## Notes

- Test with real API keys if possible (free tiers are available)
- Test on both desktop and mobile viewports
- Check browser console for errors
- Verify IndexedDB data persistence
- Test after page refresh to ensure state persists
