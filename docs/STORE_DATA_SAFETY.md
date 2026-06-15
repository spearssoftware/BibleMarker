# App Store & Play Store Data-Safety Disclosures

Reference for filling in the **Apple App Privacy** labels (App Store Connect) and the
**Google Play Data safety** form. Reflects the 3.0 release, where account-based cloud
sync (Cloudflare server + email-OTP accounts) becomes available.

> Privacy policy URL for both stores: **https://biblemarker.app/privacy/**

## What the app actually collects

| Data | When | Where it goes | Linked to identity? | Purpose |
|------|------|---------------|---------------------|---------|
| Install UUID + app version + platform | Every launch, **all users** | `GET /config` → Cloudflare Flagship | Device-linked, not identity-linked | App functionality / remote config |
| IP address | Any server call (`/config`, `/auth`, `/sync`, `/modules`) | Cloudflare edge | Not used to identify; abuse-prevention only | Analytics-free; security / rate limiting |
| Email address | Only if user creates a sync account | D1 (`accounts`) + Postmark (delivery) | Yes | Account / authentication |
| Study content (annotations, notes, keywords, studies) | Only if user creates an account **and** enables sync | R2 blobs keyed to account | Yes (linked to account email) | App functionality (cross-device sync) |
| Session tokens (hashed) | After sign-in | D1 (`sessions`, SHA-256 only) | Yes | Authentication |
| ESV API key | Only if user adds one | **Local device only** — never sent to our servers | N/A | App functionality |

Key framing: **a user who never signs in shares only the install UUID + version + platform + (edge-level) IP.** Email and study content are collected *only* after explicit account creation and sync opt-in.

## Apple — App Privacy (App Store Connect)

Data types to declare:

- **Contact Info → Email Address**
  - Collected: Yes (sync accounts only)
  - Linked to user: Yes
  - Used for tracking: **No**
  - Purposes: App Functionality (authentication)
- **User Content → Other User Content** (study annotations/notes)
  - Collected: Yes (sync users only)
  - Linked to user: Yes
  - Used for tracking: No
  - Purposes: App Functionality
- **Identifiers → Device ID**
  - Collected: Yes (the install UUID, all users)
  - Linked to user: **No** (random install ID, not identity-linked)
  - Used for tracking: No
  - Purposes: App Functionality
- **Diagnostics / Usage Data:** None collected (no analytics SDK).

"Used for tracking" is **No** across the board — we don't share data with brokers or use it for cross-app/cross-site advertising.

## Google Play — Data safety form

- **Data collection:** Yes. **Data sharing:** No (service providers acting on our
  behalf — Cloudflare, Postmark — are processors, not third-party "sharing" under
  Play's definition).
- **Encryption in transit:** Yes (HTTPS/TLS).
- **User can request deletion:** Yes — in-app account deletion (Settings → Data) plus
  contact email.

Data types:

- **Personal info → Email address** — Collected, not shared. Purpose: Account management. Optional (sync only).
- **App activity / Other user-generated content** — Collected, not shared. Purpose: App functionality. Optional (sync only).
- **Device or other IDs** — Collected, not shared. Purpose: App functionality (remote config). Always (install UUID).

## Notes / gotchas

- The install UUID is regenerated if the local DB is wiped; it is **not** an Apple
  IDFA / Android Advertising ID and must not be declared as one.
- Postmark only ever receives the email address + the one-time code (to deliver it).
- Crossway (ESV) calls go device → Crossway directly with the user's own key; we never
  see them — disclose as the user's relationship with Crossway, not ours.
- iCloud sync (Apple) stores journal files in the user's **own** iCloud account; not
  collected by us, so it does not appear on these forms.
