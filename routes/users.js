// routes/users.js
const express = require("express");
const router  = express.Router();
const { db, admin } = require("../utils/firebaseAdmin");
const { verifyToken }  = require("../middleware/auth");
const { requireRole }  = require("../middleware/roleGuard");

const VALID_ROLES = ["admin", "bookkeeper", "client-staff"];

const normalizeRole = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

const parseDisabled = (value) => {
  if (typeof value === "boolean") return value;
  return ["disabled", "true", "1", "yes"].includes(
    String(value || "").trim().toLowerCase()
  );
};

const trimString = (value) => (typeof value === "string" ? value.trim() : value);

// ─────────────────────────────────────────────────────────
// GET /api/users
// List all users (admin only).
// ─────────────────────────────────────────────────────────
router.get("/", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const snapshot = await db.collection("users").get();
    const users = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    return res.json({ users });
  } catch (err) {
    console.error("[GET /users]", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/users/bookkeepers
// List users whose role === "bookkeeper" (admin only).
// ─────────────────────────────────────────────────────────
router.get("/bookkeepers", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const snapshot = await db
      .collection("users")
      .where("role", "==", "bookkeeper")
      .get();

    const bookkeepers = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    return res.json({ bookkeepers });
  } catch (err) {
    console.error("[GET /users/bookkeepers]", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// POST /api/users/bookkeepers
// Create a Firebase Auth user and Firestore profile for a bookkeeper.
// Bookkeeper accounts are admin-created only; they are not public signups.
router.post("/bookkeepers", verifyToken, requireRole("admin"), async (req, res) => {
  const {
    email,
    password,
    firstName,
    lastName,
    phoneNumber,
    department,
    position,
  } = req.body || {};

  if (!email || !password || !firstName || !lastName) {
    return res.status(400).json({
      error: "Email, password, first name, and last name are required.",
    });
  }

  if (String(password).length < 6) {
    return res.status(400).json({
      error: "Password must be at least 6 characters.",
    });
  }

  let createdUser = null;

  try {
    createdUser = await admin.auth().createUser({
      email,
      password,
      displayName: `${firstName} ${lastName}`.trim(),
      disabled: false,
    });

    await admin.auth().setCustomUserClaims(createdUser.uid, {
      role: "bookkeeper",
    });

    const bookkeeper = {
      email,
      role: "bookkeeper",
      accountType: "bookkeeper",
      createdBy: req.user.uid,
      firstName,
      lastName,
      phoneNumber: phoneNumber || "",
      department: department || "Accounting",
      position: position || "Bookkeeper",
      disabled: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("users").doc(createdUser.uid).set(bookkeeper, {
      merge: true,
    });

    return res.status(201).json({
      message: "Bookkeeper account created.",
      bookkeeper: {
        id: createdUser.uid,
        ...bookkeeper,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    if (createdUser?.uid) {
      await admin.auth().deleteUser(createdUser.uid).catch(() => {});
    }

    if (err.code === "auth/email-already-exists") {
      return res.status(409).json({
        error: "This email is already registered.",
      });
    }

    console.error("[POST /users/bookkeepers]", err);
    return res.status(500).json({
      error: err.message || "Unable to create bookkeeper account.",
    });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/users/me
// Get the calling user's own profile.
// ─────────────────────────────────────────────────────────
router.get("/me", verifyToken, async (req, res) => {
  try {
    const snap = await db.collection("users").doc(req.user.uid).get();
    if (!snap.exists) {
      return res.status(404).json({ error: "User document not found." });
    }
    return res.json({ user: { id: snap.id, ...snap.data() } });
  } catch (err) {
    console.error("[GET /users/me]", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/users/:uid
// Get a specific user profile.
// Admins can get any user; others can only get themselves.
// ─────────────────────────────────────────────────────────
router.get("/:uid", verifyToken, async (req, res) => {
  const { uid } = req.params;

  // Non-admins may only view their own profile
  if (req.user.role !== "admin" && req.user.uid !== uid) {
    return res.status(403).json({ error: "Forbidden." });
  }

  try {
    const snap = await db.collection("users").doc(uid).get();
    if (!snap.exists) {
      return res.status(404).json({ error: "User not found." });
    }
    return res.json({ user: { id: snap.id, ...snap.data() } });
  } catch (err) {
    console.error("[GET /users/:uid]", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// ─────────────────────────────────────────────────────────
// PUT /api/users/:uid
// Update a user's profile fields.
// Admins can update anyone; others only themselves.
// Role changes are NOT allowed through this route — use /role instead.
// ─────────────────────────────────────────────────────────
router.put("/:uid", verifyToken, async (req, res) => {
  const { uid } = req.params;

  if (req.user.role !== "admin" && req.user.uid !== uid) {
    return res.status(403).json({ error: "Forbidden." });
  }

  try {
    const ref  = db.collection("users").doc(uid);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "User not found." });
    }

    const isAdmin = req.user.role === "admin";
    const {
      id,
      uid: bodyUid,
      createdAt,
      updatedAt,
      password,
      role,
      disabled,
      status,
      ...profileFields
    } = req.body || {};

    void id;
    void bodyUid;
    void createdAt;
    void updatedAt;
    void status;

    if (role !== undefined) {
      return res.status(400).json({ error: "Role changes are disabled on this endpoint." });
    }

    if (!isAdmin && (
      password !== undefined ||
      role !== undefined ||
      disabled !== undefined ||
      profileFields.email !== undefined
    )) {
      return res.status(403).json({ error: "Only admins can update credentials, role, or status." });
    }

    const existing = snap.data();
    const firestoreUpdates = {};

    Object.entries(profileFields).forEach(([key, value]) => {
      firestoreUpdates[key] = trimString(value);
    });

    if (disabled !== undefined) {
      firestoreUpdates.disabled = parseDisabled(disabled);
    }

    const targetIsAdmin = existing.role === "admin";
    const adminCredentialFields = [
      firestoreUpdates.email !== undefined,
      password !== undefined,
      disabled !== undefined,
    ].some(Boolean);

    if (targetIsAdmin && adminCredentialFields) {
      return res.status(400).json({
        error: "Admin credentials and status cannot be edited from Manage Accounts.",
      });
    }

    if (Object.keys(firestoreUpdates).length === 0 && password === undefined) {
      return res.status(400).json({ error: "No valid fields provided to update." });
    }

    const authUpdates = {};
    if (firestoreUpdates.email !== undefined) {
      if (!firestoreUpdates.email) {
        return res.status(400).json({ error: "Email is required." });
      }
      authUpdates.email = firestoreUpdates.email;
    }

    if (password !== undefined && String(password).trim()) {
      if (String(password).length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters." });
      }
      authUpdates.password = String(password);
    }

    if (firestoreUpdates.disabled !== undefined) {
      authUpdates.disabled = firestoreUpdates.disabled;
    }

    const displayName = [
      firestoreUpdates.firstName ?? existing.firstName,
      firestoreUpdates.lastName ?? existing.lastName,
    ].filter(Boolean).join(" ").trim() || firestoreUpdates.name;

    if (displayName) {
      authUpdates.displayName = displayName;
    }

    if (Object.keys(authUpdates).length > 0) {
      await admin.auth().updateUser(uid, authUpdates);
    }

    await ref.update({
      ...firestoreUpdates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ message: "User updated successfully." });
  } catch (err) {
    console.error("[PUT /users/:uid]", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/users/:uid/role
// Set a user's role (admin only).
// ─────────────────────────────────────────────────────────
router.post("/:uid/role", verifyToken, requireRole("admin"), async (req, res) => {
  const { uid } = req.params;
  const role = normalizeRole(req.body?.role);

  if (!role || !VALID_ROLES.includes(role)) {
    return res.status(400).json({
      error: `Invalid role. Valid roles: ${VALID_ROLES.join(", ")}`,
    });
  }

  try {
    const ref  = db.collection("users").doc(uid);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "User not found." });
    }

    await ref.update({
      role,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await admin.auth().setCustomUserClaims(uid, { role });

    return res.json({ message: `Role "${role}" assigned to user ${uid}.` });
  } catch (err) {
    console.error("[POST /users/:uid/role]", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// ─────────────────────────────────────────────────────────
// DELETE /api/users/:uid  (admin only — soft delete via disabled flag)
// ─────────────────────────────────────────────────────────
router.delete("/:uid", verifyToken, requireRole("admin"), async (req, res) => {
  const { uid } = req.params;

  try {
    const ref  = db.collection("users").doc(uid);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "User not found." });
    }

    if (snap.data()?.role === "admin") {
      return res.status(400).json({ error: "Admin accounts cannot be removed from Manage Accounts." });
    }

    const batch = db.batch();

    const clientStaffSnap = await db
      .collection("clientCompanies")
      .where("userIds", "array-contains", uid)
      .get();

    clientStaffSnap.docs.forEach((clientDoc) => {
      batch.update(clientDoc.ref, {
        userIds: admin.firestore.FieldValue.arrayRemove(uid),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    const bookkeeperSnap = await db
      .collection("clientCompanies")
      .where("bookkeeperId", "==", uid)
      .get();

    bookkeeperSnap.docs.forEach((clientDoc) => {
      batch.update(clientDoc.ref, {
        bookkeeperId: null,
        bookkeeperName: null,
        status: "Awaiting Assignment",
        assignedAt: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    batch.delete(ref);
    await batch.commit();

    await admin.auth().deleteUser(uid).catch((authErr) => {
      if (authErr.code !== "auth/user-not-found") throw authErr;
    });

    return res.json({ message: `User ${uid} removed.` });
  } catch (err) {
    console.error("[DELETE /users/:uid]", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;
