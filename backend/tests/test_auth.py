import pytest
from httpx import AsyncClient

from app.core.config import settings


@pytest.mark.asyncio
async def test_reception_login_success(async_client: AsyncClient, seed_test_users):
    response = await async_client.post(
        "/api/v1/auth/login",
        json={
            "email": "reception@northstar.demo",
            "password": settings.RECEPTION_INITIAL_PASSWORD,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "accessToken" in data
    assert data["user"]["email"] == "reception@northstar.demo"
    assert data["user"]["role"] == "reception"

    # Check httpOnly refresh cookie
    assert "refresh_token" in response.cookies


@pytest.mark.asyncio
async def test_doctor_login_success(async_client: AsyncClient, seed_test_users):
    response = await async_client.post(
        "/api/v1/auth/login",
        json={
            "email": "skin@gmail.com",
            "password": settings.SKIN_INITIAL_PASSWORD,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["user"]["displayName"] == "Dr. Sangamitra"
    assert data["user"]["department"] == "skin"


@pytest.mark.asyncio
async def test_login_invalid_password_returns_401(async_client: AsyncClient, seed_test_users):
    response = await async_client.post(
        "/api/v1/auth/login",
        json={
            "email": "reception@northstar.demo",
            "password": "WrongPassword!",
        },
    )
    assert response.status_code == 401
    data = response.json()
    assert data["code"] == "UNAUTHENTICATED"
    assert "Invalid email or password" in data["message"]


@pytest.mark.asyncio
async def test_auth_me_endpoint(async_client: AsyncClient, seed_test_users):
    login_resp = await async_client.post(
        "/api/v1/auth/login",
        json={
            "email": "skin@gmail.com",
            "password": settings.SKIN_INITIAL_PASSWORD,
        },
    )
    token = login_resp.json()["accessToken"]

    # Call /auth/me with Bearer token
    me_resp = await async_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_resp.status_code == 200
    data = me_resp.json()
    assert data["email"] == "skin@gmail.com"
    assert data["role"] == "skin"
    assert data["displayName"] == "Dr. Sangamitra"


@pytest.mark.asyncio
async def test_refresh_token_rotation(async_client: AsyncClient, seed_test_users):
    login_resp = await async_client.post(
        "/api/v1/auth/login",
        json={
            "email": "ortho@gmail.com",
            "password": settings.ORTHO_INITIAL_PASSWORD,
        },
    )
    initial_cookie = login_resp.cookies.get("refresh_token")
    assert initial_cookie is not None

    # Call /auth/refresh with cookie
    refresh_resp = await async_client.post(
        "/api/v1/auth/refresh",
        cookies={"refresh_token": initial_cookie},
    )
    assert refresh_resp.status_code == 200
    data = refresh_resp.json()
    assert "accessToken" in data
    assert data["user"]["email"] == "ortho@gmail.com"

    # New cookie issued
    new_cookie = refresh_resp.cookies.get("refresh_token")
    assert new_cookie is not None
    assert new_cookie != initial_cookie

    # Old cookie should now be invalid
    old_attempt = await async_client.post(
        "/api/v1/auth/refresh",
        cookies={"refresh_token": initial_cookie},
    )
    assert old_attempt.status_code == 401


@pytest.mark.asyncio
async def test_list_doctors_endpoint(async_client: AsyncClient, seed_test_users):
    response = await async_client.get("/api/v1/doctors")
    assert response.status_code == 200
    doctors = response.json()
    assert len(doctors) == 2
    names = [d["displayName"] for d in doctors]
    assert "Dr. Sangamitra" in names
    assert "Dr. Sundarprakash" in names


@pytest.mark.asyncio
async def test_change_password_flow(async_client: AsyncClient, seed_test_users):
    # 1. Login with initial password
    login_resp = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "reception@northstar.demo", "password": settings.RECEPTION_INITIAL_PASSWORD},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["accessToken"]
    old_cookie = login_resp.cookies.get("refresh_token")

    # 2. Reject weak password (< 8 chars)
    weak_resp = await async_client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"oldPassword": settings.RECEPTION_INITIAL_PASSWORD, "newPassword": "short"},
    )
    assert weak_resp.status_code == 422

    # 3. Reject wrong old password
    wrong_resp = await async_client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"oldPassword": "WrongPassword123!", "newPassword": "BrandNewPassword123!"},
    )
    assert wrong_resp.status_code == 400

    # 4. Successfully change password
    change_resp = await async_client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"oldPassword": settings.RECEPTION_INITIAL_PASSWORD, "newPassword": "BrandNewPassword123!"},
    )
    assert change_resp.status_code == 200
    change_data = change_resp.json()
    assert change_data["user"]["mustChangePassword"] is False
    new_token = change_data["accessToken"]
    assert bool(new_token)

    # 5. Old refresh token was revoked
    old_refresh = await async_client.post(
        "/api/v1/auth/refresh",
        cookies={"refresh_token": old_cookie},
    )
    assert old_refresh.status_code == 401

    # 6. Login with old password fails
    old_login = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "reception@northstar.demo", "password": settings.RECEPTION_INITIAL_PASSWORD},
    )
    assert old_login.status_code == 401

    # 7. Login with new password succeeds
    new_login = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "reception@northstar.demo", "password": "BrandNewPassword123!"},
    )
    assert new_login.status_code == 200
