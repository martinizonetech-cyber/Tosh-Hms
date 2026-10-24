import uuid
from abc import ABC, abstractmethod

import structlog

logger = structlog.get_logger("tosh.notifications")


class NotificationProvider(ABC):
    @abstractmethod
    async def send_reminder(self, phone: str, message: str, kind: str) -> tuple[bool, str | None]:
        """Send reminder notification. Returns (success, provider_message_id)."""


class NoopProvider(NotificationProvider):
    async def send_reminder(self, phone: str, message: str, kind: str) -> tuple[bool, str | None]:
        msg_id = f"noop-{uuid.uuid4().hex[:8]}"
        logger.info(
            "noop_notification_recorded",
            phone=phone,
            kind=kind,
            provider_message_id=msg_id,
            message_preview=message[:50],
        )
        # The default NoopProvider does not connect to external gateways and NEVER confirms delivery
        return False, None


_notification_provider: NotificationProvider | None = None


def get_notification_provider() -> NotificationProvider:
    global _notification_provider
    if _notification_provider is None:
        _notification_provider = NoopProvider()
    return _notification_provider


def set_notification_provider(provider: NotificationProvider) -> None:
    global _notification_provider
    _notification_provider = provider
