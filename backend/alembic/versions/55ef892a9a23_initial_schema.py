"""initial_schema

Revision ID: 55ef892a9a23
Revises: 
Create Date: 2026-10-23 18:00:27.261456

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '55ef892a9a23'
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JsonType = postgresql.JSONB().with_variant(sa.JSON(), "sqlite")
UuidType = postgresql.UUID(as_uuid=True).with_variant(sa.String(36), "sqlite")


def upgrade() -> None:
    # 1. users
    op.create_table(
        "users",
        sa.Column("id", UuidType, primary_key=True),
        sa.Column("email", sa.String(120), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(30), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("department", sa.String(30), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"])

    # 2. doctors
    op.create_table(
        "doctors",
        sa.Column("id", UuidType, primary_key=True),
        sa.Column("user_id", UuidType, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("department", sa.String(30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_doctors_department", "doctors", ["department"])

    # 3. refresh_tokens
    op.create_table(
        "refresh_tokens",
        sa.Column("id", UuidType, primary_key=True),
        sa.Column("user_id", UuidType, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("replaced_by", UuidType, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
    op.create_index("ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"])

    # 4. patients
    op.create_table(
        "patients",
        sa.Column("id", UuidType, primary_key=True),
        sa.Column("display_id", sa.String(30), nullable=False, unique=True),
        sa.Column("full_name", sa.String(100), nullable=False),
        sa.Column("date_of_birth", sa.String(20), nullable=False),
        sa.Column("gender", sa.String(30), nullable=False),
        sa.Column("phone", sa.String(30), nullable=False),
        sa.Column("email", sa.String(120), nullable=True),
        sa.Column("address", sa.String(255), nullable=False),
        sa.Column("emergency_contact", sa.String(60), nullable=True),
        sa.Column("registered_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("latest_visit_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_patients_display_id", "patients", ["display_id"])
    op.create_index("ix_patients_phone", "patients", ["phone"])
    op.create_index("ix_patients_full_name", "patients", ["full_name"])

    # 5. appointments
    op.create_table(
        "appointments",
        sa.Column("id", UuidType, primary_key=True),
        sa.Column("display_id", sa.String(30), nullable=False, unique=True),
        sa.Column("patient_id", UuidType, sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("department", sa.String(30), nullable=False),
        sa.Column("doctor_id", UuidType, sa.ForeignKey("doctors.id"), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("visit_type", sa.String(30), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="Scheduled"),
        sa.Column("created_by", UuidType, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_appointments_display_id", "appointments", ["display_id"])
    op.create_index("ix_appointments_patient_id", "appointments", ["patient_id"])
    op.create_index("ix_appointments_department", "appointments", ["department"])
    op.create_index("ix_appointments_doctor_id", "appointments", ["doctor_id"])
    op.create_index("ix_appointments_starts_at", "appointments", ["starts_at"])
    op.create_index("ix_appointments_status", "appointments", ["status"])

    # 6. visits
    op.create_table(
        "visits",
        sa.Column("id", UuidType, primary_key=True),
        sa.Column("display_id", sa.String(30), nullable=False, unique=True),
        sa.Column("patient_id", UuidType, sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("department", sa.String(30), nullable=False),
        sa.Column("doctor_id", UuidType, sa.ForeignKey("doctors.id"), nullable=False),
        sa.Column("appointment_id", UuidType, sa.ForeignKey("appointments.id"), nullable=True),
        sa.Column("queue_entry_id", UuidType, nullable=True),
        sa.Column("visit_type", sa.String(30), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_visits_display_id", "visits", ["display_id"])
    op.create_index("ix_visits_patient_id", "visits", ["patient_id"])
    op.create_index("ix_visits_department", "visits", ["department"])
    op.create_index("ix_visits_doctor_id", "visits", ["doctor_id"])

    # 7. queue_entries
    op.create_table(
        "queue_entries",
        sa.Column("id", UuidType, primary_key=True),
        sa.Column("display_id", sa.String(30), nullable=False, unique=True),
        sa.Column("token", sa.String(20), nullable=False),
        sa.Column("visit_id", UuidType, sa.ForeignKey("visits.id", ondelete="CASCADE"), nullable=False),
        sa.Column("patient_id", UuidType, sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("department", sa.String(30), nullable=False),
        sa.Column("doctor_id", UuidType, sa.ForeignKey("doctors.id"), nullable=False),
        sa.Column("arrival_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("status", sa.String(30), nullable=False, server_default="Waiting"),
        sa.Column("visit_type", sa.String(30), nullable=False, server_default="New"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_queue_entries_display_id", "queue_entries", ["display_id"])
    op.create_index("ix_queue_entries_visit_id", "queue_entries", ["visit_id"])
    op.create_index("ix_queue_entries_department", "queue_entries", ["department"])
    op.create_index("ix_queue_entries_status", "queue_entries", ["status"])

    # 8. daily_token_counters
    op.create_table(
        "daily_token_counters",
        sa.Column("department", sa.String(30), primary_key=True),
        sa.Column("date", sa.Date(), primary_key=True),
        sa.Column("current_number", sa.Integer(), nullable=False, server_default="0"),
    )

    # 9. vitals
    op.create_table(
        "vitals",
        sa.Column("id", UuidType, primary_key=True),
        sa.Column("visit_id", UuidType, sa.ForeignKey("visits.id", ondelete="CASCADE"), nullable=False),
        sa.Column("blood_pressure", sa.String(30), nullable=False, server_default=""),
        sa.Column("pulse", sa.String(30), nullable=False, server_default=""),
        sa.Column("temperature", sa.String(30), nullable=False, server_default=""),
        sa.Column("height", sa.String(30), nullable=False, server_default=""),
        sa.Column("weight", sa.String(30), nullable=False, server_default=""),
        sa.Column("oxygen_saturation", sa.String(30), nullable=False, server_default=""),
        sa.Column("entered_by", UuidType, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("entered_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_vitals_visit_id", "vitals", ["visit_id"])

    # 10. consultations
    op.create_table(
        "consultations",
        sa.Column("id", UuidType, primary_key=True),
        sa.Column("visit_id", UuidType, sa.ForeignKey("visits.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("patient_id", UuidType, sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("department", sa.String(30), nullable=False),
        sa.Column("symptoms", sa.Text(), nullable=False, server_default=""),
        sa.Column("medical_history", sa.Text(), nullable=False, server_default=""),
        sa.Column("allergies", sa.Text(), nullable=False, server_default=""),
        sa.Column("examination", sa.Text(), nullable=False, server_default=""),
        sa.Column("assessment", sa.Text(), nullable=False, server_default=""),
        sa.Column("diagnosis", sa.Text(), nullable=False, server_default=""),
        sa.Column("treatment_plan", sa.Text(), nullable=False, server_default=""),
        sa.Column("follow_up_date", sa.String(20), nullable=True),
        sa.Column("pain_location", sa.String(100), nullable=True),
        sa.Column("side", sa.String(30), nullable=True),
        sa.Column("body_region_template", JsonType, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="Draft"),
        sa.Column("finalized_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finalized_by", UuidType, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_consultations_visit_id", "consultations", ["visit_id"])
    op.create_index("ix_consultations_patient_id", "consultations", ["patient_id"])
    op.create_index("ix_consultations_department", "consultations", ["department"])
    op.create_index("ix_consultations_status", "consultations", ["status"])

    # 11. prescription_items
    op.create_table(
        "prescription_items",
        sa.Column("id", UuidType, primary_key=True),
        sa.Column("display_id", sa.String(30), nullable=False),
        sa.Column("consultation_id", UuidType, sa.ForeignKey("consultations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("medicine_name", sa.String(200), nullable=False),
        sa.Column("strength", sa.String(100), nullable=False, server_default=""),
        sa.Column("dosage", sa.String(100), nullable=False, server_default=""),
        sa.Column("route", sa.String(50), nullable=False, server_default=""),
        sa.Column("frequency", sa.String(100), nullable=False, server_default=""),
        sa.Column("duration", sa.String(100), nullable=False, server_default=""),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_prescription_items_consultation_id", "prescription_items", ["consultation_id"])

    # 12. invoices
    op.create_table(
        "invoices",
        sa.Column("id", UuidType, primary_key=True),
        sa.Column("display_id", sa.String(30), nullable=False, unique=True),
        sa.Column("visit_id", UuidType, sa.ForeignKey("visits.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("patient_id", UuidType, sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("department", sa.String(30), nullable=False),
        sa.Column("visit_label", sa.String(150), nullable=False),
        sa.Column("consultation_fee", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_invoices_display_id", "invoices", ["display_id"])
    op.create_index("ix_invoices_visit_id", "invoices", ["visit_id"])
    op.create_index("ix_invoices_patient_id", "invoices", ["patient_id"])
    op.create_index("ix_invoices_department", "invoices", ["department"])

    # 13. invoice_charges
    op.create_table(
        "invoice_charges",
        sa.Column("id", UuidType, primary_key=True),
        sa.Column("display_id", sa.String(30), nullable=False),
        sa.Column("invoice_id", UuidType, sa.ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("description", sa.String(255), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("added_by", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_invoice_charges_invoice_id", "invoice_charges", ["invoice_id"])

    # 14. payments
    op.create_table(
        "payments",
        sa.Column("id", UuidType, primary_key=True),
        sa.Column("display_id", sa.String(30), nullable=False),
        sa.Column("invoice_id", UuidType, sa.ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("method", sa.String(30), nullable=False),
        sa.Column("transaction_reference", sa.String(100), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("recorded_by", UuidType, sa.ForeignKey("users.id"), nullable=True),
    )
    op.create_index("ix_payments_invoice_id", "payments", ["invoice_id"])

    # 15. refunds
    op.create_table(
        "refunds",
        sa.Column("id", UuidType, primary_key=True),
        sa.Column("display_id", sa.String(30), nullable=False),
        sa.Column("invoice_id", UuidType, sa.ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(255), nullable=False),
        sa.Column("refunded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("recorded_by", UuidType, sa.ForeignKey("users.id"), nullable=True),
    )
    op.create_index("ix_refunds_invoice_id", "refunds", ["invoice_id"])

    # 16. follow_ups
    op.create_table(
        "follow_ups",
        sa.Column("id", UuidType, primary_key=True),
        sa.Column("display_id", sa.String(30), nullable=False, unique=True),
        sa.Column("patient_id", UuidType, sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("department", sa.String(30), nullable=False),
        sa.Column("doctor_id", UuidType, sa.ForeignKey("doctors.id"), nullable=False),
        sa.Column("date", sa.String(20), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="Upcoming"),
        sa.Column("reminder_status", sa.String(30), nullable=False, server_default="Not sent"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("source_visit_id", UuidType, sa.ForeignKey("visits.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_follow_ups_display_id", "follow_ups", ["display_id"])
    op.create_index("ix_follow_ups_patient_id", "follow_ups", ["patient_id"])
    op.create_index("ix_follow_ups_department", "follow_ups", ["department"])
    op.create_index("ix_follow_ups_date", "follow_ups", ["date"])
    op.create_index("ix_follow_ups_status", "follow_ups", ["status"])

    # 17. reminder_logs
    op.create_table(
        "reminder_logs",
        sa.Column("id", UuidType, primary_key=True),
        sa.Column("follow_up_id", UuidType, sa.ForeignKey("follow_ups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("channel", sa.String(30), nullable=False, server_default="whatsapp"),
        sa.Column("provider_message_id", sa.String(100), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="Queued"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_reminder_logs_follow_up_id", "reminder_logs", ["follow_up_id"])

    # 18. documents
    op.create_table(
        "documents",
        sa.Column("id", UuidType, primary_key=True),
        sa.Column("display_id", sa.String(30), nullable=False, unique=True),
        sa.Column("patient_id", UuidType, sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("visit_id", UuidType, sa.ForeignKey("visits.id"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("category", sa.String(100), nullable=False, server_default="General"),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("checksum", sa.String(64), nullable=False),
        sa.Column("uploaded_by", UuidType, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_documents_display_id", "documents", ["display_id"])
    op.create_index("ix_documents_patient_id", "documents", ["patient_id"])
    op.create_index("ix_documents_deleted_at", "documents", ["deleted_at"])

    # 19. fee_settings
    op.create_table(
        "fee_settings",
        sa.Column("id", UuidType, primary_key=True),
        sa.Column("department", sa.String(30), nullable=False, unique=True),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="INR"),
        sa.Column("updated_by", UuidType, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_fee_settings_department", "fee_settings", ["department"])

    # 20. charge_catalog
    op.create_table(
        "charge_catalog",
        sa.Column("id", UuidType, primary_key=True),
        sa.Column("display_id", sa.String(30), nullable=False, unique=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("price", sa.Integer(), nullable=False),
        sa.Column("unit", sa.String(100), nullable=True),
        sa.Column("department", sa.String(30), nullable=False, server_default="all"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_charge_catalog_display_id", "charge_catalog", ["display_id"])
    op.create_index("ix_charge_catalog_category", "charge_catalog", ["category"])
    op.create_index("ix_charge_catalog_department", "charge_catalog", ["department"])

    # 21. body_region_templates
    op.create_table(
        "body_region_templates",
        sa.Column("id", UuidType, primary_key=True),
        sa.Column("region", sa.String(100), nullable=False, unique=True),
        sa.Column("fields", JsonType, nullable=False),
        sa.Column("medications", JsonType, nullable=False),
        sa.Column("updated_by", UuidType, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_body_region_templates_region", "body_region_templates", ["region"])

    # 22. audit_log
    op.create_table(
        "audit_log",
        sa.Column("id", UuidType, primary_key=True),
        sa.Column("actor_user_id", UuidType, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("entity_type", sa.String(100), nullable=False),
        sa.Column("entity_id", sa.String(100), nullable=False),
        sa.Column("patient_id", UuidType, nullable=True),
        sa.Column("before_state", JsonType, nullable=True),
        sa.Column("after_state", JsonType, nullable=True),
        sa.Column("ip", sa.String(50), nullable=True),
        sa.Column("user_agent", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_audit_log_actor_user_id", "audit_log", ["actor_user_id"])
    op.create_index("ix_audit_log_action", "audit_log", ["action"])
    op.create_index("ix_audit_log_entity_type", "audit_log", ["entity_type"])
    op.create_index("ix_audit_log_created_at", "audit_log", ["created_at"])


def downgrade() -> None:
    op.drop_table("audit_log")
    op.drop_table("body_region_templates")
    op.drop_table("charge_catalog")
    op.drop_table("fee_settings")
    op.drop_table("documents")
    op.drop_table("reminder_logs")
    op.drop_table("follow_ups")
    op.drop_table("refunds")
    op.drop_table("payments")
    op.drop_table("invoice_charges")
    op.drop_table("invoices")
    op.drop_table("prescription_items")
    op.drop_table("consultations")
    op.drop_table("vitals")
    op.drop_table("daily_token_counters")
    op.drop_table("queue_entries")
    op.drop_table("visits")
    op.drop_table("appointments")
    op.drop_table("patients")
    op.drop_table("refresh_tokens")
    op.drop_table("doctors")
    op.drop_table("users")
