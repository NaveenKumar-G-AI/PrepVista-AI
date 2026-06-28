FROM python:3.12-slim

WORKDIR /app

# System deps for WeasyPrint (optional, uncomment if using WeasyPrint)
# RUN apt-get update && apt-get install -y --no-install-recommends \
#     libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf2.0-0 \
#     && rm -rf /var/lib/apt/lists/*

# Fix 6 — multi-format resume parsing system deps:
#   tesseract-ocr     → pytesseract OCR for image / image-only-PDF resumes
#   poppler-utils      → pdf2image (convert_from_bytes) PDF→image rasterization
#   libreoffice-writer → headless .doc→txt conversion (soffice --convert-to)
# All three degrade gracefully in code if absent, but are required for the
# DOCX/DOC/image/scan upload paths to actually work in production.
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr poppler-utils libreoffice-writer \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ app/

EXPOSE 8000

CMD ["sh", "-c", "gunicorn app.main:app --worker-class uvicorn.workers.UvicornWorker --workers ${WEB_CONCURRENCY:-2} --bind 0.0.0.0:${PORT:-8000} --timeout 120 --keep-alive 65 --graceful-timeout 30 --preload --access-logfile - --error-logfile -"]
