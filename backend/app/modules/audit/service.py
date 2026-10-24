import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models import AuditLog


async def log_audit_event(
    db: AsyncSession,
    action: str,
    entity_type: str,
    entity_id: str,
    actor_user_id: uuid.UUID | None = None,
    patient_id: uuid.UUID | None = None,
    before_state: Any | None = None,
    after_state: Any | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        actor_user_id=actor_user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        patient_id=patient_id,
        before_state=before_state,
        after_state=after_state,
        ip=ip,
        user_agent=user_agent,
    )
    db.add(entry)
    return entry
