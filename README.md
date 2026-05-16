JJMC Payroll Backend

A standalone Node.js / Express REST API backend for the JJMC Payroll and Tax Return System.  

---

Table of Contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Running the Server](#running-the-server)
- [API Reference](#api-reference)
- [Role System](#role-system)
- [Philippine Payroll Calculations](#philippine-payroll-calculations)
- [Scripts](#scripts)
- [Deployment](#deployment)
- [Project Structure](#project-structure)

---

 Architecture

```
Frontend (React/Ionic)
        │
        │  Firebase SDK — real-time listeners, auth, storage
        │
        ├──▶  Firebase Firestore  ◀──── this backend
        │
        └──▶  this backend (REST API)
                    │  Firebase Admin SDK
                    └──▶  Firestore / Firebase Auth
```

The backend uses **Firebase Admin SDK** to read and write Firestore data with full privileges, and to verify the Firebase ID tokens that the frontend sends in every request.

---

Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 |
| npm | ≥ 9 |
| A Firebase project | (same one as the frontend) |
| Firebase service account key | (downloaded from Firebase Console) |



 1. Install dependencies

```bash
npm install
```

 2. Download the Firebase Service Account key

1. Go to [Firebase Console](https://console.firebase.google.com) → your project
2. Project Settings → Service Accounts → **Generate new private key**
3. Save the downloaded JSON as `serviceAccountKey.json` in the project root

> ⚠️ **Never commit `serviceAccountKey.json` to Git.** It is in `.gitignore`.

 4. Create the `.env` file

(Right Click-New Text Document-Copy and Paste the content in the EXAMPLE file into the new text doc- save as and type .env)

Edit `.env` and fill in your values (see [Environment Variables](#environment-variables)).

### 5. Start the server

```bash
npm run dev   # development (auto-reload with nodemon)
npm start     # production
```

Visit `http://localhost:5000/api/health` to confirm it is running.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Port to listen on (default: `5000`) |
| `NODE_ENV` | No | `development` or `production` |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Yes* | Path to service account JSON, e.g. `./serviceAccountKey.json` |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | Yes* | Base64-encoded service account JSON (alternative to path) |
| `FIREBASE_PROJECT_ID` | Yes | e.g. `database-test-34eff` |
| `ALLOWED_ORIGINS` | No | Comma-separated list of allowed CORS origins |

\* Provide **one** of `FIREBASE_SERVICE_ACCOUNT_PATH` or `FIREBASE_SERVICE_ACCOUNT_BASE64`.

---

## Running the Server

```bash
# Development (nodemon hot-reload)
npm run dev

# Production
npm start

# Assign a role to a user (CLI)
npm run set-role -- <UID> <role>
# Example:
npm run set-role -- abc123 bookkeeper
```

---

## API Reference

All endpoints require a valid **Firebase ID token** in the `Authorization` header:

```
Authorization: Bearer <idToken>
```

Obtain the token from the Firebase Auth SDK (`user.getIdToken()`).

---

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Returns `{ status: "ok" }` |

---

### Users  `/api/users`

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/api/users` | admin | List all users |
| GET | `/api/users/me` | any | Get own profile |
| GET | `/api/users/bookkeepers` | admin | List bookkeepers |
| POST | `/api/users/bookkeepers` | admin | Create a bookkeeper Firebase Auth account and profile |
| GET | `/api/users/:uid` | admin / self | Get user profile |
| PUT | `/api/users/:uid` | admin / self | Update profile fields |
| POST | `/api/users/:uid/role` | admin | Set role (`admin`, `bookkeeper`, `client-staff`) |
| DELETE | `/api/users/:uid` | admin | Disable user (soft delete) |

**Create bookkeeper body:**
```json
{
  "email": "bookkeeper@example.com",
  "password": "temporary-password",
  "firstName": "Juan",
  "lastName": "Dela Cruz",
  "phoneNumber": "optional",
  "department": "Accounting",
  "position": "Bookkeeper"
}
```

---

### Clients  `/api/clients`

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/api/clients` | all | List companies (role-scoped) |
| POST | `/api/clients` | admin | Create company |
| GET | `/api/clients/:id` | all | Get company (access-checked) |
| PUT | `/api/clients/:id` | admin | Update company details |
| DELETE | `/api/clients/:id` | admin | Delete company |
| POST | `/api/clients/:id/assign-bookkeeper` | admin | Assign / unassign bookkeeper |
| POST | `/api/clients/:id/add-user` | admin | Add client-staff UID to company |
| DELETE | `/api/clients/:id/remove-user/:uid` | admin | Remove client-staff from company |
| PUT | `/api/clients/:id/csv` | admin, bookkeeper | Upload employee CSV data |

**Assign-bookkeeper body:**
```json
{ "bookkeeperId": "UID_or_NONE" }
```

---

### Payroll  `/api/payroll`

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| POST | `/api/payroll/calculate` | any | Stateless deduction calculation |
| GET | `/api/payroll/drafts` | admin, bookkeeper | List drafts (role-scoped, `?status=`) |
| POST | `/api/payroll/drafts` | bookkeeper, admin | Create draft + auto-calculate |
| GET | `/api/payroll/drafts/:id` | admin, bookkeeper | Get single draft |
| POST | `/api/payroll/drafts/:id/submit` | bookkeeper, admin | Submit draft for admin approval |
| POST | `/api/payroll/drafts/:id/approve` | admin | Approve draft |
| POST | `/api/payroll/drafts/:id/revise` | admin | Request revision |
| DELETE | `/api/payroll/drafts/:id` | admin, bookkeeper | Delete non-approved draft |
| GET | `/api/payroll/history/:clientId` | all | Approved drafts for a client |

**Calculate body (single):**
```json
{ "grossPay": 25000 }
```

**Calculate body (batch):**
```json
{
  "employees": [
    { "name": "Juan Dela Cruz", "ratePerHour": 150, "hoursWorked": 160 },
    { "name": "Maria Santos",   "grossPay": 45000 }
  ]
}
```

**Create draft body:**
```json
{
  "clientId":      "clientCompanyDocId",
  "clientName":    "JJMC Co.",
  "payrollPeriod": "January 2025",
  "employees": [
    { "name": "Juan", "employeeCode": "EMP001", "ratePerHour": 150, "hoursWorked": 160 }
  ]
}
```

---

### Inquiries  `/api/inquiries`

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/api/inquiries` | all | List inquiries (role-scoped) |
| POST | `/api/inquiries` | client-staff | Create inquiry |
| GET | `/api/inquiries/:id` | all | Get inquiry |
| GET | `/api/inquiries/:id/messages` | all | Get messages (role-filtered) |
| POST | `/api/inquiries/:id/messages` | bookkeeper, admin | Add reply |
| POST | `/api/inquiries/:id/messages/:msgId/approve` | admin | Approve reply |
| POST | `/api/inquiries/:id/messages/:msgId/reject` | admin | Reject reply |
| DELETE | `/api/inquiries/:id` | admin | Delete inquiry + messages |

---

### Notifications  `/api/notifications`

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/api/notifications` | any | Get own notifications (`?unread=true`) |
| PUT | `/api/notifications/:id/read` | owner | Mark one as read |
| PUT | `/api/notifications/read-all` | any | Mark all as read |
| DELETE | `/api/notifications/:id` | owner, admin | Delete notification |

---

### Tutorials  `/api/tutorials`

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/api/tutorials` | any | List tutorials |
| GET | `/api/tutorials/:id` | any | Get single tutorial |
| POST | `/api/tutorials` | admin | Create tutorial record |
| PUT | `/api/tutorials/:id` | admin | Update tutorial |
| DELETE | `/api/tutorials/:id` | admin | Delete tutorial |

> The video file itself is uploaded directly to Cloudinary from the frontend (same as the existing `handleUpload.js`). This endpoint only stores the resulting URL + metadata.

---

## Role System

| Role | Firestore value | Access level |
|------|----------------|--------------|
| Admin | `admin` | Full access, approval workflows |
| Bookkeeper | `bookkeeper` | Own clients, create/submit drafts, reply to inquiries |
| Client Staff | `client-staff` | View own data, ask inquiries, view tutorials |

The role is read from the `users` Firestore collection on every request, so role changes take effect immediately without requiring a token refresh.

---

## Philippine Payroll Calculations

The backend mirrors the frontend `payrollCalculations.js` exactly:

| Deduction | Rule |
|-----------|------|
| **SSS** | Bracketed table (₱180 floor at <₱4,250 gross, ₱1,350 cap at ≥₱29,750) |
| **PhilHealth** | 5% of gross, floored at ₱500, capped at ₱5,000 |
| **Pag-IBIG (HDMF)** | Fixed ₱200 |
| **BIR (TRAIN Law)** | Progressive monthly brackets (0% ≤ ₱20,833 … 35% > ₱666,667) |

---

## Scripts

```bash
# Set a user role directly in Firestore
npm run set-role -- <UID> <role>

# Example — make a user a bookkeeper
npm run set-role -- r4nd0mUidHere bookkeeper
```

---

## Deployment

### Railway / Render / Fly.io

1. Set environment variables in your hosting dashboard.
2. For `FIREBASE_SERVICE_ACCOUNT_BASE64`, generate it locally:
   ```bash
   base64 -i serviceAccountKey.json | tr -d '\n'
   ```
   Then paste the output as the env var value.
3. Set `NODE_ENV=production`.
4. The start command is `npm start`.

### Google Cloud Run

The app is stateless and works perfectly on Cloud Run.  
When deployed to GCP, you can omit the service account env vars entirely and use **Application Default Credentials** instead.

---

## Project Structure

```
jjmc-payroll-backend/
├── server.js                  # Express entry point
├── package.json
├── .env.example               # Copy to .env
├── .gitignore
│
├── middleware/
│   ├── auth.js                # Verifies Firebase ID token → req.user
│   └── roleGuard.js           # requireRole(...roles) factory
│
├── routes/
│   ├── users.js               # User profiles & role assignment
│   ├── clients.js             # Client companies & bookkeeper assignment
│   ├── payroll.js             # Calculations, drafts, approval workflow
│   ├── inquiries.js           # Inquiry forum + message subcollection
│   ├── notifications.js       # Per-user notifications
│   └── tutorials.js           # Tutorial video metadata
│
├── utils/
│   ├── firebaseAdmin.js       # Admin SDK init (singleton)
│   └── payrollCalculations.js # PH deduction logic (SSS, PhilHealth, HDMF, BIR)
│
└── scripts/
    └── setRole.js             # CLI: node scripts/setRole.js <uid> <role>
```
