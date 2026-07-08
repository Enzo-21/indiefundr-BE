# Mobile web distribution (PWA install gate)

Mobile browsers do not run the full IndieFundr web app until the user installs the PWA. Desktop browsers continue to use the full Expo web app at `app.{domain}`.

## Flow

| Visitor | Experience |
|---------|------------|
| Desktop browser on `app.{domain}` | Full web app (login, invest, etc.) |
| iPhone / iPad mobile browser | PWA install instructions (Add to Home Screen → Open as Web App) |
| Android Chrome mobile browser | PWA install instructions (Add to Home screen → Install) |
| Installed PWA (standalone) | Full web app |
| Marketing landing store badges | Same instructions in a modal |

```text
Landing badge / app URL on phone
        │
        ▼
  PWA install gate (Expo web)
        │
   ┌────┴────┐
   ▼         ▼
 iOS       Android
Add to    Install web
Home      app steps
Screen
```

## Dev bypass

To load the full web app in a mobile browser during local development only:

- Set `EXPO_PUBLIC_ALLOW_MOBILE_BROWSER=1` in `frontend/.env`.

## Build and deploy

```bash
cd frontend && npm run build:web   # expo export -p web
```

Deploy `frontend/dist/` to the `app` subdomain. `site.webmanifest` and Apple web-app meta tags are included for install UX.

**LAN development:** Marketing CTAs on a private IP use `http://<ip>:3000/__open-app`, which middleware redirects to Expo on the same IP (`APP_WEB_URL`, default port 8081). See [backend README](../README.md).

## Key files

| Area | Path |
|------|------|
| Expo PWA install gate | `frontend/components/mobile-native/PwaInstallGate.tsx` |
| Gate logic | `frontend/utils/pwaInstallGate.ts` |
| Install copy (en/es) | `frontend/constants/pwaInstallCopy.ts` |
| Distribution constants (future native) | `frontend/constants/nativeDistribution.ts` |
| Marketing install modal | `backend/src/components/marketing/install-app-modal.tsx` |
| Marketing constants | `backend/src/lib/marketing/nativeDistribution.ts` |
| App open URLs | `backend/src/lib/marketing/appUrl.ts` |

## Manual test checklist

1. **Desktop Chrome** at `http://localhost:8081` — no gate; app works normally.
2. **iPhone Safari (browser)** — PWA install steps; link opens Apple Support guide.
3. **iPhone Safari (installed PWA)** — no gate; app works normally.
4. **Android Chrome (browser)** — PWA install steps; optional Install button if `beforeinstallprompt` fires.
5. **Marketing site** — App Store / Play badges open updated modals.
6. **Dev bypass** — `EXPO_PUBLIC_ALLOW_MOBILE_BROWSER=1` loads full web app in mobile browser.
7. **`npm run build:web`** — succeeds; `dist/` includes `site.webmanifest`.

## Android APK (staging + OTA)

Plan completo Android APK + OTA deprecación: [frontend/docs/APK_ANDROID_BETA_PLAN.md](../../frontend/docs/APK_ANDROID_BETA_PLAN.md)
