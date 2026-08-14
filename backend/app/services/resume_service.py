import pdfplumber
import os
import uuid
from pathlib import Path
from app.core.config import settings


def extract_text_from_pdf(file_path: str) -> str:
    """Extract raw text from a PDF file."""
    text_parts = []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
    return "\n".join(text_parts)


def save_upload(file_bytes: bytes, filename: str, user_id: str) -> str:
    """Save uploaded file and return its path. UUID prefix prevents collisions
    when files with the same name are uploaded multiple times."""
    upload_dir = Path(settings.UPLOAD_DIR) / user_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    # Sanitize filename
    safe_name = "".join(c for c in filename if c.isalnum() or c in "._- ").strip()
    safe_name = safe_name or "resume.pdf"
    unique_name = f"{uuid.uuid4().hex[:8]}_{safe_name}"
    file_path = upload_dir / unique_name

    with open(file_path, "wb") as f:
        f.write(file_bytes)

    return str(file_path)
