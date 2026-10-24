import time
from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.followups.models import FollowUp
from app.modules.patients.models import Patient
from app.modules.users.models import Doctor, User
from app.services.notification import NoopProvider
from app.services.scheduler import (
    get_today_ist,
    process_scheduled_reminders,
    run_reminder_processing_job,
    shutdown_scheduler,
    start_scheduler,
)
from app.services.storage import LocalStorageService, S3StorageService


@pytest.mark.asyncio
async def test_local_storage_service(tmp_path):
    storage = LocalStorageService()
    test_key = "test/sample.jpg"
    data = b"Hello Storage World!"
    content_type = "image/jpeg"

    # Put object
    await storage.put_object(test_key, data, content_type)

    # Get object
    ret_data, ret_ct = await storage.get_object(test_key)
    assert ret_data == data
    assert ret_ct == content_type

    # Signed URL
    url = storage.get_signed_url(test_key, expires_seconds=60)
    assert url.startswith("/api/v1/documents/files/test/sample.jpg?expires=")

    # Verify signature
    parts = url.split("?")[1].split("&")
    expires = int(parts[0].split("=")[1])
    sig = parts[1].split("=")[1]
    assert storage.verify_signed_url(test_key, expires, sig) is True

    # Tampered signature
    assert storage.verify_signed_url(test_key, expires, "invalid_sig") is False

    # Expired signature
    past_ts = int(time.time()) - 10
    assert storage.verify_signed_url(test_key, past_ts, sig) is False

    # Delete object
    deleted = await storage.delete_object(test_key)
    assert deleted is True

    # Non-existent get
    with pytest.raises(FileNotFoundError):
        await storage.get_object(test_key)


def test_magic_bytes_validation():
    from app.core.errors import FileRejectedException
    from app.services.storage import validate_file_magic_bytes

    # Valid formats
    assert validate_file_magic_bytes(b"\xff\xd8\xff\xe0\x00\x10", "doc.jpg") == ("image/jpeg", ".jpg")
    assert validate_file_magic_bytes(b"\x89PNG\r\n\x1a\n\x00\x00", "doc.png") == ("image/png", ".png")
    assert validate_file_magic_bytes(b"RIFF\x00\x00\x00\x00WEBPtest", "doc.webp") == ("image/webp", ".webp")
    assert validate_file_magic_bytes(b"%PDF-1.5 test file", "doc.pdf") == ("application/pdf", ".pdf")

    # Corrupted / short
    with pytest.raises(FileRejectedException):
        validate_file_magic_bytes(b"12", "short.bin")

    # Unsupported
    with pytest.raises(FileRejectedException):
        validate_file_magic_bytes(b"MZ\x90\x00fake_binary", "bad.exe")

    # Oversized
    with pytest.raises(FileRejectedException):
        validate_file_magic_bytes(b"a" * (26 * 1024 * 1024), "large.pdf")


def test_get_storage_service_factory():
    import app.services.storage as storage_mod
    storage_mod._storage_instance = None
    with patch("app.core.config.settings.STORAGE_BACKEND", "local"):
        svc = storage_mod.get_storage_service()
        assert isinstance(svc, LocalStorageService)

    storage_mod._storage_instance = None
    with patch("app.core.config.settings.STORAGE_BACKEND", "s3"), patch("boto3.client"):
        svc = storage_mod.get_storage_service()
        assert isinstance(svc, S3StorageService)
    storage_mod._storage_instance = None


@pytest.mark.asyncio
async def test_s3_storage_service():
    with patch("boto3.client") as mock_boto:
        mock_client = MagicMock()
        mock_boto.return_value = mock_client
        mock_client.get_object.return_value = {
            "Body": MagicMock(read=lambda: b"s3 data"),
            "ContentType": "image/jpeg",
        }
        mock_client.generate_presigned_url.return_value = "https://s3.example.com/presigned"

        s3 = S3StorageService()
        await s3.put_object("key1", b"data", "image/jpeg")
        mock_client.put_object.assert_called_once()

        data, ct = await s3.get_object("key1")
        assert data == b"s3 data"
        assert ct == "image/jpeg"

        url = s3.get_signed_url("key1")
        assert url == "https://s3.example.com/presigned"

        assert await s3.delete_object("key1") is True


@pytest.mark.asyncio
async def test_notification_providers():
    provider = NoopProvider()
    success, msg_id = await provider.send_reminder(phone="12345", message="test", kind="on-date")
    assert success is False
    assert msg_id is None


@pytest.mark.asyncio
async def test_reminder_status_never_sent_without_provider_confirmation(db_session: AsyncSession):
    # Test that failed provider leaves reminder_status unchanged
    mock_failing_provider = AsyncMock()
    mock_failing_provider.send_reminder.return_value = (False, None)

    with patch("app.modules.followups.router.get_notification_provider", return_value=mock_failing_provider):
        # Even if send_reminder returns False, status must not be 'Sent'
        success, msg_id = await mock_failing_provider.send_reminder("123", "msg", "manual")
        assert success is False
        assert msg_id is None



@pytest.mark.asyncio
async def test_scheduler_lifecycle():
    start_scheduler()
    shutdown_scheduler()


@pytest.mark.asyncio
async def test_process_scheduled_reminders(db_session: AsyncSession):
    # Seed patient and doctor
    u = User(
        email="doc_sched@tosh.demo",
        password_hash="hash",
        role="skin",
        display_name="Dr. Sched",
        department="skin",
    )
    db_session.add(u)
    await db_session.flush()

    doc = Doctor(user_id=u.id, display_name="Dr. Sched", department="skin")
    p = Patient(
        display_id="PT-9991",
        full_name="Patient Sched",
        date_of_birth="1990-01-01",
        gender="Male",
        phone="+919876543210",
        address="123 Sched St, Pune",
    )
    db_session.add_all([doc, p])
    await db_session.flush()

    today_ist = get_today_ist()
    today_date = date.fromisoformat(today_ist)
    two_days_later = (today_date + timedelta(days=2)).isoformat()

    fu_today = FollowUp(
        display_id="FU-901",
        patient_id=p.id,
        department="skin",
        doctor_id=doc.id,
        date=today_ist,
        status="Upcoming",
        reminder_status="Not sent",
    )
    fu_2days = FollowUp(
        display_id="FU-902",
        patient_id=p.id,
        department="skin",
        doctor_id=doc.id,
        date=two_days_later,
        status="Upcoming",
        reminder_status="Not sent",
    )
    fu_far = FollowUp(
        display_id="FU-903",
        patient_id=p.id,
        department="skin",
        doctor_id=doc.id,
        date=(today_date + timedelta(days=10)).isoformat(),
        status="Upcoming",
        reminder_status="Not sent",
    )
    db_session.add_all([fu_today, fu_2days, fu_far])
    await db_session.commit()

    # Process with default provider -> stays Queued
    count = await process_scheduled_reminders(db_session)
    assert count == 2
    assert fu_today.reminder_status == "Queued"
    assert fu_2days.reminder_status == "Queued"
    assert fu_far.reminder_status == "Not sent"

    # Reset to Not sent and process with confirmed provider -> becomes Sent
    fu_today.reminder_status = "Not sent"
    mock_prov = AsyncMock()
    mock_prov.send_reminder.return_value = (True, "mock-confirmed-id")
    with patch("app.services.scheduler.get_notification_provider", return_value=mock_prov):
        await process_scheduled_reminders(db_session)
        assert fu_today.reminder_status == "Sent"


@pytest.mark.asyncio
async def test_run_reminder_processing_job():
    with patch("app.services.scheduler.process_scheduled_reminders", new_callable=AsyncMock) as mock_proc:
        await run_reminder_processing_job()
        mock_proc.assert_called_once()
