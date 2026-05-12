# Build Stage for Frontend
FROM --platform=linux/amd64 node:18-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Runtime Stage
FROM --platform=linux/amd64 mcr.microsoft.com/playwright/python:v1.49.1-jammy

WORKDIR /app

RUN pip install --no-cache-dir -U yt-dlp fastapi uvicorn requests python-multipart websockets python-dotenv httpx crawl4ai playwright-stealth

COPY backend/requirements.txt backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ backend/

COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

RUN playwright install chromium --with-deps

EXPOSE 8002

CMD ["python", "backend/main.py"]