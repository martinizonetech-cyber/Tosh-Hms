# API integration contract

This React frontend is currently configured for fictional demo data. No server, database, payment gateway, authentication server, secure document store, or messaging integration is included. The API client in `src/services/api` is a replaceable HTTP boundary. Set `VITE_DATA_MODE=api` and `VITE_API_BASE_URL` only after a backend implements these contracts. API errors remain explicit; the client never silently falls back to mock data. All identifiers and user-entered clinical fields below are illustrative request/response shapes, not prescriptions or clinical recommendations.

## Conventions

Requests and responses use JSON with UTF-8 encoding. Successful list endpoints return `{ items, page, pageSize, total }`. Errors should return a non-2xx status and `{ code, message, details? }`. The frontend's typed HTTP client raises an `ApiRequestError` on network or API failures. The backend owns authentication, authorization, input validation, authoritative patient IDs, persistence, file security, audit history, payment reconciliation, notification delivery, and business rules. Frontend role-based navigation and browser-side file checks are not security boundaries.

The browser-safe API origin is configured through `VITE_API_BASE_URL`; no backend URL is hard-coded. API mode should be used only over an authenticated, authorized backend. Do not store credentials, session tokens, or real medical records in local storage. Never enable an implicit mock fallback on production API errors.

## Expected operations

| Operation | Request fields | Response fields | Workflow owner |
| --- | --- | --- | --- |
| `GET /patients?query=&department=&page=&pageSize=` | Optional search query, department, page, page size | `PaginatedResponse<Patient>` with `items`, `page`, `pageSize`, `total`; each patient includes server-assigned `id`, `fullName`, `dateOfBirth`, `gender`, `phone`, optional `email`, `address`, optional `emergencyContact`, departments and visit timestamps | Backend owns patient search, authorization and IDs; Reception owns registration/search UI; doctor portals consume authorized patient records |
| `POST /patients` | `fullName`, `dateOfBirth`, `gender`, `phone`, optional `email`, `address`, optional `emergencyContact`, `department` | Created `Patient` with authoritative ID and registration metadata | Reception submits patient registration; backend validates and persists |
| `GET /appointments?department=&date=&status=&page=&pageSize=` | Optional department/date/status and server-side paging | `PaginatedResponse<Appointment>` with patient ID, department, doctor, `startsAt`, `visitType`, optional note and status | Reception schedules and filters; relevant doctor reads the authorized schedule |
| `POST /appointments` | `patientId`, `department`, `doctor`, `startsAt`, `visitType`, optional `note` | Created `Appointment`, including server ID/status/timestamps | Reception owns scheduling; backend validates patient/doctor/availability |
| `PATCH /appointments/{appointmentId}` | Allowed status transition or changed `startsAt`/doctor/note | Updated `Appointment` | Reception owns reschedule, cancellation, check-in and no-show; backend enforces transitions and authorization |
| `GET /queue?department=&status=&date=` | Optional department/status/date filters | `PaginatedResponse<QueueEntry>` with token, patient, department, doctor, arrival time, queue/payment status | Reception creates and manages queue; relevant doctor reads assigned queue |
| `POST /queue` | `patientId`, `department`, `doctor`, `visitType`, optional note and reception-entered `vitals` (`bloodPressure`, `pulse`, `temperature`, `height`, `weight`, `oxygenSaturation`) | Created `QueueEntry` with server-assigned token, visit ID, status, arrival time and visit-linked vitals | Reception owns check-in/vitals capture/queue admission; backend owns token and visit-ID allocation, validation and audit attribution; the doctor reviews or edits vitals on that same visit |
| `PATCH /queue/{queueEntryId}` | Queue status such as `Waiting`, `Consulting`, or `Completed` | Updated `QueueEntry` | Reception and assigned clinician perform queue transitions; backend validates workflow |
| `GET /visits/{visitId}/consultation` | Server-issued visit ID | Authorized `Consultation`, including patient ID, department, vitals, symptoms, history, allergies, examination, assessment, diagnosis, treatment plan, prescription, documents, procedures, follow-up and status | Assigned doctor owns consultation review and edits; reception-entered vitals remain attributable in backend history and visit IDs prevent cross-visit ambiguity |
| `PUT /visits/{visitId}/consultation` | Server-issued visit ID plus editable clinical fields, doctor-entered prescription items, procedure charges, follow-up and `Draft`/`Finalized` state | Persisted `Consultation` with visit ID, server timestamps and audit metadata | Department doctor owns clinical text and explicit prescription decisions; backend persists and audits |
| `GET /invoices?department=&status=&page=&pageSize=` | Optional filters and pagination | `PaginatedResponse<Invoice>` with line items, fee, payment totals, balance and status | Reception owns billing display; doctor-created services reference the current visit |
| `POST /invoices/{invoiceId}/payments` | `amount`, payment method (`Cash`, `UPI`, `GPay`, `PhonePe`, `Card`, `Other`), optional transaction reference | Payment with server ID, paid timestamp, amount, method and updated invoice balance | Reception records payment; backend owns validation and ledger; no real payment gateway is provided by this frontend |
| `POST /visits/{visitId}/charges` | `description`, `amount`, clinician identity/context | Charge item associated with visit and updated invoice summary | Doctor adds a treatment/procedure charge; backend makes it available to Reception billing |
| `GET /follow-ups?department=&status=&dueBefore=` | Optional department/status/due-date filters | `PaginatedResponse<FollowUp>` with patient, department, doctor, date, status and reminder status | Reception and doctors review the shared follow-up schedule |
| `POST /follow-ups` | `patientId`, `department`, `doctor`, `date`, optional note | Created `FollowUp` with backend ID/status/reminder metadata | Doctor or Reception creates/reschedules follow-up; backend owns persistence |
| `PATCH /follow-ups/{followUpId}` | Status or reminder request/action metadata | Updated `FollowUp` and any backend-owned reminder record | Reception manages status and reminders; actual messaging is a separate future integration and must not be claimed unless confirmed by provider response |
| `POST /documents` / `GET /patients/{patientId}/documents` / `DELETE /documents/{documentId}` | Multipart upload with `patientId`, category, file; secure authorized read/delete | Document metadata with server ID, name, MIME type, size, category, upload time and authorized preview/download URL | Doctor uploads clinical files; backend validates content/size, stores securely and enforces patient-level access |
| `GET /reports/summary?from=&to=&department=` | Date range and optional department | Counts/series for registrations, appointments, completed visits, walk-ins, collections, methods, balances and follow-up completion | Reception requests authorized reports; backend owns authoritative financial and operational totals |

## Core frontend types

The source types live in `src/types/domain.ts`. `Patient`, `Appointment`, `QueueEntry`, `Invoice`, `Payment`, `Consultation`, `PrescriptionItem`, `PatientDocument`, `FollowUp`, `Department`, and their workflow statuses provide the initial shape. The backend may map these names to its own language/framework but should preserve semantic fields and documented state transitions.

## Demo-versus-API ownership

In mock mode, `DemoHospitalRepository` owns fictional in-memory state and optional browser-local continuity. A reception-created patient and queue entry, appointment check-in, doctor consultation edit, doctor-added charge, reception payment, and doctor-created follow-up are shared across the three frontend portals. Resetting demo data restores sample records. These records are not authoritative.

In API mode, the HTTP repository is the only network boundary. Failures surface as errors; they do not trigger demo data. A backend implementation must not trust client-generated demo IDs, roles, prices, totals, permissions, file validation, or status updates. It should assign authoritative IDs, validate each request, authorize every patient/department workflow, and retain appropriate audit records.


## Current API-mode status

The current interactive portals are implemented in fictional demo mode. The HTTP service and typed contracts are the backend integration boundary, but the feature pages are not yet wired to a live API repository. Until that adapter exists, `VITE_DATA_MODE=api` intentionally renders an explicit API-not-wired state and does not mount the mock data provider. This fail-closed guard prevents the interface from misrepresenting fictional records as live data. Do not set API mode in production until the backend is implemented, connected, and verified against the contracts above.
