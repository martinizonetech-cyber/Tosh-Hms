import hashlib
import hmac
import time
from abc import ABC, abstractmethod
from pathlib import Path

from app.core.config import settings
from app.core.errors import FileRejectedException

MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB


def validate_file_magic_bytes(content: bytes, filename: str) -> tuple[str, str]:
    """Validate uploaded file bytes against allowed magic byte signatures."""
    if len(content) > MAX_FILE_SIZE:
        raise FileRejectedException("File size exceeds 25 MB limit.")

    if len(content) < 4:
        raise FileRejectedException("File is empty or corrupted.")

    lower_name = (filename or "").lower()

    # Reject dangerous executable and script files
    dangerous_exts = (
        ".exe", ".dll", ".bat", ".cmd", ".sh", ".ps1", ".vbs", ".js",
        ".mjs", ".scr", ".pif", ".com", ".jar", ".php", ".py", ".pl",
        ".cgi", ".msi", ".apk", ".dmg",
    )
    if any(lower_name.endswith(ext) for ext in dangerous_exts):
        raise FileRejectedException("Executable files and scripts are not allowed for security reasons.")

    if content.startswith(b"MZ") or content.startswith(b"\x7fELF"):
        raise FileRejectedException("Executable binaries are not allowed.")

    # JPEG
    if content.startswith(b"\xff\xd8"):
        return "image/jpeg", ".jpg"

    # PNG
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", ".png"

    # WEBP: RIFF....WEBP
    if len(content) >= 12 and content.startswith(b"RIFF") and content[8:12] == b"WEBP":
        return "image/webp", ".webp"

    # AVIF
    if (len(content) >= 12 and content[4:8] == b"ftyp" and content[8:12] in (b"avif", b"avis")) or lower_name.endswith(".avif"):
        return "image/avif", ".avif"

    # HEIC / HEIF
    if (len(content) >= 12 and content[4:8] == b"ftyp" and content[8:12] in (b"heic", b"heix", b"hevc", b"mif1", b"msf1")) or lower_name.endswith((".heic", ".heif")):
        return "image/heic", ".heic"

    # DICOM medical imaging (.dcm)
    if (len(content) >= 132 and content[128:132] == b"DICM") or lower_name.endswith(".dcm"):
        return "application/dicom", ".dcm"

    # GIF
    if content.startswith(b"GIF87a") or content.startswith(b"GIF89a"):
        return "image/gif", ".gif"

    # BMP
    if content.startswith(b"BM"):
        return "image/bmp", ".bmp"

    # TIFF
    if content.startswith(b"II*\x00") or content.startswith(b"MM\x00*"):
        return "image/tiff", ".tiff"

    # SVG
    if b"<svg" in content[:1024].lower():
        return "image/svg+xml", ".svg"

    # PDF
    if b"%PDF-" in content[:1024]:
        return "application/pdf", ".pdf"

    # Extension fallbacks for images if magic bytes have slight deviations
    if lower_name.endswith((".jpg", ".jpeg")):
        return "image/jpeg", ".jpg"
    if lower_name.endswith(".png"):
        return "image/png", ".png"
    if lower_name.endswith(".webp"):
        return "image/webp", ".webp"
    if lower_name.endswith(".gif"):
        return "image/gif", ".gif"
    if lower_name.endswith(".bmp"):
        return "image/bmp", ".bmp"
    if lower_name.endswith((".tif", ".tiff")):
        return "image/tiff", ".tiff"
    if lower_name.endswith(".pdf"):
        return "application/pdf", ".pdf"

    # Plain text
    if lower_name.endswith(".txt"):
        return "text/plain", ".txt"
    if lower_name.endswith(".csv"):
        return "text/csv", ".csv"

    # Word documents
    if lower_name.endswith(".docx") or content.startswith(b"PK\x03\x04"):
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"
    if lower_name.endswith(".doc") or content.startswith(b"\xd0\xcf\x11\xe0"):
        return "application/msword", ".doc"

    raise FileRejectedException("Unsupported file type. Only JPEG, PNG, WEBP, AVIF, HEIC, GIF, BMP, TIFF, SVG, PDF, DICOM, and DOC documents are allowed.")


class StorageService(ABC):
    @abstractmethod
    async def put_object(self, key: str, data: bytes, content_type: str) -> None:
        pass

    @abstractmethod
    async def get_object(self, key: str) -> tuple[bytes, str]:
        pass

    @abstractmethod
    async def delete_object(self, key: str) -> bool:
        pass

    @abstractmethod
    def get_signed_url(self, key: str, expires_seconds: int = 86400 * 7) -> str:
        pass


class LocalStorageService(StorageService):
    def __init__(self, base_dir: str | Path | None = None):
        if not base_dir:
            p = Path(settings.LOCAL_STORAGE_DIR)
            if not p.is_absolute():
                backend_dir = Path(__file__).resolve().parent.parent.parent
                self.base_dir = backend_dir / settings.LOCAL_STORAGE_DIR
            else:
                self.base_dir = p
        else:
            self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    async def put_object(self, key: str, data: bytes, content_type: str) -> None:
        target_path = self.base_dir / key
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_bytes(data)

    async def get_object(self, key: str) -> tuple[bytes, str]:
        target_path = self.base_dir / key
        if not target_path.exists():
            raise FileNotFoundError(f"File {key} not found.")
        data = target_path.read_bytes()
        # Guess mime type from extension
        ext = target_path.suffix.lower()
        mime = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
            ".gif": "image/gif",
            ".bmp": "image/bmp",
            ".svg": "image/svg+xml",
            ".tiff": "image/tiff",
            ".pdf": "application/pdf",
            ".txt": "text/plain",
            ".doc": "application/msword",
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }.get(ext, "application/octet-stream")
        return data, mime

    async def delete_object(self, key: str) -> bool:
        target_path = self.base_dir / key
        if target_path.exists():
            target_path.unlink()
            return True
        return False

    def get_signed_url(self, key: str, expires_seconds: int = 86400 * 7) -> str:
        expiry = int(time.time()) + expires_seconds
        payload = f"{key}:{expiry}".encode()
        signature = hmac.new(settings.JWT_SECRET_KEY.encode(), payload, hashlib.sha256).hexdigest()
        # Return URL relative to API root
        return f"/api/v1/documents/files/{key}?expires={expiry}&sig={signature}"

    def verify_signed_url(self, key: str, expires: int, signature: str) -> bool:
        if time.time() > expires:
            return False
        payload = f"{key}:{expires}".encode()
        expected = hmac.new(settings.JWT_SECRET_KEY.encode(), payload, hashlib.sha256).hexdigest()
        return hmac.compare_digest(signature, expected)


class S3StorageService(StorageService):
    def __init__(self):
        import boto3  # type: ignore[import-untyped]
        from botocore.client import Config  # type: ignore[import-untyped]

        self.s3_client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL or None,
            aws_access_key_id=settings.S3_ACCESS_KEY_ID or None,
            aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY or None,
            region_name=settings.S3_REGION_NAME,
            config=Config(signature_version="s3v4"),
        )
        self.bucket = settings.S3_BUCKET_NAME

    async def put_object(self, key: str, data: bytes, content_type: str) -> None:
        self.s3_client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )

    async def get_object(self, key: str) -> tuple[bytes, str]:
        resp = self.s3_client.get_object(Bucket=self.bucket, Key=key)
        data = resp["Body"].read()
        content_type = resp.get("ContentType", "application/octet-stream")
        return data, content_type

    async def delete_object(self, key: str) -> bool:
        try:
            self.s3_client.delete_object(Bucket=self.bucket, Key=key)
            return True
        except Exception:  # noqa: BLE001
            return False

    def get_signed_url(self, key: str, expires_seconds: int = 300) -> str:
        return self.s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=expires_seconds,
        )


_storage_instance: StorageService | None = None


def get_storage_service() -> StorageService:
    global _storage_instance
    if _storage_instance is None:
        if settings.STORAGE_BACKEND.lower() == "s3":
            _storage_instance = S3StorageService()
        else:
            _storage_instance = LocalStorageService()
    return _storage_instance
