FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY attack_engine/requirements.txt attack_engine/requirements.txt
RUN pip install --no-cache-dir -r attack_engine/requirements.txt
COPY attack_engine attack_engine
COPY scoring scoring
COPY verifier verifier
ENV PYTHONPATH=/app PYTHONUNBUFFERED=1 FD_BASE_URL=http://nginx/api FD_REPORTS_DIR=/app/reports FD_KILL_URLS=http://api2:8080
EXPOSE 9200
CMD ["python", "-m", "attack_engine", "serve"]
