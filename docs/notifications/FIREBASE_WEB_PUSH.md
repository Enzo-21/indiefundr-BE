# Firebase web push notifications

Step-by-step guide to configure **FCM Web Push** for the IndieFundr **web** app (Expo web at `http://localhost:8081` in dev, `APP_WEB_URL` in production).

**Related:** [README](./README.md) · [Expo iOS/Android](./EXPO_PUSH_IOS_ANDROID.md)

**Official docs:** [FCM JavaScript client](https://firebase.google.com/docs/cloud-messaging/js/client) · [Firebase Admin Node.js](https://firebase.google.com/docs/admin/setup)

---

## What you are setting up

| Layer | Responsibility |
|-------|----------------|
| **Browser** | `firebase/messaging` + service worker; user grants notification permission |
| **FCM** | Delivers web push via Web Push protocol (VAPID) |
| **Backend** | `firebase-admin` sends to FCM registration tokens |

**Use the same Firebase project** as Android FCM in [EXPO_PUSH_IOS_ANDROID.md](./EXPO_PUSH_IOS_ANDROID.md).

> **Do not** use Expo Push (`getExpoPushTokenAsync`) on web. Native mobile and web use different token types and senders.

---

## 0. Prerequisites

- [ ] Firebase project (from [Expo Android setup](./EXPO_PUSH_IOS_ANDROID.md) step 2.1)
- [ ] IndieFundr web app URL:
  - Dev: `http://localhost:8081` ([`backend/.env.example`](../../.env.example) → `APP_WEB_URL`)
  - Prod: e.g. `https://app.indiefundr.com`
- [ ] **HTTPS in production** — FCM web requires a secure context (`localhost` is allowed for development)
- [ ] Supported browser — see [Firebase JS SDK environments](https://firebase.google.com/support/guides/environments_js-sdk)

---

## 1. Add a Web app in Firebase

### Step 1.1 — Open your Firebase project

1. Go to [https://console.firebase.google.com/](https://console.firebase.google.com/).
2. Select the **same project** used for Android (`indiefundr` or your name).

### Step 1.2 — Register the web app

1. **Project overview** → **Add app** → **Web** (`</>`).
2. **App nickname:** `IndieFundr Web`.
3. **Firebase Hosting:** optional (not required for FCM).
4. Click **Register app**.

### Step 1.3 — Copy the Firebase config

Firebase shows a `firebaseConfig` object. Copy these fields:

```js
const firebaseConfig = {
  apiKey: 'AIza...',
  authDomain: 'your-project.firebaseapp.com',
  projectId: 'your-project-id',
  messagingSenderId: '123456789012',
  appId: '1:123456789012:web:abcdef123456',
};
```

You will use them as frontend environment variables (step 4).

Click **Continue to console**.

---

## 2. Generate Web Push (VAPID) key pair

### Step 2.1 — Open Cloud Messaging settings

1. Firebase Console → **Project settings** (gear icon).
2. Tab: **Cloud Messaging**.

### Step 2.2 — Generate key pair

1. Scroll to **Web configuration**.
2. Under **Web Push certificates**, click **Generate key pair**.
3. Copy the **Key pair** string (public VAPID key, starts with `B...`).

This is `EXPO_PUBLIC_FIREBASE_VAPID_KEY` in step 4.

Reference: [Configure Web Credentials with FCM](https://firebase.google.com/docs/cloud-messaging/js/client#configure_web_credentials_with_fcm)

---

## 3. Enable FCM Registration API (if needed)

New Firebase projects usually have this enabled. If `getToken()` fails with an API error:

1. Open [Google Cloud Console](https://console.cloud.google.com/) → select the **same project** as Firebase.
2. **APIs & Services** → **Library**.
3. Search **Firebase Cloud Messaging API** / **FCM Registration API**.
4. Click **Enable**.

Log in with the Google account that owns the Firebase project.

---

## 4. Frontend environment variables

Create or update `frontend/.env` (do not commit secrets unnecessarily; `apiKey` is public-by-design in Firebase web apps):

```bash
EXPO_PUBLIC_FIREBASE_API_KEY=AIza...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
EXPO_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abcdef123456
EXPO_PUBLIC_FIREBASE_VAPID_KEY=BKn...your-public-vapid-key
```

Restart Expo after changing env vars:

```bash
cd frontend
npm run web
```

> **Implementation note:** IndieFundr reads these vars in [`frontend/lib/firebase/webPush.ts`](../../../frontend/lib/firebase/webPush.ts) and generates the service worker via [`frontend/scripts/generate-firebase-messaging-sw.js`](../../../frontend/scripts/generate-firebase-messaging-sw.js).

---

## 5. Service worker (`firebase-messaging-sw.js`)

FCM requires a service worker at the **root of your web origin**:

```
https://your-app-origin/firebase-messaging-sw.js
```

For Expo web, place the file so it is served from the site root (e.g. `frontend/public/firebase-messaging-sw.js`).

### Step 5.1 — Create the file

Create `frontend/public/firebase-messaging-sw.js`:

```js
/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_AUTH_DOMAIN',
  projectId: 'YOUR_PROJECT_ID',
  messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
  appId: 'YOUR_APP_ID',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? 'IndieFundr';
  const body = payload.notification?.body ?? '';
  self.registration.showNotification(title, { body });
});
```

Replace placeholders with the same values as step 1.3.

> Service workers cannot read `EXPO_PUBLIC_*` env vars at runtime. Options: (a) generate this file at build time from env, or (b) duplicate public config here (Firebase web `apiKey` is not secret).

### Step 5.2 — Verify the file is served

1. Run `npm run web` in `frontend`.
2. Open [http://localhost:8081/firebase-messaging-sw.js](http://localhost:8081/firebase-messaging-sw.js).
3. Confirm the JavaScript file loads (not 404).

---

## 6. Client token registration (web only)

> **Repo status:** Implemented in [`frontend/lib/firebase/webPush.ts`](../../../frontend/lib/firebase/webPush.ts) and [`frontend/hooks/useWebPushRegistration.ts`](../../../frontend/hooks/useWebPushRegistration.ts). Registration runs on desktop web after login.

### Step 6.1 — Install Firebase JS SDK (implementation)

```bash
cd frontend
npm install firebase
```

### Step 6.2 — Request permission and get token

```ts
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const app = initializeApp({
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
});

export async function registerWebPushToken() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey: process.env.EXPO_PUBLIC_FIREBASE_VAPID_KEY,
  });
  return token; // FCM registration token (long string, NOT ExponentPushToken)
}
```

### Step 6.3 — Register only on web

```ts
import { Platform } from 'react-native';

if (Platform.OS === 'web') {
  // registerWebPushToken() → POST /api/users/notifications/token
} else {
  // getExpoPushTokenAsync() — see EXPO_PUSH_IOS_ANDROID.md
}
```

### Step 6.4 — Send token to backend

Interim (current API):

```http
POST /api/users/notifications/token
Authorization: Bearer <access_token>
Content-Type: application/json

{ "device": "<FCM_WEB_REGISTRATION_TOKEN>" }
```

Future: extend API with `provider: "fcm_web"` and multi-device storage (see [README](./README.md)).

### Step 6.5 — Foreground messages

```ts
onMessage(messaging, (payload) => {
  console.log('Foreground FCM:', payload);
  // Show in-app toast or update UI
});
```

---

## 7. Backend — Firebase Admin SDK

### Step 7.1 — Download service account key

1. Firebase Console → **Project settings** → **Service accounts**.
2. **Generate new private key** → **Generate key**.
3. Save as e.g. `backend/secrets/firebase-sa.json` (outside git).

You may reuse the same JSON file uploaded to EAS for Android FCM V1 if it is from the same project.

### Step 7.2 — Add backend env var

In `backend/.env` (document in `.env.example` when implementing):

```bash
FIREBASE_SERVICE_ACCOUNT_PATH=./secrets/firebase-sa.json
```

Alternative: base64-encode the JSON for deployment platforms that prefer a single secret var.

### Step 7.3 — Install Admin SDK (implementation)

```bash
cd backend
npm install firebase-admin
```

### Step 7.4 — Initialize and send (minimal example)

```ts
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(
  readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH!, 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

export async function sendWebPush(
  fcmToken: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
) {
  await admin.messaging().send({
    token: fcmToken,
    notification: { title, body },
    data,
    webpush: {
      fcmOptions: { link: 'https://app.indiefundr.com/invite' },
    },
  });
}
```

> **Important:** [`sendPushNotification`](../../src/services/orders/pushNotify.ts) routes by token prefix — FCM web tokens go to `firebase-admin`, `ExponentPushToken[...]` goes to Expo Push Service.

---

## 8. Test web push

### Method A — Browser console (after client code exists)

1. `npm run web` → open app in Chrome.
2. Grant notification permission.
3. Log the FCM token from `getToken`.
4. Send a test from Firebase Console (Method B) or a script (Method C).

### Method B — Firebase Console

1. Firebase → **Engage** → **Messaging** (or **Campaigns**).
2. **Create campaign** → **Firebase Notification messages**.
3. Compose title/body → **Send test message**.
4. Paste the **FCM registration token** from the browser.

### Method C — Node script with firebase-admin

```bash
cd backend
node --import tsx -e "
const admin = require('firebase-admin');
const sa = require('./secrets/firebase-sa.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
admin.messaging().send({
  token: process.env.FCM_TEST_TOKEN,
  notification: { title: 'Test', body: 'Web push works' },
}).then(console.log).catch(console.error);
"
```

```bash
FCM_TEST_TOKEN='your-browser-fcm-token' node ...
```

---

## 9. Authorized domains

If Firebase Auth is enabled, or for some hosting setups:

1. Firebase Console → **Build** → **Authentication** → **Settings** → **Authorized domains**.
2. Ensure these are listed:
   - `localhost` (development)
   - Your production host, e.g. `app.indiefundr.com`

Match `APP_WEB_URL` / `MARKETING_DOMAIN` in [`backend/.env`](../../.env.example).

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| `messaging/unsupported-browser` | Browser blocks push | Use Chrome/Firefox/Edge; check support matrix |
| `firebase-messaging-sw.js` 404 | File not in web root | Step 5.2 |
| `getToken()` returns null | Permission denied | User must click Allow; check site settings |
| `getToken()` fails — missing VAPID | No key pair | Step 2 |
| `messaging/failed-service-worker-registration` | SW scope/path wrong | SW must be at `/firebase-messaging-sw.js` |
| Admin `send` fails — invalid token | Expo token sent to FCM | Use correct sender per platform |
| Works on localhost, not prod | Not HTTPS | Serve prod over HTTPS |
| API not enabled | FCM Registration API off | Step 3 |

---

## 11. Verify (end of guide)

- [ ] Web app registered in Firebase; `firebaseConfig` copied
- [ ] VAPID key pair generated (Web Push certificates)
- [ ] `frontend/public/firebase-messaging-sw.js` exists and loads at `/firebase-messaging-sw.js`
- [ ] `EXPO_PUBLIC_FIREBASE_*` env vars set in `frontend/.env`
- [ ] Service account JSON stored securely for backend
- [ ] FCM registration token obtained in browser (after client implementation)
- [ ] Test notification received (Console or `firebase-admin`)

**Next:** [Wire hybrid senders in the backend](./README.md#next-wire-into-the-app-after-credentials-work) · [Native Expo setup](./EXPO_PUSH_IOS_ANDROID.md)
