# Native mobile distribution (web gate)

Mobile browsers do not run the full IndieFundr web app. Instead they see platform-specific install instructions. Desktop browsers continue to use the full Expo web app at `app.{domain}`.

## Flow

| Visitor | Experience |
|---------|------------|
| Desktop browser on `app.{domain}` | Full web app (login, invest, etc.) |
| iPhone / iPad Safari (or other mobile browser) | TestFlight two-step screen |
| Android Chrome (or other mobile browser) | APK install card |
| Marketing landing store badges | Same instructions in a modal |

```text
Landing badge / app URL on phone
        │
        ▼
  Mobile native gate (Expo web)
        │
   ┌────┴────┐
   ▼         ▼
 iOS       Android
TestFlight   APK card
  steps    (placeholder)
```

## Placeholder URLs

Until native builds are published, defaults point at distribution tooling:

| Constant | Default | Replace with |
|----------|---------|--------------|
| `IOS_BETA_TESTFLIGHT_URL` | [Expo Go beta](https://testflight.apple.com/join/GZJxxfUU) | IndieFundr TestFlight public join link |
| `TESTFLIGHT_APP_STORE_URL` | TestFlight on App Store | (unchanged) |
| `APK_DOWNLOAD_URL` | `null` | Hosted `.apk` URL |

**Frontend** (`frontend/constants/nativeDistribution.ts`):

- Edit constants directly, or use env at build time if you add `EXPO_PUBLIC_*` overrides later.

**Marketing** (`backend/src/lib/marketing/nativeDistribution.ts`):

- `NEXT_PUBLIC_IOS_BETA_TESTFLIGHT_URL`
- `NEXT_PUBLIC_TESTFLIGHT_APP_STORE_URL`
- `NEXT_PUBLIC_APK_DOWNLOAD_URL`

## Dev bypass

To load the full web app on a phone during development:

- Append `?allowBrowser=1` to the Expo web URL, or
- Set `EXPO_PUBLIC_ALLOW_MOBILE_BROWSER=1` in `frontend/.env`.

## Build and deploy

```bash
cd frontend && npm run build:web   # expo export -p web
```

Deploy `frontend/dist/` to the `app` subdomain. No service worker or web manifest is required.

**LAN development:** Marketing CTAs on a private IP use `http://<ip>:3000/__open-app`, which middleware redirects to Expo on the same IP (`APP_WEB_URL`, default port 8081). See [backend README](../README.md).

## Key files

| Area | Path |
|------|------|
| Expo mobile gate | `frontend/components/mobile-native/MobileNativeGate.tsx` |
| Distribution constants | `frontend/constants/nativeDistribution.ts` |
| Marketing install modal | `backend/src/components/marketing/install-app-modal.tsx` |
| Marketing constants | `backend/src/lib/marketing/nativeDistribution.ts` |
| App open URLs | `backend/src/lib/marketing/appUrl.ts` |

## Manual test checklist

1. **Desktop Chrome** at `http://localhost:8081` — no gate; app works normally.
2. **iPhone Safari** — TestFlight steps; buttons open TestFlight App Store and Expo Go beta join link.
3. **Android Chrome** — APK card; **Install APK** shows “APK in progress”.
4. **Marketing site** — App Store / Play badges open updated modals (no “Add to Home Screen” copy).
5. **Dev bypass** — `?allowBrowser=1` on phone loads full web app.
6. **`npm run build:web`** — succeeds; `dist/` has no `sw.js`.
