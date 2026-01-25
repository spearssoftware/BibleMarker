# API.Bible Usage Calculation: 150k Requests/Month

## API.Bible Pro Plan Details

- **Monthly Requests**: 150,000 API calls
- **Cost**: $29/month base + $10/month per copyrighted translation (NASB, NIV, etc.)
- **Overage**: $1 per 1,000 additional calls
- **Daily Limit**: 5,000 queries/day (for free tier; Pro likely higher)
- **Verse Limit**: 500 consecutive verses per request

## What Counts as a Request?

Based on API.Bible documentation, each API endpoint call counts as **1 request**:
- `GET /bibles` - List available Bibles (1 request)
- `GET /bibles/{bibleId}/chapters/{chapterId}` - Get chapter (1 request)
- `GET /bibles/{bibleId}/verses/{verseId}` - Get single verse (1 request)
- `GET /bibles/{bibleId}/passages/{passageId}` - Get verse range (1 request)

**Important**: Your app caches chapters in IndexedDB, so:
- First load of a chapter = 1 API request
- Subsequent views of cached chapter = 0 API requests (served from cache)

## Your App's Request Pattern

### Per User Session (Typical)
1. **Initial Load**: 
   - Fetch translation list: ~1 request (cached for 24 hours)
   - Load current chapter: 1 request per translation (if not cached)
   
2. **Chapter Navigation**:
   - Each new chapter = 1 request per translation (if not cached)
   - Multi-translation view: Up to 3 translations = 3 requests per new chapter

3. **Other Operations**:
   - Verse overlay: Could fetch single verse (1 request) if not cached
   - Search: Could make search requests (varies)

### Caching Strategy
- **Chapter Cache**: Cached indefinitely in IndexedDB
- **Translation List Cache**: Cached for 24 hours
- **Cache Key**: `{translationId}:{book}:{chapter}`

## User Capacity Calculations

### Scenario 1: Light Users (Casual Reading)
**Assumptions**:
- 5 chapters per session
- 2 sessions per week = 8 sessions/month
- Single translation (not multi-translation view)
- 50% cache hit rate (user revisits some chapters)

**Per User**:
- New chapters per month: 5 chapters × 8 sessions × 50% = 20 requests/month
- Translation list: ~1 request/month (cached)
- **Total: ~21 requests/month per user**

**Capacity**: 150,000 ÷ 21 = **~7,143 users/month**

---

### Scenario 2: Moderate Users (Regular Study)
**Assumptions**:
- 10 chapters per session
- 3 sessions per week = 12 sessions/month
- Single translation
- 40% cache hit rate

**Per User**:
- New chapters: 10 × 12 × 60% = 72 requests/month
- Translation list: ~1 request/month
- **Total: ~73 requests/month per user**

**Capacity**: 150,000 ÷ 73 = **~2,055 users/month**

---

### Scenario 3: Heavy Users (Daily Study)
**Assumptions**:
- 15 chapters per session
- Daily use = 30 sessions/month
- Single translation
- 30% cache hit rate (reading through books sequentially)

**Per User**:
- New chapters: 15 × 30 × 70% = 315 requests/month
- Translation list: ~1 request/month
- **Total: ~316 requests/month per user**

**Capacity**: 150,000 ÷ 316 = **~475 users/month**

---

### Scenario 4: Multi-Translation Users (Side-by-Side)
**Assumptions**:
- 5 chapters per session
- 2 sessions per week = 8 sessions/month
- 3 translations in multi-translation view
- 50% cache hit rate

**Per User**:
- New chapters: 5 × 8 × 50% × 3 translations = 60 requests/month
- Translation lists: ~3 requests/month (one per translation)
- **Total: ~63 requests/month per user**

**Capacity**: 150,000 ÷ 63 = **~2,381 users/month**

---

### Scenario 5: Mixed User Base (Realistic)
**Assumptions**:
- 60% Light users (21 requests/month)
- 30% Moderate users (73 requests/month)
- 10% Heavy users (316 requests/month)

**Weighted Average**:
- (0.6 × 21) + (0.3 × 73) + (0.1 × 316) = 12.6 + 21.9 + 31.6 = **65.1 requests/user/month**

**Capacity**: 150,000 ÷ 65.1 = **~2,304 users/month**

---

## Additional Considerations

### Cache Effectiveness
Your app's caching significantly reduces API calls:
- **First-time users**: Higher request count (no cache)
- **Returning users**: Lower request count (cache hits)
- **Sequential reading**: Lower request count (reading through books)
- **Random access**: Higher request count (jumping around)

### Multi-Translation Impact
- Single translation: 1 request per new chapter
- 3 translations: 3 requests per new chapter
- **3x multiplier** for multi-translation users

### Translation List Requests
- Fetched once per day per translation
- Minimal impact (~1-3 requests/month per user)

### Search Requests
- If you implement search, each search = 1 request
- Could add 5-20 requests/month for active searchers

### Verse Overlay Requests
- Single verse fetch = 1 request
- Usually cached after first fetch
- Minimal impact

---

## Cost Analysis

### Base Cost
- **Pro Plan**: $29/month
- **NASB License**: +$10/month (if commercial)
- **Total Base**: $39/month

### Overage Costs
- $1 per 1,000 additional requests
- Example: 200,000 requests = $29 + $50 = $79/month

### Per-User Cost (Mixed Base)
- 2,304 users ÷ $39 = **$0.017 per user/month**
- Or **~$0.20 per user/year**

---

## Recommendations

### 1. Optimize Caching
- ✅ Already caching chapters (good!)
- Consider pre-caching popular chapters (Genesis 1, John 3, etc.)
- Cache translation lists longer (24 hours is good)

### 2. Monitor Usage
- Track API calls per user
- Identify heavy users
- Consider rate limiting per user if needed

### 3. User Behavior Optimization
- Encourage sequential reading (better cache hits)
- Show cache status to users
- Pre-load next chapter in background

### 4. Scaling Strategy
- **Start**: Monitor actual usage
- **At 80% capacity** (120k requests): Consider optimizations or upgrade
- **At 100% capacity**: 
  - Upgrade to Custom Plan
  - Or implement per-user rate limiting
  - Or optimize caching further

---

## Realistic Estimate

For a **Bible study app** with typical usage patterns:

**Conservative Estimate**: **~1,500-2,000 active users/month**
- Accounts for:
  - Mixed usage patterns
  - Some heavy users
  - Multi-translation usage
  - Cache misses
  - Growth buffer

**Optimistic Estimate**: **~2,500-3,000 active users/month**
- If most users are light/moderate
- Good cache hit rates
- Single translation usage

---

## Comparison with Current Setup

### Current APIs (Free/Cheap)
- **getBible**: Free, unlimited
- **ESV API**: Free, 5,000 requests/day
- **Biblia**: Free tier, 5,000 requests/day

### API.Bible Pro Plan
- **150,000 requests/month** = ~5,000 requests/day
- **Similar daily limit** to free APIs
- But **licensed for commercial use** with NASB

**Conclusion**: API.Bible gives you similar capacity to free APIs, but with legal licensing for NASB and commercial use rights.

---

## Next Steps

1. **Start with Pro Plan** ($29/month + $10 for NASB = $39/month)
2. **Monitor usage** for first 1-2 months
3. **Optimize caching** based on actual patterns
4. **Scale up** if needed (Custom Plan or optimizations)
