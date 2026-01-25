# Bible API Services Comparison: Alternatives to API.Bible

## Overview

This document compares Bible API services that provide access to paid/copyrighted translations like NASB, NIV, and others. Focus is on services that can replace or supplement API.Bible for commercial use.

---

## 1. YouVersion Platform ⭐ (Most Promising)

**Website**: https://platform.youversion.com/  
**Provider**: Life.Church Operations, LLC  
**Status**: Open Beta

### Available Translations
- **NASB**: ✅ Available (via fast-track licensing)
- **NIV**: ✅ Available (via fast-track licensing)
- **NLT, ESV, CSB, NKJV**: ✅ Available
- **2,000+ translations** in multiple languages

### Pricing
- **Free tier**: Available (with restrictions)
- **Commercial**: Fast-track licensing available
- **Pricing**: Not publicly disclosed (contact for quote)

### Terms & Restrictions
- ✅ **No controversial use restrictions** found in public docs
- ✅ **No theological position requirements** found
- ⚠️ Terms of Use restrict to "personal, non-commercial use" for general users
- ✅ **Developer Platform** allows commercial integration
- ⚠️ Must register application and get App Key
- ✅ Fast-track licensing removes need for individual publisher negotiations

### API Features
- REST API available
- SDKs: JavaScript, Swift, React, Flutter
- "Sign in with YouVersion" integration
- User analytics
- Bible reader embedding

### Pros
- ✅ Large translation library
- ✅ Fast-track licensing (no individual publisher negotiations)
- ✅ Modern developer tools (SDKs)
- ✅ No controversial use restrictions found
- ✅ Established platform (Bible.com/YouVersion)

### Cons
- ⚠️ Terms of Use mention non-commercial restrictions (but developer platform may differ)
- ⚠️ Pricing not publicly disclosed
- ⚠️ Need to contact for commercial terms
- ⚠️ Still in beta

### Recommendation
**⭐ HIGH PRIORITY** - Contact YouVersion Platform to get:
1. Commercial licensing terms
2. Pricing structure
3. Full Terms of Service for developers
4. NASB/NIV availability confirmation

---

## 2. Bible Gateway API

**Website**: https://www.biblegateway.com/api/documentation  
**Provider**: Zondervan (HarperCollins Christian Publishing)  
**Status**: Available (but disabled in your codebase)

### Available Translations
- **NASB**: ✅ Listed in API docs
- **NIV**: ✅ Listed in API docs
- **ESV, NLT, NKJV**: ✅ Available
- **240+ translations** in 78 languages

### Pricing
- **Free**: Requires BibleGateway account (free to create)
- **Commercial**: Terms not clearly stated

### Terms & Restrictions
- ⚠️ Requires BibleGateway username/password
- ⚠️ Terms of Service not easily found
- ⚠️ May have similar restrictions to API.Bible (need to verify)
- ✅ Already implemented in your codebase (just disabled)

### API Features
- REST API
- OAuth-style authentication
- Search functionality
- Passage retrieval

### Pros
- ✅ Already implemented in your codebase
- ✅ Large translation library
- ✅ Free account access
- ✅ NASB and NIV listed as available

### Cons
- ⚠️ Currently disabled (you mentioned it didn't offer NASB/NIV - need to verify)
- ⚠️ Terms of Service not easily accessible
- ⚠️ May have restrictions similar to API.Bible
- ⚠️ Requires account credentials

### Recommendation
**MEDIUM PRIORITY** - Test if NASB/NIV are actually available:
1. Enable BibleGateway API temporarily
2. Test NASB/NIV availability
3. Review Terms of Service if found
4. Compare to API.Bible terms

---

## 3. Biblia.com API (Faithlife/Logos)

**Website**: https://bibliaapi.com/docs/  
**Provider**: Faithlife (Logos Bible Software)  
**Status**: Available

### Available Translations
- **NASB**: ❌ **NOT available** (requires existing license)
- **NIV**: ❌ **NOT available** (requires existing license)
- **LEB, DARBY, YLT, EMPHBBL**: ✅ Available
- **ESV**: ❌ Not available via API

### Pricing
- **Free tier**: 5,000 requests/day
- **Commercial**: Contact for pricing

### Terms & Restrictions
- ⚠️ "Logos Free" content is non-commercial only
- ⚠️ Commercial use requires permission
- ⚠️ NASB/NIV not available without existing license
- ✅ No controversial use restrictions found

### API Features
- REST API
- Search functionality
- Reference validation
- Content comparison

### Pros
- ✅ Free tier available
- ✅ Good API documentation
- ✅ No controversial use restrictions found
- ✅ Unique translations (LEB, DARBY, etc.)

### Cons
- ❌ **NASB not available** (deal-breaker for your needs)
- ❌ **NIV not available** (deal-breaker for your needs)
- ⚠️ Commercial use requires permission
- ⚠️ Limited popular translations

### Recommendation
**LOW PRIORITY** - Doesn't meet your NASB/NIV requirement, but good for other translations.

---

## 4. Direct Publisher APIs

### 4a. ESV API (Crossway)
- **Free**: ✅ For non-commercial use
- **Commercial**: Contact Crossway
- **Restrictions**: None found (simple terms)
- **Translation**: ESV only
- ✅ **Already implemented in your app**

### 4b. NLT API (Tyndale House)
- **Free**: ✅ For non-commercial use
- **Commercial**: Contact Tyndale
- **Translation**: NLT only

### 4c. NET Bible API
- **Free**: ✅ For non-commercial use
- **Commercial**: Requires written permission
- **Translation**: NET Bible only

### Recommendation
**GOOD FOR SUPPLEMENTING** - Use alongside other services for specific translations.

---

## 5. Digital Bible Library (DBL)

**Website**: https://library.bible/  
**Provider**: United Bible Societies / American Bible Society  
**Status**: Available (but requires API.Bible integration)

### Available Translations
- **NASB**: ✅ Available (via API.Bible)
- **NIV**: ✅ Available (via API.Bible)
- **2,500+ translations**

### How It Works
- DBL is the **content repository**
- **API.Bible is the access method**
- You still need API.Bible to use DBL content
- Library Card Holder (LCH) membership required for copyrighted content

### Recommendation
**NOT AN ALTERNATIVE** - This is the backend that API.Bible uses. You'd still need API.Bible.

---

## 6. Free/Community APIs (No NASB/NIV)

### 6a. getBible API
- **Free**: ✅ Unlimited
- **Translations**: Many, but **no NASB/NIV** (copyrighted)
- ✅ **Already implemented in your app**

### 6b. Bible Brain (Faith Comes By Hearing)
- **Free**: ✅ Unlimited
- **Translations**: 1,700+ languages, but **no NASB/NIV**
- Focus on audio/video content

### 6c. Bolls Bible API
- **Free**: ✅ No API key required
- **Translations**: Includes NASB, NIV, ESV
- ⚠️ **Legal concerns** (unclear licensing - we discussed this earlier)

### Recommendation
**GOOD FOR FREE TRANSLATIONS** - Use for KJV, ASV, WEB, etc. But not for NASB/NIV.

---

## Comparison Matrix

| Service | NASB | NIV | Commercial | Terms Complexity | Pricing | Recommendation |
|---------|------|-----|------------|------------------|---------|----------------|
| **YouVersion Platform** | ✅ | ✅ | ✅ | ⚠️ Unknown | ⚠️ Contact | ⭐ **BEST OPTION** |
| **Bible Gateway API** | ✅ | ✅ | ⚠️ Unknown | ⚠️ Unknown | Free | ⭐ **TEST FIRST** |
| **API.Bible** | ✅ | ⚠️ Restricted | ✅ | ❌ Very Complex | $29+/mo | ⚠️ Complex TOS |
| **Biblia.com** | ❌ | ❌ | ⚠️ Contact | ✅ Simple | Free tier | ❌ No NASB/NIV |
| **ESV API** | ❌ | ❌ | ⚠️ Contact | ✅ Simple | Free (non-com) | ✅ Good supplement |
| **getBible** | ❌ | ❌ | ✅ | ✅ Simple | Free | ✅ Good supplement |
| **Bolls Bible** | ✅ | ✅ | ⚠️ Legal risk | ✅ Simple | Free | ❌ Legal concerns |

---

## Recommended Action Plan

### Phase 1: Immediate (This Week)
1. **Contact YouVersion Platform** ⭐
   - Email: Check their developer docs for contact info
   - Ask about:
     - Commercial licensing terms
     - Pricing structure
     - NASB/NIV availability
     - Terms of Service (especially user responsibility)
     - Any controversial use restrictions

2. **Test Bible Gateway API**
   - Enable temporarily in your codebase
   - Test NASB/NIV availability
   - Review Terms of Service if accessible
   - Compare restrictions to API.Bible

### Phase 2: Short-term (Next 2 Weeks)
3. **Contact Lockman Foundation** (NASB copyright holder)
   - Ask about direct licensing options
   - Compare terms to API.Bible
   - Get pricing information
   - May offer better terms than API.Bible

4. **Contact Biblica** (NIV copyright holder)
   - Ask about direct licensing options
   - Compare terms to API.Bible
   - Get pricing information

### Phase 3: Decision (After Research)
5. **Compare all options**:
   - Terms complexity
   - User responsibility clauses
   - Pricing
   - Technical implementation
   - Risk tolerance

---

## Key Questions to Ask Each Service

When contacting these services, ask:

1. **Commercial Licensing**:
   - What are the commercial licensing terms?
   - What's the pricing structure?
   - Are there volume discounts?

2. **User Responsibility**:
   - Am I responsible for user-generated content?
   - Do I need to moderate user content?
   - What happens if users create content that contradicts theological positions?

3. **Restrictions**:
   - Are there restrictions on "controversial use"?
   - Are there theological position requirements?
   - Can LGBTQ+ users use my app?

4. **Technical**:
   - What's the API rate limit?
   - Can I cache content?
   - What are the caching requirements?

5. **Support**:
   - What support is available?
   - How quickly do you respond to issues?
   - What happens if I violate terms?

---

## My Top Recommendations

### Best Overall: YouVersion Platform ⭐
- Large translation library
- Fast-track licensing
- Modern developer tools
- No controversial use restrictions found
- **Action**: Contact them immediately

### Best to Test: Bible Gateway API ⭐
- Already implemented in your codebase
- NASB/NIV listed as available
- Free account access
- **Action**: Enable and test

### Best Supplement: ESV API + getBible
- ESV API: Free, simple terms, already implemented
- getBible: Free, many translations, already implemented
- **Action**: Use these for non-NASB translations

### Avoid: API.Bible (for now)
- Complex TOS
- User responsibility concerns
- Controversial use restrictions
- **Action**: Only consider if other options don't work

---

## Next Steps

1. **Start with YouVersion Platform** - Most promising alternative
2. **Test Bible Gateway** - Already in your codebase
3. **Contact publishers directly** - May get better terms
4. **Use free APIs** - For non-NASB translations

The goal is to find a service that:
- ✅ Provides NASB (and ideally NIV)
- ✅ Has simple, clear terms
- ✅ Doesn't hold you responsible for user content
- ✅ Reasonable pricing
- ✅ Good developer experience
