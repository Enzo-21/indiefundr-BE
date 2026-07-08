import { existsSync, readFileSync } from "fs";
import path from "path";
import admin from "firebase-admin";

let initialized = false;

type EnvSource = NodeJS.ProcessEnv | Record<string, string | undefined>;

type ServiceAccountJson = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

export function parseServiceAccountJson(
  raw: string
): admin.ServiceAccount | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as ServiceAccountJson;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      console.warn(
        "[firebase-admin] service account JSON is missing required fields"
      );
      return null;
    }
    return parsed as admin.ServiceAccount;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[firebase-admin] invalid service account JSON:", message);
    return null;
  }
}

export function loadServiceAccountFromEnv(
  env: EnvSource = process.env
): admin.ServiceAccount | null {
  const jsonRaw = env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (jsonRaw) {
    return parseServiceAccountJson(jsonRaw);
  }

  const base64Raw = env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();
  if (base64Raw) {
    try {
      const decoded = Buffer.from(base64Raw, "base64").toString("utf8");
      return parseServiceAccountJson(decoded);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        "[firebase-admin] invalid service account base64:",
        message
      );
      return null;
    }
  }

  const relPath = env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
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

  return parseServiceAccountJson(readFileSync(absPath, "utf8"));
}

export function getFirebaseAdmin(): typeof admin | null {
  if (initialized) return admin;

  const serviceAccount = loadServiceAccountFromEnv();
  if (!serviceAccount) {
    return null;
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  initialized = true;
  return admin;
}
