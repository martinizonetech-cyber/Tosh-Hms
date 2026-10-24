import time
import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.config import settings
from app.core.errors import (
    AppException,
    app_exception_handler,
    generic_exception_handler,
    validation_exception_handler,
)
from app.core.logging import logger, setup_logging
from app.db.session import engine


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    setup_logging(debug=settings.DEBUG)
    logger.info("application_starting", env=settings.ENVIRONMENT, app_name=settings.APP_NAME)
    from app.services.scheduler import shutdown_scheduler, start_scheduler
    start_scheduler()
    yield
    logger.info("application_shutting_down")
    shutdown_scheduler()
    await engine.dispose()


# In production, disable Swagger UI and OpenAPI schemas
docs_url = "/docs" if settings.ENVIRONMENT != "production" else None
redoc_url = "/redoc" if settings.ENVIRONMENT != "production" else None
openapi_url = "/openapi.json" if settings.ENVIRONMENT != "production" else None

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="Production backend for Tosh Clinic Hospital Management System",
    lifespan=lifespan,
    docs_url=docs_url,
    redoc_url=redoc_url,
    openapi_url=openapi_url,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# Security Headers & Request ID Middleware
MAX_BODY_SIZE = 30 * 1024 * 1024  # 30 MB


def _attach_cors_headers(request: Request, response: Response) -> Response:
    origin = request.headers.get("origin")
    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        req_headers = request.headers.get("access-control-request-headers")
        if req_headers:
            response.headers["Access-Control-Allow-Headers"] = req_headers
        elif "Access-Control-Allow-Headers" not in response.headers:
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, Accept, X-Request-ID"
        if "Access-Control-Allow-Methods" not in response.headers:
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, PATCH, OPTIONS"
    return response


@app.middleware("http")
async def request_size_limit_middleware(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_BODY_SIZE:
        res = JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content={
                "code": "REQUEST_TOO_LARGE",
                "message": "Request entity exceeds maximum allowed size (30MB)",
            },
        )
        return _attach_cors_headers(request, res)
    return await call_next(request)


@app.middleware("http")
async def security_and_request_id_middleware(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)

    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    request.state.request_id = request_id
    start_time = time.time()

    try:
        response = await call_next(request)
    except Exception as exc:  # noqa: BLE001
        response = await generic_exception_handler(request, exc)

    # Security headers
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

    # Guarantee CORS headers on every response
    _attach_cors_headers(request, response)

    process_time = time.time() - start_time
    logger.info(
        "http_request",
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
        duration_ms=round(process_time * 1000, 2),
        request_id=request_id,
    )
    return response


from slowapi.errors import RateLimitExceeded

from app.core.limiter import limiter

app.state.limiter = limiter


async def rate_limit_handler(request: Request, exc: Exception) -> Response:
    detail = getattr(exc, "detail", "Too many requests")
    res = JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={
            "code": "RATE_LIMIT_EXCEEDED",
            "message": f"Rate limit exceeded: {detail}",
        },
    )
    return _attach_cors_headers(request, res)


# Register exception handlers
app.add_exception_handler(RateLimitExceeded, rate_limit_handler)
app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)


# Health check endpoints
@app.get("/health", tags=["Health"], summary="Liveness Probe")
async def health():
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "environment": settings.ENVIRONMENT,
    }


from app.db.session import async_session_factory


@app.get("/ready", tags=["Health"], summary="Readiness Probe")
async def readiness():
    try:
        async with async_session_factory() as session:
            await session.execute(text("SELECT 1"))
        return {"status": "ready", "database": "connected"}
    except Exception as e:  # noqa: BLE001
        logger.error("readiness_check_failed", error=str(e))
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "not_ready", "database": "unreachable"},
        )



from fastapi import APIRouter

from app.modules.appointments.router import router as appointments_router
from app.modules.auth.router import router as auth_router
from app.modules.billing.router import router as billing_router
from app.modules.catalog.router import router as catalog_router
from app.modules.catalog.templates_router import router as templates_router
from app.modules.documents.router import router as documents_router
from app.modules.followups.router import router as followups_router
from app.modules.patients.router import router as patients_router
from app.modules.queue.router import router as queue_router
from app.modules.reports.router import router as reports_router
from app.modules.settings.router import router as settings_router
from app.modules.users.router import router as users_router
from app.modules.visits.router import router as visits_router

api_v1_router = APIRouter(prefix=settings.API_V1_PREFIX)


@api_v1_router.get("/", tags=["Root"])
async def root():
    return {"message": "Tosh Clinic HMS API v1", "docs": docs_url}


api_v1_router.include_router(auth_router)
api_v1_router.include_router(users_router)
api_v1_router.include_router(patients_router)
api_v1_router.include_router(appointments_router)
api_v1_router.include_router(queue_router)
api_v1_router.include_router(visits_router)
api_v1_router.include_router(documents_router)
api_v1_router.include_router(billing_router)
api_v1_router.include_router(catalog_router)
api_v1_router.include_router(templates_router)
api_v1_router.include_router(settings_router)
api_v1_router.include_router(followups_router)
api_v1_router.include_router(reports_router)

app.include_router(api_v1_router)
