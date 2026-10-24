import pytest
from fastapi import APIRouter
from httpx import AsyncClient
from pydantic import BaseModel, Field

from app.core.errors import ConflictException, NotFoundException, PaymentExceedsBalanceException
from app.main import app

error_test_router = APIRouter(prefix="/test-errors")


class DummyPayload(BaseModel):
    name: str = Field(min_length=2)
    amount: int = Field(gt=0)


@error_test_router.post("/validation")
async def dummy_validation_route(payload: DummyPayload):
    return payload


@error_test_router.get("/custom-exception")
async def dummy_custom_exception(err: str):
    if err == "not_found":
        raise NotFoundException("Patient not found", details={"patient_id": "PT-999"})
    elif err == "conflict":
        raise ConflictException("Token already exists", code="POSSIBLE_DUPLICATE")
    elif err == "payment":
        raise PaymentExceedsBalanceException("Cannot overpay", details={"balance": 500})
    elif err == "crash":
        raise RuntimeError("Secret internal database connection failed: SELECT * FROM secrets")
    return {"status": "ok"}


app.include_router(error_test_router)


@pytest.mark.asyncio
async def test_validation_error_format(async_client: AsyncClient):
    response = await async_client.post("/test-errors/validation", json={"name": "A", "amount": -10})
    assert response.status_code == 422
    data = response.json()
    assert data["code"] == "VALIDATION_ERROR"
    assert "Input validation failed" in data["message"]
    assert isinstance(data["details"], list)
    fields = [d["field"] for d in data["details"]]
    assert "name" in fields
    assert "amount" in fields


@pytest.mark.asyncio
async def test_not_found_exception_format(async_client: AsyncClient):
    response = await async_client.get("/test-errors/custom-exception?err=not_found")
    assert response.status_code == 404
    data = response.json()
    assert data["code"] == "NOT_FOUND"
    assert data["message"] == "Patient not found"
    assert data["details"]["patient_id"] == "PT-999"


@pytest.mark.asyncio
async def test_conflict_exception_format(async_client: AsyncClient):
    response = await async_client.get("/test-errors/custom-exception?err=conflict")
    assert response.status_code == 409
    data = response.json()
    assert data["code"] == "POSSIBLE_DUPLICATE"


@pytest.mark.asyncio
async def test_payment_exceeds_balance_exception(async_client: AsyncClient):
    response = await async_client.get("/test-errors/custom-exception?err=payment")
    assert response.status_code == 422
    data = response.json()
    assert data["code"] == "PAYMENT_EXCEEDS_BALANCE"


@pytest.mark.asyncio
async def test_generic_exception_does_not_leak_stack_or_sql(async_client: AsyncClient):
    response = await async_client.get("/test-errors/custom-exception?err=crash")
    assert response.status_code == 500
    data = response.json()
    assert data["code"] == "INTERNAL_SERVER_ERROR"
    assert data["message"] == "An unexpected server error occurred."
    assert "SELECT" not in str(data)
    assert "secrets" not in str(data)
