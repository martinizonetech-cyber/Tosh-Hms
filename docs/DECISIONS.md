# Architectural & Design Decisions

## 1. Wire Contract & Data Conventions
- JSON wire format: camelCase with Pydantic `alias_generator=to_camel` and `populate_by_name=True`.
- Monetary values: Rupee numbers on the wire (e.g. 700.0 or 700), stored as integer paise in PostgreSQL (e.g. 70000).
- Identifiers: User-visible display IDs formatted as `PT-####`, `APT-####`, `VIS-####`, `Q-####`, `INV-####`, `FU-####`, `DOC-####`, `CHG-####`.
- Departments & Roles: strictly lowercase: `"skin" | "orthopaedics"` and `"reception" | "skin" | "orthopaedics"`.

## 2. Part 0 Gap Resolutions
- **Duplicate patient check:** Checked by case-insensitive matching of `fullName` and trimmed matching of `phone`. If a match is found and `force` is not `true`, returns HTTP 409 `POSSIBLE_DUPLICATE` with existing patient ID and details.
- **Appointment double-booking & validation:** Check doctor department matches appointment department (422 if mismatched). Check `startsAt` is not in past (422). Check if doctor has another non-cancelled appointment at the exact `startsAt` (409 CONFLICT).
- **Patient ID filter:** Added `patientId` query param to `/appointments` and `/queue`.
- **Payment status derivation in Queue:** Derived dynamically from linked Visit's Invoice (Paid if balance <= 0, Partial if paid > 0 and balance > 0, Due if paid == 0).

## 3. Status Transition Exception Codes and Concurrency Protection
- **Invalid Transitions:** Transitions violating appointment (`VALID_TRANSITIONS`) or queue (`VALID_QUEUE_TRANSITIONS`) state machines return HTTP 409 `INVALID_TRANSITION` (rather than 422, which is reserved strictly for schema validation errors).
- **Concurrency & Parallel Payments/Refunds:** Authoritatively protected at the database level via PostgreSQL row-locking (`SELECT ... FOR UPDATE OF invoices` in `find_invoice_by_id(for_update=True)`) inside the same transaction that reads the invoice balance/refunds and writes the ledger. Verified across separate database connections with `get_invoice_lock` disabled (100% prevention of overpayments and over-refunds across multiple uvicorn workers). `get_invoice_lock` is maintained purely as an in-process defense-in-depth optimization and test environment support.
- **NoopProvider Notification Delivery:** `NoopProvider` returns `(False, None)`. When using the default notification provider, reminder status remains `'Queued'` and never transitions to `'Sent'` without delivery confirmation from a live external provider.
- **Reception-Only Registration & Queueing:** `POST /patients`, `POST /appointments`, `POST /queue` are strictly reception-only (doctors get 403 `FORBIDDEN`). Doctors can only update their own department's appointments to `'In progress'` or `'Completed'`.

## 4. Frontend Data Layer Architecture (Checkpoint 1)
- **Pattern:** Repository Pattern with Unified Context Provider (`HospitalRepository` + `ApiProvider` / `DemoProvider`).
- **Rationale:** Decouples UI components from persistence mechanisms, strictly supporting both `VITE_DATA_MODE=api` (live backend communication) and `VITE_DATA_MODE=mock` (in-memory demo store) via the identical `useHospitalData()` signature.
- Authentication & Security:
  - In-memory JWT access token storage (no tokens in `localStorage` or `sessionStorage`).
  - Silent token refresh using `httpOnly` rotating refresh cookies via `attemptTokenRefresh()` in `httpClient.ts`.
  - Automated 401 interceptor retrying failed requests once after refreshing.
  - Role-based route protection (`RouteGuard`) directing staff to `/reception`, `/skin`, or `/ortho` according to token claims.
  - Doctor dropdown dynamically populated from `GET /api/v1/doctors` rather than hardcoded lists.
  - Password auto-fill disabled in API mode.
  - Enforced `must_change_password` flag at first login with `POST /api/v1/auth/change-password` (argon2id hash, token revocation, audit logging).
  - Dev cookie/CORS: origin `http://localhost:3000`, API `http://localhost:4000`, `credentials: 'include'`, exact origin CORS with `allow_credentials=True`. Production requires HTTPS `Secure` cookies with `SameSite=Lax` or `Strict` and matched production domain.

## 5. Part E Contract Harmonization
- **ReminderStatus:** Replaced `'Sent (demo)'` with `'Sent'` across frontend domain types and backend models. A `(demo)` badge label is retained solely in mock mode.
- **PatientDocument & PrescriptionImage:** Added optional `url?: string` to support backend signed download URLs while preserving `dataUrl?: string` for mock mode.
- **Invoice:** Total, paid, balance, and status are authoritative server-computed fields. `patientInvoiceTotals()` consumes server values when present and safely handles undefined arrays.
- **Consultation.id:** Documented and enforced as identical to the Visit ID (`VIS-####`).

## 6. Checkpoint 2-4 Frontend Portals
- **Reception Portal:** Fully wired to live API (Dashboard via `GET /dashboard/summary`, Queue with vitals and server tokens, Appointments with conflict handling, Patient Directory with server pagination and profile tabs, Billing with `Idempotency-Key` and print templates, Follow-ups with truthful 'Queued' state, Reports via `GET /reports/summary`, Settings via `GET/PUT /settings/fees`).
- **Doctor Portals (Skin & Orthopaedics):** Fully wired to live API (scoped Dashboard and Appointments, scoped Patients, Consultation workspace with optimistic concurrency versioning, Finalized lock, Reopen capability, signed document uploads, procedure billing via `/catalog/charges`).
- **Orthopaedics Body Region Templates:** Migrated off `localStorage` in API mode to `GET/PUT /templates/body-regions`. Templates prefill clinical text; prescriptions require explicit doctor confirmation.
