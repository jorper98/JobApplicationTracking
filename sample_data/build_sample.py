"""Build job-tracker-sample.zip from data.json.

Generates a minimal PDF for each resume in uploads/ and bundles everything
in the exact format the app's Data -> Import expects
(see backend/app/api/routes/data.py: REQUIRED_FIELDS and the zip layout).
"""

import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "job-tracker-sample.zip"
LINES_PER_PAGE = 42


def escape_pdf_text(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def build_pdf(text: str) -> bytes:
    """Minimal valid single-font PDF with Helvetica, paginated."""
    lines = [line.rstrip() for line in text.splitlines()]
    pages = [lines[i : i + LINES_PER_PAGE] for i in range(0, len(lines), LINES_PER_PAGE)] or [[]]

    parts = []  # object bodies, index 0 == object 1

    def add(body: bytes) -> None:
        parts.append(body)

    page_ids = [4 + 2 * i for i in range(len(pages))]
    content_ids = [5 + 2 * i for i in range(len(pages))]

    add(b"<< /Type /Catalog /Pages 2 0 R >>")
    add(
        b"<< /Type /Pages /Kids ["
        + b" ".join(b"%d 0 R" % pid for pid in page_ids)
        + b"] /Count %d >>" % len(page_ids)
    )
    add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    for i, page_lines in enumerate(pages):
        stream = bytearray(b"BT /F1 11 Tf 50 760 Td 16 TL\n")
        for line in page_lines:
            if line.strip():
                stream += b"(" + escape_pdf_text(line).encode() + b") Tj T*\n"
            else:
                stream += b"T*\n"
        stream += b"ET"
        add(
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Resources << /Font << /F1 3 0 R >> >> /Contents %d 0 R >>" % content_ids[i]
        )
        add(b"<< /Length %d >>\nstream\n" % len(stream) + bytes(stream) + b"\nendstream")

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for index, body in enumerate(parts, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % index + body + b"\nendobj\n"

    xref_pos = len(out)
    out += b"xref\n0 %d\n" % (len(parts) + 1)
    out += b"0000000000 65535 f \n"
    for offset in offsets:
        out += b"%010d 00000 n \n" % offset
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF" % (len(parts) + 1, xref_pos)
    return bytes(out)


def main() -> None:
    payload = json.loads((ROOT / "data.json").read_text(encoding="utf-8"))

    uploads = ROOT / "uploads"
    uploads.mkdir(exist_ok=True)
    for resume in payload["resumes"]:
        text = resume.get("raw_text") or resume["filename"]
        target = uploads / Path(resume["file_path"]).name
        target.write_bytes(build_pdf(text))
        print(f"wrote {target.name} ({target.stat().st_size} bytes)")

    with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.write(ROOT / "data.json", "data.json")
        for pdf in sorted(uploads.glob("*.pdf")):
            archive.write(pdf, f"uploads/{pdf.name}")

    with zipfile.ZipFile(OUTPUT) as check:
        for name in check.namelist():
            print(f"zip: {name} ({check.getinfo(name).file_size} bytes)")
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
