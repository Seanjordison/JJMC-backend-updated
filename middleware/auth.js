// middleware/auth.js
// Verifies the Firebase ID token in the Authorization header.
// Attaches req.user = { uid, email, role } on success.

const { auth, db, getFirebaseAdminConfig } = require("../utils/firebaseAdmin");

const VALID_ROLES = ["admin", "bookkeeper", "client-staff"];

/**
 * Verify Firebase ID token from "Authorization: Bearer <token>" header.
 * Loads the caller's role from Firestore `users` collection.
 */
async function verifyToken(req, res, next) {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Missing or malformed Authorization header. Expected: Bearer <idToken>",
    });
  }

  const token = header.slice("Bearer ".length).trim();

  try {
    const firebaseConfig = getFirebaseAdminConfig();
    if (firebaseConfig.configurationError) {
      console.error("[auth] Firebase Admin configuration error:", firebaseConfig);
      return res.status(503).json({
        error: "Firebase Admin configuration error.",
        message: firebaseConfig.configurationError,
      });
    }

    if (!token) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Missing Firebase ID token after Bearer.",
      });
    }

    const decoded = await auth.verifyIdToken(token);

    // Load role from Firestore (source of truth in this project)
    let role = "client-staff"; // safe default
    try {
      const snap = await db.collection("users").doc(decoded.uid).get();
      if (snap.exists) {
        const data = snap.data();
        const firestoreRole = data?.role?.toLowerCase();
        if (VALID_ROLES.includes(firestoreRole)) role = firestoreRole;
      }
    } catch (firestoreErr) {
      console.warn("[auth] Could not load role from Firestore:", firestoreErr.message);
    }

    req.user = {
      uid:   decoded.uid,
      email: decoded.email || null,
      role,
    };

    next();
  } catch (err) {
    const tokenParts = typeof token === "string" ? token.split(".").length : 0;
    const firebaseConfig = getFirebaseAdminConfig();
    console.error("[auth] Token verification failed:", err.code || err.message, {
      tokenLength: typeof token === "string" ? token.length : 0,
      tokenParts,
      projectId: firebaseConfig.projectId || "not set",
      serviceAccountProjectId: firebaseConfig.serviceAccountProjectId || "not set",
      serviceAccountSource: firebaseConfig.serviceAccountSource || "not set",
      projectMismatch: firebaseConfig.projectMismatch,
    });
    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or expired token.",
    });
  }
}

module.exports = { verifyToken };
