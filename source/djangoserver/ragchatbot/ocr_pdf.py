"""
ocr_pdf.py – OCR-aware PDF text extraction for the RAG pipeline.

For each page in a PDF:
  1. Extract text with PyMuPDF (fast, native).
  2. If the page has < 50 characters of text, treat it as scanned:
     render it at 200 DPI, run Tesseract OCR, and mark ocr=True.
  3. Even for text-rich pages, extract and OCR any embedded images
     (screenshots, charts, diagrams) and append that text.

The Tesseract binary path is configurable via the TESSERACT_CMD
environment variable.  On Windows, it defaults to the standard
UB Mannheim install location if that file exists; otherwise it
falls back to whatever is on PATH.
"""

import io
import os
import logging
import platform

try:
    import pymupdf as fitz  # PyMuPDF >= 2.0
except ImportError:
    import fitz  # PyMuPDF < 2.0
import pytesseract
from PIL import Image

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tesseract path configuration
# ---------------------------------------------------------------------------
_DEFAULT_WIN_PATH = r"C:\Program Files\Tesseract-OCR\tesseract.exe"


def _configure_tesseract() -> None:
    """Set pytesseract.tesseract_cmd once from env / sensible defaults."""
    custom = os.getenv("TESSERACT_CMD", "").strip()
    if custom:
        pytesseract.pytesseract.tesseract_cmd = custom
        return

    if platform.system() == "Windows" and os.path.isfile(_DEFAULT_WIN_PATH):
        pytesseract.pytesseract.tesseract_cmd = _DEFAULT_WIN_PATH


_configure_tesseract()

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MIN_TEXT_LENGTH = 50        # characters below which a page is "scanned"
RENDER_DPI = 200            # resolution for full-page OCR
MIN_IMAGE_SIDE = 80         # skip tiny icons / decorations (px)
MIN_IMAGE_AREA = 80 * 80    # minimum pixel area for embedded-image OCR


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_pdf_text(pdf_path: str) -> list[dict]:
    """
    Extract text from every page of *pdf_path*.

    Returns a list of dicts, one per page::

        [
            {"page": 0, "text": "...", "ocr": False},
            {"page": 1, "text": "...", "ocr": True},
            ...
        ]

    Page numbers are 0-indexed (matching PyPDFLoader / LangChain convention).
    """
    results: list[dict] = []

    try:
        doc = fitz.open(pdf_path)
    except Exception:
        logger.exception("Failed to open PDF: %s", pdf_path)
        return results

    for page_num in range(len(doc)):
        page = doc[page_num]
        used_ocr = False
        page_text = ""

        try:
            # --- native text extraction ---
            native_text = (page.get_text("text") or "").strip()

            if len(native_text) < MIN_TEXT_LENGTH:
                # Full-page OCR for scanned / image-only pages
                ocr_text = _ocr_full_page(page, page_num, pdf_path)
                if ocr_text:
                    page_text = ocr_text
                    used_ocr = True
                else:
                    # OCR returned nothing; keep whatever native text we got
                    page_text = native_text
            else:
                # Page has real text.  Also OCR any embedded images.
                image_text = _ocr_embedded_images(page, page_num, pdf_path)
                page_text = native_text
                if image_text:
                    page_text += "\n\n[OCR from embedded images]\n" + image_text
                    used_ocr = True

        except Exception:
            logger.exception(
                "Error processing page %d of %s – skipping page",
                page_num, pdf_path,
            )
            # Fall back to whatever we have so far
            page_text = page_text or ""

        results.append({
            "page": page_num,
            "text": page_text,
            "ocr": used_ocr,
        })

    doc.close()
    return results


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _ocr_full_page(page, page_num: int, pdf_path: str) -> str:
    """Render the full page at RENDER_DPI and OCR the resulting image."""
    try:
        mat = fitz.Matrix(RENDER_DPI / 72, RENDER_DPI / 72)
        pix = page.get_pixmap(matrix=mat)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        text = pytesseract.image_to_string(img).strip()
        return text
    except Exception:
        logger.exception(
            "OCR failed on full page %d of %s", page_num, pdf_path,
        )
        return ""


def _ocr_embedded_images(page, page_num: int, pdf_path: str) -> str:
    """Extract and OCR images embedded in a text-rich page."""
    parts: list[str] = []

    try:
        image_list = page.get_images(full=True)
    except Exception:
        logger.exception(
            "Failed to list images on page %d of %s", page_num, pdf_path,
        )
        return ""

    doc = page.parent  # the fitz.Document that owns this page

    for img_index, img_info in enumerate(image_list):
        xref = img_info[0]
        try:
            base_image = doc.extract_image(xref)
            if not base_image or not base_image.get("image"):
                continue

            width = base_image.get("width", 0)
            height = base_image.get("height", 0)

            # Skip tiny images (icons, bullets, logos)
            if width < MIN_IMAGE_SIDE or height < MIN_IMAGE_SIDE:
                continue
            if width * height < MIN_IMAGE_AREA:
                continue

            img = Image.open(io.BytesIO(base_image["image"]))

            # Convert palette / CMYK images to RGB for Tesseract
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")

            text = pytesseract.image_to_string(img).strip()
            if text:
                parts.append(text)

        except Exception:
            logger.exception(
                "OCR failed on image %d (xref=%d) of page %d in %s",
                img_index, xref, page_num, pdf_path,
            )
            continue

    return "\n".join(parts)
