FROM python:3.11-slim

WORKDIR /app

ENV PLAYWRIGHT_BROWSERS_PATH=/app/.ms-playwright

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && playwright install --with-deps chromium

COPY . .

RUN mkdir -p uploads

EXPOSE 8136
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8136}