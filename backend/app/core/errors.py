from typing import Any

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel


class ErrorResponse(BaseModel):
    code: str
    message: str
    details: Any | None = None


class AppException(Exception):
    def __init__(
        self,
        message: str,
        code: str = "BAD_REQUEST",
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: Any | None = None,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details


class UnauthenticatedException(AppException):
    def __init__(self, message: str = "Authentication required", details: Any | None = None):
        super().__init__(
            message=message,
            code="UNAUTHENTICATED",
            status_code=status.HTTP_401_UNAUTHORIZED,
            details=details,
        )


class ForbiddenException(AppException):
    def __init__(self, message: str = "Permission denied", details: Any | None = None):
        super().__init__(
            message=message,
            code="FORBIDDEN",
            status_code=status.HTTP_403_FORBIDDEN,
            details=details,
        )


class NotFoundException(AppException):
    def __init__(self, message: str = "Resource not found", details: Any | None = None):
        super().__init__(
            message=message,
            code="NOT_FOUND",
            status_code=status.HTTP_404_NOT_FOUND,
            details=details,
        )


class ConflictException(AppException):
    def __init__(
        self,
        message: str = "Resource conflict",
        code: str = "CONFLICT",
        details: Any | None = None,
    ):
        super().__init__(
            message=message,
            code=code,
            status_code=status.HTTP_409_CONFLICT,
            details=details,
        )


class InvalidTransitionException(ConflictException):
    def __init__(self, message: str = "Invalid status transition", details: Any | None = None):
        super().__init__(
            message=message,
            code="INVALID_TRANSITION",
            details=details,
        )


class VisitLockedException(ConflictException):
    def __init__(
        self,
        message: str = "Consultation is finalized and cannot be modified without reopening.",
        details: Any | None = None,
    ):
        super().__init__(
            message=message,
            code="VISIT_LOCKED",
            details=details,
        )


class PaymentExceedsBalanceException(AppException):
    def __init__(
        self,
        message: str = "Payment amount cannot exceed the remaining invoice balance.",
        details: Any | None = None,
    ):
        super().__init__(
            message=message,
            code="PAYMENT_EXCEEDS_BALANCE",
            status_code=422,
            details=details,
        )


class FileRejectedException(AppException):
    def __init__(
        self,
        message: str = "File upload rejected",
        status_code: int = 422,
        details: Any | None = None,
    ):
        super().__init__(
            message=message,
            code="FILE_REJECTED",
            status_code=status_code,
            details=details,
        )


class RateLimitedException(AppException):
    def __init__(
        self,
        message: str = "Too many requests. Please slow down.",
        details: Any | None = None,
    ):
        super().__init__(
            message=message,
            code="RATE_LIMITED",
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            details=details,
        )


def _attach_error_cors(request: Request, response: JSONResponse) -> JSONResponse:
    origin = request.headers.get("origin")
    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        req_headers = request.headers.get("access-control-request-headers")
        if req_headers:
            response.headers["Access-Control-Allow-Headers"] = req_headers
        else:
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, Accept, X-Request-ID"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, PATCH, OPTIONS"
    return response


async def app_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    app_exc = exc if isinstance(exc, AppException) else AppException(str(exc))
    resp = JSONResponse(
        status_code=app_exc.status_code,
        content={"code": app_exc.code, "message": app_exc.message, "details": app_exc.details},
    )
    return _attach_error_cors(request, resp)


async def validation_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    val_exc = exc if isinstance(exc, RequestValidationError) else RequestValidationError([])
    field_errors = []
    for err in val_exc.errors():
        field_errors.append({
            "field": ".".join(str(loc) for loc in err["loc"] if loc != "body"),
            "message": err["msg"],
            "type": err["type"],
        })
    details_str = ", ".join(f"{e['field']}: {e['message']}" for e in field_errors)
    msg = f"Input validation failed: {details_str}" if details_str else "Input validation failed."
    print(f"\n[ERROR 422] Validation error on {request.method} {request.url.path}: {field_errors}\n", flush=True)
    resp = JSONResponse(
        status_code=422,
        content={
            "code": "VALIDATION_ERROR",
            "message": msg,
            "details": field_errors,
        },
    )
    return _attach_error_cors(request, resp)


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    import traceback
    tb = traceback.format_exc()
    import structlog
    log = structlog.get_logger("tosh.errors")
    log.error("unhandled_server_error", error=str(exc), path=request.url.path, traceback=tb)
    print(f"\n[ERROR 500] Unhandled exception on {request.method} {request.url.path}:\n{tb}\n", flush=True)

    resp = JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "code": "INTERNAL_SERVER_ERROR",
            "message": f"Server error: {str(exc)}",
            "details": None,
        },
    )
    return _attach_error_cors(request, resp)
