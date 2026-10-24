import logging
import re
import sys
from collections.abc import MutableMapping
from typing import Any

import structlog

# Redaction patterns for PHI
SENSITIVE_KEYS = {
    "phone", "email", "address", "fullname", "full_name", "emergency_contact", "emergencycontact",
    "symptoms", "medical_history", "medicalhistory", "allergies", "examination",
    "assessment", "diagnosis", "treatment_plan", "treatmentplan", "prescription",
    "password", "password_hash", "access_token", "refresh_token", "token"
}

PHONE_REGEX = re.compile(r'(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}')
EMAIL_REGEX = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+')


def redact_sensitive_data(val: Any) -> Any:
    if isinstance(val, str):
        val = EMAIL_REGEX.sub("[REDACTED_EMAIL]", val)
        val = PHONE_REGEX.sub("[REDACTED_PHONE]", val)
        return val
    elif isinstance(val, dict):
        return {
            k: ("[REDACTED_PHI]" if str(k).lower() in SENSITIVE_KEYS else redact_sensitive_data(v))
            for k, v in val.items()
        }
    elif isinstance(val, list):
        return [redact_sensitive_data(item) for item in val]
    return val


def phi_redacting_processor(
    logger: Any, method_name: str, event_dict: MutableMapping[str, Any]
) -> MutableMapping[str, Any]:
    for key, value in list(event_dict.items()):
        if str(key).lower() in SENSITIVE_KEYS:
            event_dict[key] = "[REDACTED_PHI]"
        else:
            event_dict[key] = redact_sensitive_data(value)
    return event_dict


def setup_logging(debug: bool = False) -> None:
    shared_processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        phi_redacting_processor,
    ]

    renderer: Any
    if debug:
        # Development readable console
        renderer = structlog.dev.ConsoleRenderer()
    else:
        # Production JSON structured logs
        renderer = structlog.processors.JSONRenderer()

    structlog.configure(
        processors=shared_processors + [
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(logging.DEBUG if debug else logging.INFO)

    # Silence noisy loggers in production, but keep access logs visible in development
    if not debug:
        logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    else:
        logging.getLogger("uvicorn.access").setLevel(logging.INFO)


logger = structlog.get_logger("tosh")
