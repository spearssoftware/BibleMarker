# API.Bible Terms of Service Analysis

## Overview

This document analyzes API.Bible's Minimum Acceptable Use Agreement and its implications for your Bible study app.

---

## Key Requirements

### 1. Content Integrity ✅ (Manageable)
**Requirement**: 
- Cannot modify content from API.Bible
- Must preserve Scripture integrity
- Cached content must be refreshed at least once every 30 days

**Impact on Your App**:
- ✅ Your app already caches chapters - need to ensure 30-day refresh
- ✅ You don't modify Bible text (only add annotations/highlights)
- ⚠️ Need to implement cache expiration check

**Implementation**:
- Add `lastFetched` timestamp to cached chapters
- Check age before serving from cache
- Refresh if older than 30 days

---

### 2. Format Restrictions ✅ (No Impact)
**Requirement**:
- Text may not be converted to audio
- Audio may not be converted to text

**Impact on Your App**:
- ✅ Your app only displays text - no audio conversion
- No impact if you're not doing text-to-speech or audio-to-text

---

### 3. Copyright Compliance ⚠️ (Required)
**Requirement**:
- Must display copyright notices for each translation
- Must follow citation format exactly

**Citation Format** (Full):
```
Scripture quotations marked [Bible translation abbreviation] © are taken from the [Bible translation name] © , Copyright [Copyright Year] [Organization name]. Used by permission. All rights reserved. The [Abbreviation] text may not be quoted in any publication made available to the public by a Creative Commons license. The [Abbreviation] may not be translated into any other language. Website: [IP Holder's url]
```

**Citation Format** (Abbreviated - if space constrained):
```
[Bible translation abbreviation] © [Year] [Organization name.] All rights reserved.
```

**Impact on Your App**:
- ⚠️ Need to display copyright for each translation
- ✅ You already show copyright in MultiTranslationView
- ⚠️ Need to ensure format matches exactly
- ⚠️ Must include FUMS JavaScript (Fair Use Management System)

**Implementation**:
- Add copyright display component
- Include FUMS script in HTML
- Store copyright info from API responses

---

### 4. AI Restrictions ✅ (No Impact)
**Requirement**:
- Cannot use API.Bible content to train AI/LLMs without written consent

**Impact on Your App**:
- ✅ Your app doesn't train AI models
- No impact unless you add AI features later

---

### 5. Logo/Brand Restrictions ✅ (No Impact)
**Requirement**:
- Cannot use logos without written consent

**Impact on Your App**:
- ✅ Your app doesn't display Bible version logos
- No impact

---

### 6. Controversial Use Restrictions ⚠️⚠️⚠️ (CRITICAL - Potential Deal Breaker)

**From Full TOS Section 5 (Third Party IP License terms)**:
> "API Content and Third Party IP content accessible via API.Bible is provided under a stringent requirement that no potentially controversial use of API Content or Third Party IP content is allowed (e.g. numerology, critical race theory, critical queer theory, etc)."

**From Minimum Acceptable Use Agreement - Biblical Ministry Consistency**:
Your app must:
- Not engage in or promote illegal or immoral activities
- Maintain "moral integrity, spirit, fervor, and message consistency of the Christian Bible"
- Not conflict with specific theological positions, including:

#### Required Theological Positions:

1. **Marriage Definition**:
   - "God's plan for human sexuality is to be expressed only within the context of marriage"
   - "Marriage is exclusively the union of one genetic male and one genetic female"
   - References: Gen 2:24; Mat 19:5-6; Mark 10:6-9; Rom. 1:26-27; 1 Cor 6:9

2. **Gender Identity**:
   - "God wonderfully and immutably creates each person biological male or female"
   - "Rejection of one's biological sex is a rejection of God's merciful design and creative order"
   - References: Gen 1:26-27; 1 Cor 6:9; Deut. 22:5

#### Prohibited "Controversial Uses":
- Numerology
- Critical race theory
- Critical queer theory
- Other "potentially controversial" uses (undefined, open to interpretation)

**Impact on Your App**:

⚠️⚠️⚠️ **This is a binding agreement** - By using API.Bible, you're agreeing to:
- **No controversial use** - Cannot use API content in ways that promote "critical queer theory" or other controversial theories
- Not allow your app to be used in ways that conflict with these theological positions
- Potentially moderate user-generated content (notes, annotations) that contradicts these views
- Ensure your app's content/promotion aligns with these theological positions
- **Vague definition** - "potentially controversial use" is undefined and open to interpretation

**Questions to Consider**:

1. **Do you agree with these theological positions?**
   - If yes: No problem
   - If no: This could be a deal-breaker

2. **What if users create notes/annotations that contradict these views?**
   - Are you required to moderate/remove them?
   - What's your responsibility as the app owner?

3. **What if your app is used by LGBTQ+ Christians?**
   - Is your app "promoting" something by allowing them to use it?
   - How do you interpret "promoting illegal or immoral activities"?
   - **CRITICAL**: The TOS explicitly prohibits "critical queer theory" - what does this mean for LGBTQ+ users or content?

4. **What about "controversial use" restrictions?**
   - The TOS prohibits "critical queer theory" and "critical race theory"
   - What if users create notes discussing these topics?
   - What if your app's features could be interpreted as supporting these theories?
   - The term "potentially controversial" is undefined - how do you know what's prohibited?

5. **What about inclusivity in your app?**
   - Can you have inclusive language/features?
   - Does this restrict your app's audience?
   - Does allowing LGBTQ+ users constitute "controversial use"?

**Legal/Technical Considerations**:

- This is a **contractual agreement** - violating it could result in:
  - API access termination
  - Potential legal action
  - Loss of licensing

- **Enforcement**: How would API.Bible know if you're violating this?
  - They likely wouldn't monitor your app directly
  - But if reported or discovered, they could terminate access
  - Risk level depends on your app's visibility and usage

---

## Compliance Checklist

### Must Implement:
- [ ] 30-day cache refresh mechanism
- [ ] Copyright notices (exact format)
- [ ] FUMS JavaScript integration
- [ ] Content integrity (no modification of text)

### Must Agree To:
- [ ] **Controversial use restrictions** (no critical queer theory, critical race theory, etc.)
- [ ] **Biblical Ministry Consistency terms** (marriage/gender theological positions)
- [ ] Format restrictions (no text-to-audio conversion)
- [ ] AI restrictions (no training models)

### No Action Needed:
- ✅ Logo usage (not using logos)
- ✅ Format conversion (not doing it)

---

## Recommendations

### Option 1: Proceed with API.Bible
**If you agree with the theological positions**:
- Implement required technical features (cache refresh, copyright, FUMS)
- Ensure your app aligns with the theological requirements
- Proceed with integration

**Pros**:
- Legally licensed NASB
- Professional API
- Good documentation

**Cons**:
- Must agree to theological positions
- Potential restrictions on app features/audience

### Option 2: Alternative Solutions
**If you disagree with or are uncomfortable with the theological requirements**:

1. **Keep ESV API** (free, no theological restrictions)
   - But no NASB access

2. **Use getBible API** (free, many translations)
   - But no NASB (copyrighted)

3. **Contact Lockman Foundation directly** for NASB licensing
   - May have different terms
   - More complex process

4. **Use BibleGateway API** (if it works)
   - May have different terms
   - Need to test if NASB is actually available

### Option 3: Hybrid Approach
- Use API.Bible for NASB only
- Use other APIs (getBible, ESV) for other translations
- Users can choose which translations to use
- But you're still bound by API.Bible's terms for NASB content

---

## Questions to Answer

1. **Do you personally agree with the theological positions stated?**
   - This is a personal/ethical decision

2. **What is your app's target audience?**
   - If targeting all Christians inclusively, this could be problematic
   - If targeting specific theological communities, may be fine

3. **What content will users create?**
   - If users can create notes/annotations, how do you handle content that contradicts these views?
   - Do you need moderation policies?

4. **What's your risk tolerance?**
   - Low risk: Strict compliance, conservative approach
   - Higher risk: More lenient interpretation, hope for the best

---

## My Recommendation

**Before proceeding with API.Bible integration**, I recommend:

1. **Carefully consider the "Biblical Ministry Consistency" section**
   - This is a binding agreement
   - It could restrict your app's features or audience
   - It's not just about technical compliance

2. **If you're uncomfortable with these terms**:
   - Consider alternatives (ESV API, getBible, direct NASB licensing)
   - Or use API.Bible only for NASB, other APIs for other translations

3. **If you're comfortable with these terms**:
   - Proceed with integration
   - Implement required technical features
   - Ensure compliance

4. **Consider consulting a lawyer** if:
   - You're unsure about the legal implications
   - You're concerned about enforcement
   - You want to understand your liability

---

## Next Steps

1. **Decide**: Are you comfortable with the theological requirements?
2. **If yes**: Proceed with integration plan
3. **If no**: Explore alternative NASB options
4. **If unsure**: Research alternatives and compare terms

The technical implementation is straightforward - the bigger question is whether you're comfortable with the terms of service, particularly the "Biblical Ministry Consistency" section.
