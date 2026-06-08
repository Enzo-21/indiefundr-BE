import { existsSync, readFileSync } from "fs";
import path from "path";
import admin from "firebase-admin";

let initialized = false;

export function getFirebaseAdmin(): typeof admin | null {
  if (initialized) return admin;

  const relPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (!relPath) {
    return null;
  }

  const absPath = path.isAbsolute(relPath)
    ? relPath
    : path.join(process.cwd(), relPath);

  if (!existsSync(absPath)) {
    console.warn("[firebase-admin] service account not found:", absPath);
    return null;
  }

  const serviceAccount = JSON.parse(readFileSync(absPath, "utf8")) as admin.ServiceAccount;
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  initialized = true;
  return admin;
}
