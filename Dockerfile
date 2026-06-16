FROM python:3.12-slim

WORKDIR /app

# System deps for WeasyPrint (optional, uncomment if using WeasyPrint)
# RUN apt-get update && apt-get install -y --no-install-recommends \
#     libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf2.0-0 \
#     && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ app/

EXPOSE 8000

CMD ["sh", "-c", "gunicorn app.main:app --worker-class uvicorn.workers.UvicornWorker --workers ${WEB_CONCURRENCY:-2} --bind 0.0.0.0:${PORT:-8000} --timeout 120 --keep-alive 65 --graceful-timeout 30 --preload --access-logfile - --error-logfile -"]
