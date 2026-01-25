# User Responsibility Analysis: API.Bible TOS

## Your Concern

You're worried about being held responsible for what your users do, especially given:
- Complex TOS with vague restrictions
- Prohibitions on "controversial use" (critical queer theory, etc.)
- Theological position requirements
- User-generated content (notes, annotations) in your app

## What the TOS Actually Says

### Section 5: Third Party IP License Terms
> "API Content and Third Party IP content accessible via API.Bible is provided under a stringent requirement that no potentially controversial use of API Content or Third Party IP content is allowed (e.g. numerology, critical race theory, critical queer theory, etc)."

**Key Question**: Does this apply to:
- **Your use** of the API? ✅ Yes, clearly
- **User-generated content** that references API content? ⚠️ Unclear

### Section 8: Prohibited Use
> "You guarantee that you will not use the Site for any purpose that is unlawful or prohibited..."

**Key Point**: This says "You" (the developer), not "your users"

### What's NOT Explicitly Stated

The TOS does **NOT** explicitly say:
- ❌ You must moderate user-generated content
- ❌ You're responsible for what users write in notes
- ❌ You must prevent users from creating content that contradicts theological positions
- ❌ You must filter or remove user content

### What IS Explicitly Stated

The TOS DOES say:
- ✅ **You** cannot use API content in controversial ways
- ✅ **You** must ensure your app doesn't promote controversial theories
- ✅ **You** are responsible for how API content is used in your app

## The Gray Area

### Interpretation 1: Strict (Higher Risk)
- "No controversial use" means your app cannot facilitate controversial discussions
- If users create notes discussing LGBTQ+ topics using API content, you're violating the TOS
- You must moderate/remove user content that contradicts theological positions

### Interpretation 2: Lenient (Lower Risk)
- "No controversial use" means **you** can't use API content to promote controversial theories
- User-generated content is separate from API content usage
- As long as you're not promoting controversial use, you're compliant

### The Problem: It's Undefined

The TOS doesn't clarify which interpretation is correct. This creates **legal uncertainty**.

## Your App's User-Generated Content

Based on your codebase, users can create:
1. **Notes** (markdown content) - attached to verses
2. **Annotations** (highlights, symbols, text colors)
3. **Section headings** (user-defined)
4. **Chapter titles** (user-defined)
5. **Keywords** (for cross-translation highlighting)

**All stored locally** in IndexedDB - not shared publicly (unless you add sharing features).

## Risk Assessment

### Low Risk Scenario
- Users create personal notes/annotations
- Content is stored locally only
- No public sharing or promotion
- You don't actively promote controversial use

**Likelihood of enforcement**: Very low
- API.Bible likely wouldn't know about private user content
- No public visibility = no reports
- Hard to prove violation

### Medium Risk Scenario
- Users create notes discussing LGBTQ+ topics
- Content references API.Bible content
- Still private, but more visible if app grows

**Likelihood of enforcement**: Low-Medium
- Depends on app visibility
- If someone reports your app, API.Bible might investigate
- Could result in termination if interpreted strictly

### High Risk Scenario
- You add public sharing features
- Users share notes that contradict theological positions
- Your app becomes known for inclusive/LGBTQ+-friendly content

**Likelihood of enforcement**: High
- Public visibility increases risk
- Easier to prove violation
- More likely to be reported

## Alternatives That Don't Have These Restrictions

### Option 1: ESV API (Free)
**Pros**:
- ✅ Free for non-commercial use
- ✅ No theological restrictions
- ✅ No user responsibility clauses
- ✅ Simple TOS

**Cons**:
- ❌ No NASB
- ❌ ESV only

### Option 2: getBible API (Free)
**Pros**:
- ✅ Free, open source
- ✅ Many translations
- ✅ No restrictions on user content
- ✅ Simple licensing

**Cons**:
- ❌ No NASB (copyrighted)
- ❌ Less polished API

### Option 3: Direct NASB Licensing from Lockman Foundation
**Pros**:
- ✅ Legally licensed NASB
- ✅ May have different terms (need to check)
- ✅ Direct relationship with copyright holder

**Cons**:
- ❌ More complex process
- ❌ May have similar restrictions (need to verify)
- ❌ May require higher fees

### Option 4: Hybrid Approach
**Pros**:
- ✅ Use API.Bible for NASB only
- ✅ Use other APIs (getBible, ESV) for other translations
- ✅ Limit exposure to API.Bible restrictions
- ✅ Users can choose translations

**Cons**:
- ⚠️ Still bound by API.Bible terms for NASB content
- ⚠️ More complex implementation

## Recommendations

### If You Want to Avoid User Responsibility Risk

**Option A: Skip API.Bible Entirely**
- Use ESV API (free, no restrictions)
- Use getBible for other translations
- Accept that NASB won't be available
- **Risk**: None (no API.Bible terms to violate)

**Option B: Contact Lockman Foundation Directly**
- Ask about NASB licensing terms
- See if they have different restrictions
- May be more lenient than API.Bible
- **Risk**: Unknown until you ask

**Option C: Use API.Bible with Risk Mitigation**
- Only use for NASB
- Keep user content private (no sharing)
- Add disclaimer that user content is separate from API content
- Monitor for potential violations
- **Risk**: Low-Medium (depends on interpretation)

### If You Proceed with API.Bible

**Risk Mitigation Strategies**:

1. **Keep Content Private**
   - Don't add public sharing features
   - User content stays local only
   - Reduces visibility and enforcement risk

2. **Add Terms of Service for Your App**
   - Clarify that user content is separate from API content
   - State that users are responsible for their own content
   - May not protect you, but shows good faith

3. **Limit API.Bible to NASB Only**
   - Use other APIs for other translations
   - Reduces exposure to API.Bible restrictions
   - Users can choose which translations to use

4. **Contact API.Bible Support**
   - Ask directly: "Am I responsible for user-generated content?"
   - Get clarification in writing
   - Document their response

5. **Consult a Lawyer**
   - Get legal interpretation of the TOS
   - Understand your actual liability
   - May cost $200-500 but provides clarity

## My Recommendation

Given your concerns, I'd recommend:

1. **Short-term**: Skip API.Bible for now
   - Use ESV API (free, no restrictions)
   - Use getBible for other translations
   - Focus on building your app without TOS complexity

2. **Medium-term**: Contact Lockman Foundation
   - Ask about direct NASB licensing
   - Compare terms to API.Bible
   - May find better option

3. **Long-term**: Re-evaluate if needed
   - If NASB becomes critical, revisit API.Bible
   - By then, you'll know your user base better
   - Can make informed decision about risk tolerance

## Bottom Line

**You're right to be concerned**. The TOS is:
- ✅ Overly complex
- ✅ Vague on user responsibility
- ✅ Potentially restrictive
- ⚠️ Creates legal uncertainty

**The good news**: You have alternatives that don't have these restrictions. You can build a great Bible study app without API.Bible.

**The question**: Is NASB worth the complexity and risk? Only you can decide, but given your concerns, I'd lean toward exploring alternatives first.
