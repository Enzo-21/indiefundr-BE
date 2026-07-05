import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterEach, describe, it } from "node:test";
import {
  loadServiceAccountFromEnv,
  parseServiceAccountJson,
} from "./admin";

const SAMPLE_SERVICE_ACCOUNT = {
  type: "service_account",
  project_id: "indiefundr-85ac7",
  private_key_id: "test-key-id",
  private_key: "-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----\\n",
  client_email: "firebase-adminsdk@test.indiefundr-85ac7.iam.gserviceaccount.com",
  client_id: "123456789",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
};

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("firebase admin credentials", () => {
  it("parses service account JSON from env string", () => {
    const parsed = parseServiceAccountJson(
      JSON.stringify(SAMPLE_SERVICE_ACCOUNT)
    );
    assert.equal(parsed?.project_id, "indiefundr-85ac7");
    assert.equal(
      parsed?.client_email,
      "firebase-adminsdk@test.indiefundr-85ac7.iam.gserviceaccount.com"
    );
  });

  it("loads service account from FIREBASE_SERVICE_ACCOUNT_JSON", () => {
    const account = loadServiceAccountFromEnv({
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(SAMPLE_SERVICE_ACCOUNT),
    });
    assert.equal(account?.project_id, "indiefundr-85ac7");
  });

  it("loads service account from FIREBASE_SERVICE_ACCOUNT_BASE64", () => {
    const encoded = Buffer.from(
      JSON.stringify(SAMPLE_SERVICE_ACCOUNT),
      "utf8"
    ).toString("base64");

    const account = loadServiceAccountFromEnv({
      FIREBASE_SERVICE_ACCOUNT_BASE64: encoded,
    });
    assert.equal(account?.project_id, "indiefundr-85ac7");
  });

  it("falls back to FIREBASE_SERVICE_ACCOUNT_PATH when JSON env is unset", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "firebase-admin-test-"));
    const filePath = path.join(dir, "firebase-sa.json");
    writeFileSync(filePath, JSON.stringify(SAMPLE_SERVICE_ACCOUNT), "utf8");

    const account = loadServiceAccountFromEnv({
      FIREBASE_SERVICE_ACCOUNT_PATH: filePath,
    });
    assert.equal(account?.project_id, "indiefundr-85ac7");
  });

  it("prefers JSON env over file path", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "firebase-admin-test-"));
    const filePath = path.join(dir, "firebase-sa.json");
    writeFileSync(
      filePath,
      JSON.stringify({ ...SAMPLE_SERVICE_ACCOUNT, project_id: "from-file" }),
      "utf8"
    );

    const account = loadServiceAccountFromEnv({
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(SAMPLE_SERVICE_ACCOUNT),
      FIREBASE_SERVICE_ACCOUNT_PATH: filePath,
    });
    assert.equal(account?.project_id, "indiefundr-85ac7");
  });

  it("returns null for invalid JSON", () => {
    assert.equal(parseServiceAccountJson("{not-json"), null);
    assert.equal(
      loadServiceAccountFromEnv({
        FIREBASE_SERVICE_ACCOUNT_JSON: "{not-json",
      }),
      null
    );
  });

  it("returns null when no credential source is configured", () => {
    assert.equal(loadServiceAccountFromEnv({}), null);
  });
});
