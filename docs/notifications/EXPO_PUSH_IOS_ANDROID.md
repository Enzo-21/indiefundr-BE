# Expo push notifications — iOS and Android

Step-by-step guide to configure **Expo Push Notifications** for the IndieFundr mobile app (`slug: indiefundr`). When finished, you can obtain an `ExponentPushToken[...]` on a device and receive test pushes.

**Related:** [README](./README.md) · [Firebase web push](./FIREBASE_WEB_PUSH.md)

**Official docs:** [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/) · [FCM V1 credentials](https://docs.expo.dev/push-notifications/fcm-credentials/)

---

## What you are setting up

| Layer | Responsibility |
|-------|----------------|
| **Client** | `expo-notifications` requests permission and returns `ExponentPushToken` |
| **EAS** | Stores Android FCM V1 service account + iOS APNs key |
| **Expo Push Service** | Delivers to FCM (Android) and APNs (iOS) |
| **IndieFundr backend** | Calls `https://exp.host/--/api/v2/push/send` — no Expo secret required |

IndieFundr already has:

- `expo-notifications` in [`frontend/package.json`](../../../frontend/package.json) and plugin in [`frontend/app.config.js`](../../../frontend/app.config.js)
- [`sendExpoPush`](../../src/services/orders/pushNotify.ts) on the backend
- `POST /api/users/notifications/token` storing the token on `User.device`

This guide covers **credentials and builds**. Wiring `getExpoPushTokenAsync` in the app is a separate implementation task (see [README — Next steps](./README.md#next-wire-into-the-app-after-credentials-work)).

---

## 0. Prerequisites

- [ ] Expo account — [https://expo.dev/signup](https://expo.dev/signup)
- [ ] Node.js and npm (repo already uses Expo SDK 55)
- [ ] **Physical device** recommended (iOS Simulator works on Xcode 14+ / iOS 16+; Android emulator needs Google Play image)
- [ ] Apple Developer Program for real-device iOS push and App Store builds
- [ ] Google account for Firebase (Android FCM)
- [ ] EAS CLI installed globally:

```bash
npm install -g eas-cli
eas login
```

> **Important:** Remote push on **Android does not work in Expo Go** from SDK 53 onward. You need a **development build** (steps below).

---

## 1. Link the app to EAS

### Step 1.1 — Initialize EAS in the frontend

```bash
cd frontend
eas init
```

- Choose **Create a new project** or link to an existing Expo project named `indiefundr`.
- This creates [`eas.json`](../../../frontend/eas.json) (if it does not exist) and links the app on [expo.dev](https://expo.dev).

### Step 1.2 — Copy the EAS Project ID

1. Open [https://expo.dev](https://expo.dev) → your account → **Projects** → **indiefundr**.
2. Open **Project settings**.
3. Copy **Project ID** (UUID, e.g. `a1b2c3d4-e5f6-7890-abcd-ef1234567890`).

### Step 1.3 — Add `projectId` to app config

Edit [`frontend/app.config.js`](../../../frontend/app.config.js). Add `eas.projectId` under `extra`:

```js
extra: {
  eas: {
    projectId: 'YOUR-EAS-PROJECT-UUID',
  },
  apiUrl,
  blockchainNetwork,
  tronscanUrl,
},
```

### Step 1.4 — Verify notification libraries

Already installed in this repo. To confirm:

```bash
cd frontend
npx expo install expo-notifications expo-constants expo-device
```

### Step 1.5 — Verify config plugin

[`frontend/app.config.js`](../../../frontend/app.config.js) should include:

```js
[
  'expo-notifications',
  {
    icon: './assets/images/icon.png',
    color: '#ffffff',
  },
],
```

---

## 2. Android — Firebase and FCM V1

Expo delivers Android notifications through **FCM V1**. You need a Firebase project, `google-services.json` in the app, and a **service account key** uploaded to EAS.

Use the **same Firebase project** you will use for [web push](./FIREBASE_WEB_PUSH.md).

### Step 2.1 — Create or open a Firebase project

1. Go to [https://console.firebase.google.com/](https://console.firebase.google.com/).
2. Click **Add project** (or select an existing project).
3. Name it e.g. `indiefundr` → follow the wizard → **Create project**.

### Step 2.2 — Set Android package name

The package name must match your built Android app.

**Option A — Set explicitly in app config** (recommended before first build):

Edit [`frontend/app.config.js`](../../../frontend/app.config.js):

```js
android: {
  package: 'com.indiefundr.app',
  adaptiveIcon: { /* ... */ },
  usesCleartextTraffic: true,
},
```

**Option B — Read from EAS after first build:**

```bash
cd frontend
eas build:configure
# or inspect the generated android package in expo.dev build logs
```

Use the same value in Firebase and in `app.config.js`.

### Step 2.3 — Register the Android app in Firebase

1. Firebase Console → **Project overview** → **Add app** → **Android**.
2. **Android package name:** `com.indiefundr.app` (or your chosen package).
3. App nickname: `IndieFundr Android`.
4. Debug signing certificate SHA-1: optional for push setup; skip for now.
5. Click **Register app**.

### Step 2.4 — Download `google-services.json`

1. Click **Download google-services.json**.
2. Save to:

```
frontend/google-services.json
```

### Step 2.5 — Point Expo at the file

In [`frontend/app.config.js`](../../../frontend/app.config.js):

```js
android: {
  package: 'com.indiefundr.app',
  googleServicesFile: './google-services.json',
  // ...rest
},
```

### Step 2.6 — Generate Firebase service account key (FCM V1)

1. Firebase Console → **Project settings** (gear) → **Service accounts**.
2. Click **Generate new private key** → **Generate key**.
3. Save the JSON file outside the repo, e.g.:

```
~/secrets/indiefundr-fcm-service-account.json
```

> **Never commit this file.** It grants API access to your Firebase project.

### Step 2.7 — Upload the key to EAS

```bash
cd frontend
eas credentials
```

Follow the prompts:

1. Select **Android**.
2. Select build profile (**production** or **development** — configure both for prod vs dev).
3. **Google Service Account** → **Manage your Google Service Account Key for Push Notifications (FCM V1)**.
4. **Set up a Google Service Account Key for Push Notifications (FCM V1)** → **Upload a new service account key**.
5. Select the JSON file from step 2.6.

Repeat for **development** profile if you use separate credentials for dev builds.

### Step 2.8 — Gitignore secrets

Ensure these patterns are ignored:

```
google-services.json
*-firebase-adminsdk-*.json
```

---

## 3. iOS — APNs via EAS

### Step 3.1 — Create an APNs authentication key (.p8)

1. Open [https://developer.apple.com/account/](https://developer.apple.com/account/).
2. **Certificates, Identifiers & Profiles** → **Keys** → **+**.
3. Key name: e.g. `IndieFundr APNs`.
4. Enable **Apple Push Notifications service (APNs)**.
5. **Continue** → **Register** → **Download** the `.p8` file.

> You can only download the `.p8` **once**. Store it securely (e.g. `~/secrets/AuthKey_XXXXXXXXXX.p8`).

### Step 3.2 — Note Key ID and Team ID

- **Key ID:** shown on the Keys list (10 characters).
- **Team ID:** **Membership** page or top-right of Developer portal.

### Step 3.3 — Upload APNs key to EAS

```bash
cd frontend
eas credentials
```

1. Select **iOS**.
2. Select build profile (**development** or **production**).
3. **Push Notifications** → upload `.p8`, enter **Key ID** and **Apple Team ID**.

### Step 3.4 — Confirm push entitlement

The `expo-notifications` config plugin adds the `aps-environment` entitlement at build time. No manual Xcode step needed for EAS builds.

### Step 3.5 — Set iOS bundle identifier (if not set)

In [`frontend/app.config.js`](../../../frontend/app.config.js):

```js
ios: {
  bundleIdentifier: 'com.indiefundr.app',
  supportsTablet: true,
  // ...
},
```

Must match the App ID in Apple Developer.

---

## 4. Create a development build

If [`frontend/eas.json`](../../../frontend/eas.json) does not exist or lacks a development profile, use:

```json
{
  "cli": {
    "version": ">= 16.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "production": {}
  }
}
```

Build and install:

```bash
cd frontend

# iOS (device or simulator depending on EAS config)
eas build --profile development --platform ios

# Android
eas build --profile development --platform android
```

1. Wait for the build on [expo.dev](https://expo.dev) → **Builds**.
2. Install via QR code, internal distribution link, or simulator build artifact.
3. Start Metro:

```bash
npx expo start --dev-client
```

Open the **development build** (not Expo Go).

---

## 5. Register for an Expo push token on device

> **Repo status:** Client registration is not wired yet. Use this section to **verify credentials** manually, then implement in app code.

### Step 5.1 — Minimal registration pattern

```tsx
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) throw new Error('EAS projectId missing from app.config.js');

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  return token; // ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]
}
```

### Step 5.2 — Send token to IndieFundr backend

Existing API (authenticated):

```http
POST /api/users/notifications/token
Content-Type: application/json

{ "device": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]" }
```

Redux action: [`setPushNotificationsToken`](../../../frontend/redux/actions/pushNotificationsActions.js).

### Step 5.3 — Log token for testing

Temporarily `console.log(token)` on device, or display in a dev-only screen, to copy into the Expo push tool (step 6).

---

## 6. Test delivery

### Method A — Expo Push Notifications tool (recommended)

1. Open [https://expo.dev/notifications](https://expo.dev/notifications).
2. Paste your `ExponentPushToken[...]`.
3. Enter **Title** and **Message**.
4. Click **Send a Notification**.

You should see the notification on the device (app foreground/background depending on handler).

### Method B — curl (same as backend)

```bash
curl -X POST https://exp.host/--/api/v2/push/send \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "to": "ExponentPushToken[YOUR_TOKEN_HERE]",
    "title": "IndieFundr test",
    "body": "Push credentials are working.",
    "data": { "type": "test" },
    "_displayInForeground": true
  }'
```

### Method C — Trigger from IndieFundr

Complete an investment flow that calls [`sendExpoPush`](../../src/services/orders/pushNotify.ts) in `purchaseOrderProcessor` (requires token saved on user/order).

---

## 7. Staging vs production checklist

- [ ] **EAS profiles:** Configure `development` and `production` credentials separately (`eas credentials`).
- [ ] **iOS APNs:** Development builds use sandbox; production builds use production APNs (EAS maps this from profile).
- [ ] **Android:** Same FCM project can serve both; ensure `google-services.json` matches the Firebase Android app.
- [ ] **Rebuild** after changing credentials or `app.config.js` push-related fields.
- [ ] **projectId** in `app.config.js` must match the Expo project that owns the credentials.

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| `Project ID not found` | Missing `extra.eas.projectId` | Step 1.3 |
| No token on Android | Missing `google-services.json` or FCM key not in EAS | Steps 2.4–2.7 |
| No token on iOS | Permissions denied or no push entitlement | Rebuild with `expo-notifications` plugin; check Settings → Notifications |
| Token works in tool, not from backend | Token not saved on user | Call `POST /api/users/notifications/token` |
| Push works on iOS sim but not device | Wrong APNs environment / profile | Re-upload `.p8` to correct EAS profile |
| Using Expo Go on Android | Unsupported for remote push | Use development build (step 4) |

---

## 9. Verify (end of guide)

- [ ] EAS project linked; `projectId` in `app.config.js`
- [ ] `google-services.json` present; `android.googleServicesFile` set
- [ ] FCM V1 service account uploaded to EAS (Android)
- [ ] APNs `.p8` uploaded to EAS (iOS)
- [ ] Development build installed on device
- [ ] `ExponentPushToken[...]` obtained
- [ ] Test notification received via [expo.dev/notifications](https://expo.dev/notifications)

**Next:** [Wire token registration into the app](./README.md#next-wire-into-the-app-after-credentials-work) · [Set up web push in the same Firebase project](./FIREBASE_WEB_PUSH.md)
