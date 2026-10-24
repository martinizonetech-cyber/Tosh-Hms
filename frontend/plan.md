# Implementation Plan — Skin & Orthopaedics Hospital Management System

## Scope and implementation approach

Deliver a React + TypeScript + Vite frontend using Tailwind CSS, React Router, Lucide React, Recharts, React Hook Form, Zod, date-fns, and restrained Framer Motion transitions. The workspace was initialized empty. The product is frontend-only: no server, database, real authentication, payment gateway, or real messaging. Clearly labeled demo sign-in and fictional data support a complete interactive demonstration. A shared typed mock repository will power Reception, Skin Doctor, and Orthopaedic Doctor so patient, queue, appointment, consultation, charges, payments, and follow-ups remain consistent across portals. A separate typed API client/repository contract will make backend replacement straightforward and will not silently switch to mock data when API mode fails.

Implement incrementally as independently usable feature areas rather than one large component. Start with a mobile-first application shell, role/department layouts, shared components, route map and accessible interaction patterns. Build the Reception workflow, then both doctor workspaces and orthopaedic templates, then documents/print/billing/follow-ups/reports and API documentation. Use fictional demo data only, label simulated actions, and do not treat frontend role visibility or file checks as security controls.

## Design direction

Three low-probability directions considered: Quiet clinical modernism (0.07); Swiss editorial healthcare (0.05); warm hospitality-led clinic (0.03). **Selected: Swiss editorial healthcare**, adapted to the exact supplied brand palette and premium, calm clinical tone.

- **Design movement:** contemporary Swiss editorial design translated into a modern specialty-clinic operations tool.
- **Core principles:** clear information hierarchy; calm, high-contrast surfaces; clinical precision without sterile density; responsive, action-first workflows.
- **Color philosophy:** use the exact navy `#17324D`, teal `#177E89`, pale blue `#EAF3F5`, white `#FFFFFF`, page `#F5F7FA`, text `#263238`, secondary `#64748B`, and border `#DCE5E9`. Navy anchors trust and navigation; teal marks primary actions and progress; pale blue supports quiet section emphasis. Status must also have text/icons, not color alone.
- **Layout paradigm:** a branded left navigation rail and compact utility header frame a readable working canvas; desktop clinical work can use a patient-summary rail beside a focused consultation form, while mobile uses a drawer and stacked cards/sheets.
- **Signature elements:** a restrained teal clinical-rule accent; softly rounded white record surfaces with fine borders; a decorative clinic-photo panel with navy overlay in the sidebar and a reliable fallback.
- **Interaction philosophy:** make primary actions obvious, preserve context during patient workflows, give confirmation for destructive actions, and show explicit success/error/demo feedback.
- **Animation:** short purposeful drawer/modal and state transitions only; respect `prefers-reduced-motion` and avoid animated dashboard decoration.
- **Typography:** DM Sans for UI and labels, with Lora reserved for selected page/print headings; keep tabular data and clinical forms highly legible.
- **Brand essence:** a calm, dependable operating workspace for a two-specialty hospital; precise, reassuring, human.
- **Brand voice:** concise and clear. Example lines: “Today’s care, at a glance.” “Demo reminder queued — no message was sent.”
- **Wordmark & logo:** editable hospital-name placeholder with a compact geometric medical cross/paired-arc mark usable in the sidebar and print header; no real hospital identity is implied.
- **Signature brand color:** Medical Teal `#177E89`, always paired with navy/neutral structure rather than used as a large saturated field.

## Application structure

- `src/app/`: application bootstrap, route definitions, role/portal providers, and top-level navigation.
- `src/components/ui/`: reusable accessible buttons, form controls, cards, badges, dialogs/sheets, tables, tabs, empty/loading/error states.
- `src/components/layout/`: sidebar/drawer, utility header, breadcrumbs, profile/logout, portal shell.
- `src/features/reception/`: dashboard, queue, appointments, patient directory/profile, billing/invoices, follow-ups, reports, settings.
- `src/features/skin-doctor/` and `src/features/ortho-doctor/`: department dashboards, patient/appointment views, consultation workspaces, prescriptions/procedures; orthopaedics also owns body-region templates.
- `src/features/consultations/`, `patients/`, `appointments/`, `queue/`, `billing/`, `follow-ups/`, `reports/`, `documents/`: shared domain screens and reusable workflow components where they serve both portals.
- `src/services/repositories/`: typed repository interfaces and mode selection; `src/services/mock/`: shared in-memory/local demo adapter; `src/services/api/`: typed HTTP client, base URL from Vite environment, request/response contracts, and common errors.
- `src/types/`, `src/schemas/`, `src/hooks/`, `src/utils/`, `src/styles/`: domain types, Zod schemas, shared hooks, formatting/ID helpers, print CSS and design tokens.
- `public/manus-routes.json`: static manifest listing the complete page-route set before the first dev-server start.
- Root documentation: `API_INTEGRATION.md` for endpoint/workflow contracts and `.env.example` for browser-safe API-mode configuration only.

## Feature outcomes

1. **Role entry and shared shell:** responsive branded navigation and separate Reception, Skin, and Orthopaedic layouts; labeled demo sign-in; accessible keyboard/focus states; desktop collapse and mobile drawer; decorative sidebar photo fallback.
2. **Reception operations:** dashboard metrics/charts; existing/new patient registration and search; queue creation and filters; appointment scheduling/rescheduling/cancellation/check-in/no-show; patient directory, responsive profiles/tabs and history.
3. **Clinical portals:** Skin and Orthopaedic dashboards, appointments, patients, consultation workspace with appropriate clinical sections and reception vitals; draft/final UI; editable clinician-entered assessment, diagnosis, plans and prescriptions; procedure charges and follow-ups; configurable body-region templates and A4 print views.
4. **Documents and print:** validated mock upload of configured types, categorization, supported browser previews, open/download/remove; dedicated document service; printable consultation, prescription, body-region and follow-up documents; print-specific CSS.
5. **Billing, follow-ups and reports:** configurable fee catalog, shared treatment charges, itemized invoice, partial/full mock payments across listed methods, balances, printable invoice/receipt; follow-up states/reminders and explicit mock WhatsApp feedback; date/department filtered responsive reports.
6. **Backend handoff and demo integrity:** one consistent shared mock state across portals, reset-demo-data control, explicit mock/API modes, typed replaceable repositories and HTTP error handling, API contract document, no server/backend/database implementation, no real personal/medical data.
7. **Responsive quality and delivery:** adapt dashboards, forms, tables, patient details, clinical workspaces, dialogs, invoice/prescription previews and calendars for the requested mobile/tablet/desktop widths; maintain no unintended horizontal page scroll and include accessible loading, empty, validation, error and destructive-confirmation states.

## Build workflow

After approval, create `TODO.md` with the full outcome criteria carried forward from the brief. Confirm Sandbox TypeScript diagnostics through the WebDev config, pin the package manager and explicitly review lifecycle-script permissions before installing, then set up Vite/React/TypeScript/Tailwind and the requested dependencies. Implement the route manifest before starting the dev server. Build feature groups in the order above, keep source modular, and run production builds after each major phase. Start the managed Preview on its initialized runtime port once meaningful screens exist; verify the route manifest and build, inspect the available diagnostics, and resolve actionable issues. Before handoff, compare implemented outcomes against the brief, document complete versus remaining scope in `TODO.md`, and provide the project/Preview in the Manus workspace. Do not publish unless separately authorized by the project's existing publishing configuration/user request.
