# statcompy face-embedding microservice.
#
# Bakes the SAME `mobilefacenet.tflite` we ship to the Android client into the
# image, so server-side enrollments produce embeddings byte-compatible with the
# on-device kiosk matcher.
#
# The model file lives at `face-svc/models/mobilefacenet.tflite` — fetched
# locally from Azure Blob before the build (see README). It is in .gitignore;
# the source of truth remains the `mobile-models` blob container.
#
# Build from the workspace root via:
#   az acr build --registry statcompyacr001 --image face-svc:latest \
#       --file face-svc/Dockerfile face-svc

FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# mediapipe needs libGL + a few X libs even though we never render
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

COPY requirements.txt requirements-arcface.txt ./
# WITH_ARCFACE=1 bakes in the InsightFace/ArcFace backend (EMBEDDING_BACKEND=insightface).
# Default 0 keeps the image identical to the MobileFaceNet-only build.
ARG WITH_ARCFACE=0
RUN pip install --upgrade pip && pip install -r requirements.txt && \
    if [ "$WITH_ARCFACE" = "1" ]; then pip install -r requirements-arcface.txt; fi

# Model is bundled in the build context (face-svc/models/mobilefacenet.tflite).
# This must be the SAME file the Android client embeds — fetched from the
# `mobile-models` blob container before `az acr build`.
COPY models/mobilefacenet.tflite /models/mobilefacenet.tflite
RUN ls -l /models/mobilefacenet.tflite

COPY app/ /srv/app/

ENV MODEL_PATH=/models/mobilefacenet.tflite \
    PORT=8080
EXPOSE 8080

# non-root user
RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin facesvc && \
    chown -R facesvc:facesvc /srv /models
USER facesvc

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8080/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "2"]
