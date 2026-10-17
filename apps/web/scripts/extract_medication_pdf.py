import base64
import json
import shutil
import sys

import pymupdf as fitz

MAX_PAGES = 20
MAX_RENDER_PAGES = 8
MAX_RENDER_BYTES = 7_000_000


def main():
    raw_pdf = sys.stdin.buffer.read()
    if not raw_pdf or not raw_pdf.startswith(b"%PDF"):
        raise ValueError("invalid_pdf")
    document = fitz.open(stream=raw_pdf, filetype="pdf")
    if document.is_encrypted:
        raise ValueError("encrypted_pdf")
    if document.page_count < 1 or document.page_count > MAX_PAGES:
        raise ValueError("pdf_page_limit")
    total_pages = document.page_count

    pages = []
    pages_without_text = []
    page_text = []
    tesseract = shutil.which("tesseract")
    for index, page in enumerate(document):
        text = page.get_text("text").strip()
        if len(text) < 40 and tesseract:
            try:
                ocr_page = page.get_textpage_ocr(language="eng", dpi=180)
                ocr_text = page.get_text("text", textpage=ocr_page).strip()
                if len(ocr_text) > len(text):
                    text = ocr_text
            except Exception:
                pass
        if text:
            page_text.append(f"[Page {index + 1}]\n{text}")
        if len(text) < 40:
            pages_without_text.append(index)

    extracted = "\n\n".join(page_text)[:50_000]
    # If selectable text and optional system Tesseract OCR do not produce text, render
    # image-only pages with PyMuPDF for an OpenRouter free vision model after consent.
    if pages_without_text:
        rendered_bytes = 0
        for index in pages_without_text[:MAX_RENDER_PAGES]:
            page = document[index]
            pixmap = page.get_pixmap(matrix=fitz.Matrix(1.25, 1.25), alpha=False)
            image = pixmap.tobytes("png")
            if rendered_bytes + len(image) > MAX_RENDER_BYTES:
                break
            rendered_bytes += len(image)
            pages.append({"page": index + 1, "dataUrl": "data:image/png;base64," + base64.b64encode(image).decode("ascii")})

    document.close()
    sys.stdout.write(json.dumps({
        "text": extracted,
        "pages": pages,
        "totalPages": total_pages,
        "unrenderedImagePages": max(0, len(pages_without_text) - len(pages)),
    }, separators=(",", ":")))


if __name__ == "__main__":
    main()
