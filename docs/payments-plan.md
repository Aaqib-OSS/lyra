# Lyra Pro: subscription plan (draft for approval, nothing built yet)

Goal: a paid monthly plan (about 50 per month, currency to decide) that funds the project, without breaking what Lyra stands for today: free, open source (MIT), no account, no telemetry, on F-Droid.

## 0. Decisions I need from you first

| # | Decision | My recommendation |
|---|---|---|
| 1 | Currency and price: 50 what? | Decide Rs 50 or USD 50. Rs 50 (about 0.6 USD) is cheap but fees eat a lot; USD 50 is very high for a lyrics app. Most apps like this charge 2-5 USD or Rs 99-199. Please confirm the real figure. |
| 2 | What is paid? | Keep the core free forever (lyrics, looks, video). Charge for extras: lyric-video export in current look, Lyra Connect (phone/TV/OBS), karaoke recording, extra looks, early releases. |
| 3 | Who is the seller? | Use a merchant of record (Paddle or Lemon Squeezy) so they handle tax and invoices. Razorpay is cheaper in India but you then handle GST and global VAT yourself. |
| 4 | Open source stays? | Yes, MIT stays. Paid features are enforced by a server key check, not by secrecy. Anyone can fork and remove it; that is accepted. Most buyers pay for convenience and support. |
| 5 | Android store | Paid features cannot ship in the F-Droid build (it must not ask for payment or phone home). Keep F-Droid free; sell Pro through the GitHub APK and website, or Google Play (15-30 percent fee, Play Billing required there). |

## 1. Shape of the system

```
 Buyer ──► Website (pricing page) ──► Checkout (Paddle / Lemon Squeezy / Razorpay)
                                          │ webhook (signed)
                                          ▼
                                 Lyra License API (small server)
                                 ┌────────────────────────┐
                                 │ DB: customers, subs,    │
                                 │ license keys, devices   │
                                 └────────────────────────┘
                                          ▲  ▲
        Windows app ─────────────────────┘  └───────────────── Android app
        activate(key) / refresh (every few days) → signed "entitlement" token (offline-valid)
```

- **Checkout**: hosted by the payment provider. Lyra never sees or stores a card number (this keeps us out of PCI scope).
- **License API**: one small serverless service (Vercel functions, you already host the website there) plus a database (Neon/Supabase Postgres or Vercel KV). Endpoints:
  - `POST /webhook/<provider>`: verifies the provider signature, creates or updates a subscription, issues a license key, emails it.
  - `POST /license/activate`: key + device id in, signed entitlement out.
  - `POST /license/refresh`: renews the entitlement while the subscription is active.
  - `POST /license/deactivate`: frees a device slot.
  - `GET /portal`: link to the provider's customer portal (cancel, change card, invoices).
- **Entitlement token**: a short JSON (plan, expiry, device id) signed with an Ed25519 private key that lives only on the server. The app ships the public key and verifies it offline. So Pro keeps working without internet for a grace period (for example 14 days past the last refresh), which fits a local-first app.

## 2. In the apps

- New `src/core/license/` (shared by Windows and the Android WebView):
  - `entitlement.ts`: verify signature, expiry, device binding, grace period. Pure, fully unit tested.
  - `store`: keeps the key and token. Windows uses Electron `safeStorage` (same pattern as Connect tokens); Android uses Keystore-backed storage.
  - `useProFeature(name)` hook and a small `ProGate` component: shows the feature if entitled, otherwise an upgrade card.
- UI: Settings → "Lyra Pro" (enter key, status, manage subscription, restore). A friendly upgrade card where a Pro feature is used. No nag screens, no timers.
- Network: only two calls to the License API (activate, refresh), sent with the key and a random device id. No analytics. `PRIVACY.md` gets an honest section: "Pro makes these two requests; free use makes none."
- Device limit: 2-3 devices per key to stop key sharing, with self-service deactivate.
- Failure modes handled: server down (keep last good token), clock changed (token has issued-at and a server time hint), refunded or chargeback (next refresh returns revoked), expired (features lock gently, nothing is deleted).

## 3. Money flow and compliance (India-focused, confirm with an accountant)

- Provider options:
  - **Paddle / Lemon Squeezy (merchant of record)**: about 5 percent + fixed fee per sale, they collect and remit tax worldwide, you receive payouts. Least work and lowest legal risk. Check that payouts to an Indian account are supported for your account type.
  - **Razorpay (Subscriptions / UPI AutoPay)**: best for Indian buyers (UPI, cards, netbanking), about 2 percent, but you handle GST invoices and foreign tax yourself. RBI rules mean recurring card payments need e-mandates, which Razorpay handles.
  - **Stripe**: not generally open to individuals in India without a registered business.
- Likely need: a business or at least a sole-proprietor registration, PAN, bank account, and GST registration once turnover passes the threshold. Student or individual status may limit which provider accepts you. This is the biggest practical blocker, so check it first.
- Terms: Terms of Service, Refund policy, Privacy policy updated, support email. Required by every provider.
- Free tier promise written down: what stays free forever.

## 4. Build order (each step shippable and reviewed by you)

1. **Decide + register** (you): answers to section 0, create the provider account, product and price. I can draft the policy pages.
2. **License core** (me): `src/core/license`, signing keys script, unit tests. No UI yet.
3. **License API** (me): serverless endpoints, DB schema, webhook handler with signature check, test mode against the provider sandbox.
4. **App wiring** (me): Settings → Pro, `ProGate`, gate the chosen features on Windows, then Android (GitHub APK build only).
5. **Website** (me): pricing page, success page that shows the key, link to the portal, updated privacy and terms.
6. **Test mode end to end** (me + you): sandbox purchase → key → activate → feature unlocks → cancel → locks. Refund and failed-payment paths.
7. **Go live + release** (you flip the provider to live, I ship 0.28 with Pro).

## 5. Risks

- **Open source + paywall**: forks can remove the gate. Mitigation: value in the hosted pieces (updates, support, Connect relay if added), fair price, good experience.
- **Trust**: the "no account, no servers" promise changes. We keep it for free users and be very clear in the docs.
- **F-Droid policy**: must stay free of payment code paths in that build (separate build flavor).
- **Operational load**: a server and a database now exist; billing support emails will come. Keep it tiny and serverless.
- **Tax/legal**: needs your accountant's confirmation before going live.

## 6. What I will not do without your approval

Create accounts, enter any keys or secrets, publish anything, or change what is free today.
