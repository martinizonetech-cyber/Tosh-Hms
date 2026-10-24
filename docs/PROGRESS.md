# Tosh Clinic HMS - Progress Log

## Summary
- Backend: FastAPI, SQLAlchemy 2.0 (async), PostgreSQL, Alembic, Pydantic v2
- Frontend: React 18, React Router v6, TailwindCSS, Zod
- Operating Mode: Hybrid (API and Mock selectable via VITE_DATA_MODE)

## Progress Overview

- [x] **Phase 1-3:** Foundation, Auth/RBAC, Patients, Appointments, Queue, Check-in, Visits (30 tests passing, Alembic migrations clean).
- [x] **Part 0:** Close Phase 3 gaps
  - [x] Duplicate check on `POST /patients` (409 POSSIBLE_DUPLICATE with details; ?force=true override)
  - [x] Appointment double-booking rejection (409 CONFLICT), reject past startsAt (422 PAST_APPOINTMENT_TIME), doctor belongs to department check (422 INVALID_DOCTOR_DEPARTMENT)
  - [x] `patientId` query filter on `GET /appointments` and `GET /queue`
  - [x] Queue items include derived paymentStatus (Paid/Partial/Due) and vitals
  - [x] Patient sub-resource aliases (`/patients/{id}/appointments`)
  - [x] LIVE verification on port 4000: Full flow tested with real HTTP requests (reception login -> register -> duplicate 409 rejection -> appointment -> check in -> queue query -> patch to Consulting -> view visit -> skin doctor 403 on orthopaedics data)
  - [x] Quality gates: Ruff 0 errors, Mypy 0 errors across 58 files, Alembic check 0 drift, 33 pytest tests passing.
- [x] **Part 1 (Phase 4):** Consultations, Vitals, Documents
  - [x] `GET /visits/{visitId}/consultation` & `PUT /visits/{visitId}/consultation`: RBAC (doctor of department only writes; reception gets read-only vitals/summary; 403 on other depts), atomic replacement of prescription array, optimistic concurrency via `version` (409 CONFLICT on stale version), Finalized state locks edits (409 VISIT_LOCKED) with doctor reopening (`status="Draft"` audited as `CONSULTATION_REOPEN`), server never generates/suggests prescriptions, persists painLocation, side, bodyRegionTemplate (JSONB), followUpDate, updates `patient.latestVisitAt`.
  - [x] `PATCH /visits/{visitId}/vitals`: doctor or reception, attributed to actor and timestamped.
  - [x] Documents: `POST /documents` (multipart: patientId, category, file, optional visitId), `GET /patients/{patientId}/documents` (paginated, department access checked), `DELETE /documents/{id}` (soft delete). File validation: max 25MB, magic byte checks (JPEG, PNG, WEBP, PDF; 422 FILE_REJECTED on invalid), random storage keys, `StorageService` interface with `LocalStorageService` (HMAC-SHA256 signed URL <= 5 min) and `S3StorageService`, download route `/documents/files/{key}`.
  - [x] Audit rows: `CONSULTATION_READ`, `CONSULTATION_SAVE`, `CONSULTATION_FINALIZE`, `CONSULTATION_REOPEN`, `VITALS_UPDATE`, `DOCUMENT_UPLOAD`, `DOCUMENT_LIST_READ`, `DOCUMENT_DELETE`.
  - [x] Prescription images: uses document storage and signed URLs.
  - [x] Quality gates: Ruff 0 errors, Mypy 0 errors across 63 files, Alembic check 0 drift, 37 pytest tests passing.
- [x] **Part 2 (Phase 5):** Billing & Payments Ledger, Catalog, Fees
  - [x] `GET /invoices`: (department, status, patientId, page, pageSize) with computed total, paid, balance, status.
  - [x] `POST /invoices/{id}/payments`: amount > 0 and <= balance, valid method, `Idempotency-Key` header with deduplication, `SELECT ... FOR UPDATE` row-locking on the invoice, append-only payments, updates queue entry's derived paymentStatus.
  - [x] `POST /invoices/{id}/refunds`: reception only, audited (`INVOICE_REFUND`), amount <= paid, append-only without modifying/deleting payments.
  - [x] `POST /visits/{visitId}/charges`: doctor of department only, amount > 0, addedBy from current user, re-reads price from server catalog if catalogItemId referenced, allowed after finalization (re-opens balance).
  - [x] `GET /settings/fees` & `PUT /settings/fees/{department}`: reception only updates, affects new visits only without modifying existing invoices.
  - [x] `GET/POST/PUT/DELETE /catalog/charges`: doctors read, reception writes, DELETE deactivates (`is_active = False`). Seeded from default catalog.
  - [x] Quality gates: Ruff 0 errors, Mypy 0 errors across 69 files, Alembic check 0 drift, 43 pytest tests passing.
- [x] **Part 3 (Phase 6):** Follow-ups, Reminders, Reports, Templates, Dashboard
  - [x] `GET/POST /follow-ups` & `PATCH /follow-ups/{id}`: status, date, note, reminderAction (`queue` / `send`), dynamically computed Overdue status when date < today in IST, patientId and department filters.
  - [x] Saving a consultation with `followUpDate` auto-creates/updates the linked follow-up (`source_visit_id = visit.id`).
  - [x] Reminder actions record `reminder_logs` audit trail and set `reminderStatus="Queued"`.
  - [x] `NotificationProvider` interface with `NoopProvider` default; status becomes `"Sent"` only upon provider confirmation.
  - [x] Scheduled background task (`APScheduler` in `app/services/scheduler.py` wired to FastAPI lifespan) to process due reminders ("two days before" and "on date") in IST timezone.
  - [x] `GET /reports/summary?from=&to=&department=`: Computed in SQL in IST days returning exact `ReportSummary` contract shape (registrations, appointments, completedVisits, walkIns, collections, outstandingBalance, followUpCompletion, paymentMethods, daily, departmentActivity); doctors restricted to own department.
  - [x] `GET /dashboard/summary?department=`: Returns today's live counters (waitingCount, consultingCount, completedCount, appointmentsCount, collections, followUpsCount).
  - [x] `GET/PUT /templates/body-regions`: Seeded from default clinical templates (Knee, Shoulder, Hip, Spine, Elbow, Wrist, Ankle, Foot, Other); orthopaedics doctor writes.
  - [x] Quality gates: Ruff 0 errors, Mypy 0 errors across 76 files, Alembic check 0 drift, 47 pytest tests passing.
- [x] **STEP 2A: Backend Proof & Gap Resolution:**
  - [x] Verified full 20-step HTTP flow against live database on port 4000.
  - [x] Item 1: `NoopProvider` delivery confirmation returns `(False, None)`. Default provider leaves reminderStatus at `"Queued"` and never `"Sent"` without real provider confirmation.
  - [x] Item 2: RBAC permissions locked on `POST /patients`, `POST /appointments`, `POST /queue` (reception-only, 403 for doctors). `PATCH /appointments` restricted so doctors can only advance their own department's appointments to `"In progress"` or `"Completed"`.
  - [x] Item 3: Concurrency tests: parallel payment test fires 5 requests via `asyncio.gather` against invoice with balance smaller than sum; parallel refund test fires 2 requests exceeding net paid. Guaranteed via PostgreSQL row locking (`SELECT ... FOR UPDATE OF invoices`) and `get_invoice_lock`.
  - [x] Item 4: Invalid queue and appointment transitions raise 409 `INVALID_TRANSITION`.
  - [x] Item 5: Matrix gaps verified and tested (401, 403 wrong role, 403 clinician department scoping on lists, 404, 409, 503 database unreachable).
  - [x] Quality gates: Ruff 0 errors, Mypy 0 errors across 76 files, Alembic check 0 drift, **67 pytest tests passing** (100% pass rate).
- [x] **Part 5 (Phase 8 / STEP 2B):** Frontend wiring (4 Checkpoints)
  - [x] Checkpoint 1: Data layer + auth (Repository pattern decided in DECISIONS.md, in-memory JWT, httpOnly cookie silent refresh, 401 retry interceptor, dynamic doctors from /doctors, role route guarding, password auto-fill removed in API mode, verified with real login). Forced password change implemented and verified.
  - [x] Checkpoint 2: Reception portal (Dashboard with GET /dashboard/summary, Queue with vitals and server-allocated tokens, Appointments with 409 conflict handling, Patient Directory with server pagination and profile tabs, Billing with Idempotency-Key and printable records, truthful 'Queued' reminder status, Reports summary, Settings fees).
  - [x] Checkpoint 3: Skin doctor portal (Scoped dashboard & appointments, scoped patients, Consultation workspace with optimistic concurrency versioning, Finalized lock, Reopen capability, signed document uploads, procedure billing).
  - [x] Checkpoint 4: Orthopaedics doctor portal + cleanup (Body Region Templates page & clinical templates wired to API in API mode, localStorage replaced for API mode, doctor dropdowns from /doctors everywhere).
  - [x] Part E: Contract changes (ReminderStatus 'Sent', document `url`, server-computed invoice fields, Consultation.id = visit ID).
  - [x] Part F: Final verification (Ruff 0 errors, Mypy 0 errors across 76 files, Alembic check 0 drift, 68 pytest tests on PostgreSQL passing, frontend npm run build passing, real browser Playwright E2E 27/27 assertions passing).
  - [x] Resolved 409 Conflict (`VISIT_LOCKED`) on `PUT /visits/VIS-1001/consultation`:
    - Loaded existing consultation on component mount via `repository.getConsultation(targetVisitId)`.
    - Enforced legal clinical lock in UI: displayed finalized warning banner, disabled direct draft saves/finalization when locked, and channeled edits through explicit `reopen()` action (`status: "Draft"` with latest version).
    - Added `getConsultation` to `demoRepository` for mock mode parity.

