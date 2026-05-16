// utils/firebaseAdmin.js
// Initializes the Firebase Admin SDK once and exports the db + auth.

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

let initialized = false;
let firebaseAdminConfig = {
  projectId: null,
  serviceAccountProjectId: null,
  serviceAccountSource: null,
  projectMismatch: false,
  configurationError: null,
};

const DEFAULT_FIREBASE_PROJECT_ID = "database-test-34eff";

function loadServiceAccountFromPath(filePath) {
  const resolvedPath = path.resolve(filePath);
  return require(resolvedPath);
}

function initAdmin() {
  if (initialized) return;

  let serviceAccount = null;
  let serviceAccountSource = null;
  let projectId = process.env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    serviceAccount = loadServiceAccountFromPath(
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    );
    serviceAccountSource = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const json = Buffer.from(
      process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
      "base64"
    ).toString("utf8");
    serviceAccount = JSON.parse(json);
    serviceAccountSource = "FIREBASE_SERVICE_ACCOUNT_BASE64";
  } else if (fs.existsSync(path.resolve("serviceAccountKey.json"))) {
    serviceAccount = loadServiceAccountFromPath("serviceAccountKey.json");
    serviceAccountSource = "serviceAccountKey.json";
  }

  const serviceAccountProjectId = serviceAccount?.project_id || null;
  projectId = projectId || serviceAccountProjectId;
  const projectMismatch =
    Boolean(projectId && serviceAccountProjectId && projectId !== serviceAccountProjectId);
  const configurationError = projectMismatch
    ? `Firebase Admin service account project "${serviceAccountProjectId}" does not match backend project "${projectId}". Replace serviceAccountKey.json with a key from "${projectId}".`
    : null;

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId,
    });
  } else {
    admin.initializeApp({ projectId });
  }

  initialized = true;

  firebaseAdminConfig = {
    projectId,
    serviceAccountProjectId,
    serviceAccountSource,
    projectMismatch,
    configurationError,
  };

  if (projectMismatch) {
    console.warn(`[Firebase] ${configurationError}`);
  }

  console.log(`[Firebase] Admin SDK initialized - project: ${projectId || "not set"}`);
}

initAdmin();

const db = admin.firestore();
const auth = admin.auth();

function getFirebaseAdminConfig() {
  return { ...firebaseAdminConfig };
}

module.exports = { admin, db, auth, getFirebaseAdminConfig };
