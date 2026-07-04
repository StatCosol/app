"""
Face embedding microservice.

POST /embed
    Request:  { "photoBase64": "<base64 JPEG/PNG>" }   (alias: "image")
    Response: { "ok": true,
                "embeddingBase64": "<base64 little-endian float32[N]>",
                "embedding": [..float..],              # same vector, JSON floats
                "faceScore": 0.97,
                "embeddingModel": "mobilefacenet-v1" | "arcface-buffalo_l-v1",
                "quality": { "faceScore": 0.97, "facePx": 214, "brightness": 121.4,
                             "sharpness": 182.0, "ok": true, "reasons": [] },
                "livenessScore": 0.93 | null }
              | { "ok": false, "error": "no_face" | "decode_failed" | "model_failed"
                             | "low_quality", "quality": {...} }

Embedding backends (EMBEDDING_BACKEND env):
  * mobilefacenet (default) — TFLite Interpreter loads the SAME
    `mobilefacenet.tflite` we ship in the Android APK. 112x112 RGB in,
    192-d L2-normalised out. Byte-compatible with the on-device
    FaceEmbedder, so kiosk-side probe vs server-side gallery works.
  * insightface — SCRFD detection + landmark alignment + ArcFace
    recognition (buffalo_l by default, 512-d). Much higher 1:N accuracy;
    requires `pip install -r requirements-arcface.txt` and re-enrollment
    of all subjects (embeddings are NOT compatible across backends —
    the backend matcher filters gallery entries by embedding_model).

Passive liveness (optional): set LIVENESS_MODEL_PATH to a MiniFASNet-style
ONNX anti-spoofing model. When present, /embed also returns livenessScore
(probability the face is real, 0..1). Absent → livenessScore is null and
the NestJS backend skips the passive-liveness gate.

Quality gate: every /embed computes face box size (px), brightness (mean
gray) and sharpness (variance of Laplacian) on the face crop. Thresholds
are env-tunable; failures return ok=false error="low_quality" with the
metrics so the kiosk can tell the operator WHY (too dark / too far / blurry).

The embedding is returned as base64 of the little-endian float32 byte array,
matching how the mobile client encodes/decodes embeddings (see
mobile/app/.../FaceEmbedder.kt::decodeEmbeddingB64).
"""
from __future__ import annotations

import base64
import io
import logging
import os
import struct
from typing import Optional

import numpy as np
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from PIL import Image
from pydantic import BaseModel, model_validator

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("face-svc")

# ---------------------------------------------------------------- configuration
EMBEDDING_BACKEND = os.environ.get("EMBEDDING_BACKEND", "mobilefacenet").strip().lower()

# mobilefacenet backend
MODEL_PATH = os.environ.get("MODEL_PATH", "/models/mobilefacenet.tflite")
MFN_INPUT_SIZE = 112
MFN_EMBED_DIM = 192
MFN_MODEL_NAME = "mobilefacenet-v1"

# insightface backend
INSIGHTFACE_MODEL = os.environ.get("INSIGHTFACE_MODEL", "buffalo_l")
INSIGHTFACE_HOME = os.environ.get("INSIGHTFACE_HOME", "/models/insightface")
INSIGHTFACE_DET_SIZE = int(os.environ.get("INSIGHTFACE_DET_SIZE", "640"))
ARC_MODEL_NAME = f"arcface-{INSIGHTFACE_MODEL}-v1"

# passive liveness (optional MiniFASNet-style ONNX)
LIVENESS_MODEL_PATH = os.environ.get("LIVENESS_MODEL_PATH", "").strip()
LIVENESS_INPUT_SIZE = int(os.environ.get("LIVENESS_INPUT_SIZE", "80"))

# quality thresholds (computed on the face crop)
MIN_FACE_PX = int(os.environ.get("MIN_FACE_PX", "112"))
MIN_BRIGHTNESS = float(os.environ.get("MIN_BRIGHTNESS", "40"))
MAX_BRIGHTNESS = float(os.environ.get("MAX_BRIGHTNESS", "235"))
MIN_SHARPNESS = float(os.environ.get("MIN_SHARPNESS", "40"))
ENFORCE_QUALITY = os.environ.get("ENFORCE_QUALITY", "true").strip().lower() != "false"

app = FastAPI(title="statcompy face embedding service", version="2.0.0")


# Reject oversize bodies before FastAPI parses them. The backend caps JSON
# at 2 MB but a misconfigured or directly-reachable face-svc would otherwise
# accept arbitrary-size base64 and try to PIL.Image.open() it.
MAX_BODY_BYTES = int(os.environ.get("MAX_BODY_BYTES", str(4 * 1024 * 1024)))

# Shared-secret header. When set, all requests except /health must present
# a matching X-Face-Svc-Key. Empty/unset = auth disabled (back-compat for
# local dev), but production must inject it via Container App secret.
FACE_SVC_API_KEY = os.environ.get("FACE_SVC_API_KEY", "").strip()
_AUTH_EXEMPT_PATHS = {"/health", "/docs", "/openapi.json", "/redoc"}


@app.middleware("http")
async def _limit_body_size(request, call_next):
    cl = request.headers.get("content-length")
    if cl is not None:
        try:
            if int(cl) > MAX_BODY_BYTES:
                return JSONResponse(
                    {"ok": False, "error": "payload_too_large"}, status_code=413
                )
        except ValueError:
            return JSONResponse(
                {"ok": False, "error": "bad_content_length"}, status_code=400
            )
    return await call_next(request)


@app.middleware("http")
async def _require_api_key(request, call_next):
    if FACE_SVC_API_KEY and request.url.path not in _AUTH_EXEMPT_PATHS:
        supplied = request.headers.get("x-face-svc-key", "").strip()
        # constant-time compare to avoid timing leaks
        import hmac
        if not supplied or not hmac.compare_digest(supplied, FACE_SVC_API_KEY):
            return JSONResponse(
                {"ok": False, "error": "unauthorized"}, status_code=401
            )
    return await call_next(request)


# ---------------------------------------------------------------- model loaders
def _load_tflite():
    try:
        from tflite_runtime.interpreter import Interpreter  # type: ignore
    except ImportError:
        from tensorflow.lite.python.interpreter import Interpreter  # type: ignore
    interp = Interpreter(model_path=MODEL_PATH)
    interp.allocate_tensors()
    return interp


def _load_face_detector():
    import mediapipe as mp
    return mp.solutions.face_detection.FaceDetection(
        model_selection=1,  # 1 = full-range (better for selfies further than ~2m too)
        min_detection_confidence=0.5,
    )


def _load_insightface():
    from insightface.app import FaceAnalysis  # type: ignore
    fa = FaceAnalysis(
        name=INSIGHTFACE_MODEL,
        root=INSIGHTFACE_HOME,
        allowed_modules=["detection", "recognition"],
    )
    fa.prepare(ctx_id=-1, det_size=(INSIGHTFACE_DET_SIZE, INSIGHTFACE_DET_SIZE))
    return fa


def _load_liveness():
    import onnxruntime as ort  # type: ignore
    sess = ort.InferenceSession(LIVENESS_MODEL_PATH, providers=["CPUExecutionProvider"])
    return sess


_interp = None
_input_details = None
_output_details = None
_detector = None
_insight = None
_liveness = None


@app.on_event("startup")
def _startup() -> None:  # pragma: no cover
    global _interp, _input_details, _output_details, _detector, _insight, _liveness
    if EMBEDDING_BACKEND == "insightface":
        log.info("loading insightface model pack %s from %s", INSIGHTFACE_MODEL, INSIGHTFACE_HOME)
        _insight = _load_insightface()
    else:
        log.info("loading TFLite model from %s", MODEL_PATH)
        _interp = _load_tflite()
        _input_details = _interp.get_input_details()
        _output_details = _interp.get_output_details()
        log.info("model input: %s output: %s", _input_details[0]["shape"], _output_details[0]["shape"])
        _detector = _load_face_detector()
    if LIVENESS_MODEL_PATH:
        log.info("loading passive liveness model from %s", LIVENESS_MODEL_PATH)
        _liveness = _load_liveness()
    log.info("ready (backend=%s liveness=%s)", EMBEDDING_BACKEND, bool(_liveness))


# ---------------------------------------------------------------- API surface
class EmbedRequest(BaseModel):
    photoBase64: Optional[str] = None
    image: Optional[str] = None  # legacy alias used by older backend clients

    @model_validator(mode="after")
    def _one_of(self):
        if not self.photoBase64 and not self.image:
            raise ValueError("photoBase64 is required")
        return self

    @property
    def photo(self) -> str:
        return self.photoBase64 or self.image or ""


class QualityInfo(BaseModel):
    faceScore: float
    facePx: int
    brightness: float
    sharpness: float
    ok: bool
    reasons: list[str]


class EmbedResponse(BaseModel):
    ok: bool
    embeddingBase64: Optional[str] = None
    embedding: Optional[list[float]] = None
    faceScore: Optional[float] = None
    embeddingModel: Optional[str] = None
    quality: Optional[QualityInfo] = None
    livenessScore: Optional[float] = None
    error: Optional[str] = None


def _model_name() -> str:
    return ARC_MODEL_NAME if EMBEDDING_BACKEND == "insightface" else MFN_MODEL_NAME


@app.get("/health")
def health() -> dict:
    loaded = _insight is not None if EMBEDDING_BACKEND == "insightface" else _interp is not None
    return {
        "ok": True,
        "model_loaded": loaded,
        "model": _model_name(),
        "backend": EMBEDDING_BACKEND,
        "liveness_enabled": _liveness is not None,
    }


# ---------------------------------------------------------------- quality maths
def _quality_metrics(crop_rgb: np.ndarray, face_score: float) -> QualityInfo:
    """Brightness + sharpness on the face crop. Pure numpy (no OpenCV)."""
    gray = crop_rgb.astype(np.float32) @ np.asarray([0.299, 0.587, 0.114], dtype=np.float32)
    brightness = float(gray.mean())
    # variance of Laplacian (4-neighbour kernel) — classic blur metric
    lap = (
        -4.0 * gray[1:-1, 1:-1]
        + gray[:-2, 1:-1]
        + gray[2:, 1:-1]
        + gray[1:-1, :-2]
        + gray[1:-1, 2:]
    )
    sharpness = float(lap.var()) if lap.size else 0.0
    face_px = int(min(crop_rgb.shape[0], crop_rgb.shape[1]))

    reasons: list[str] = []
    if face_px < MIN_FACE_PX:
        reasons.append(f"face_too_small({face_px}px<{MIN_FACE_PX}px)")
    if brightness < MIN_BRIGHTNESS:
        reasons.append(f"too_dark({brightness:.0f}<{MIN_BRIGHTNESS:.0f})")
    if brightness > MAX_BRIGHTNESS:
        reasons.append(f"too_bright({brightness:.0f}>{MAX_BRIGHTNESS:.0f})")
    if sharpness < MIN_SHARPNESS:
        reasons.append(f"too_blurry({sharpness:.0f}<{MIN_SHARPNESS:.0f})")

    return QualityInfo(
        faceScore=face_score,
        facePx=face_px,
        brightness=round(brightness, 1),
        sharpness=round(sharpness, 1),
        ok=len(reasons) == 0,
        reasons=reasons,
    )


def _liveness_score(crop_rgb: np.ndarray) -> Optional[float]:
    """MiniFASNet-style passive anti-spoofing. Returns P(real) or None."""
    if _liveness is None:
        return None
    try:
        img = Image.fromarray(crop_rgb).resize(
            (LIVENESS_INPUT_SIZE, LIVENESS_INPUT_SIZE), Image.BILINEAR
        )
        x = np.asarray(img, dtype=np.float32) / 255.0
        x = np.transpose(x, (2, 0, 1))[None, ...]  # 1,3,H,W
        inp = _liveness.get_inputs()[0]
        out = _liveness.run(None, {inp.name: x})[0].reshape(-1)
        # MiniFASNet heads emit [spoof-2d, real, spoof-3d] logits; softmax → P(real)
        e = np.exp(out - out.max())
        probs = e / e.sum()
        real_idx = 1 if probs.shape[0] >= 3 else int(np.argmax(probs))
        return float(probs[real_idx])
    except Exception as exc:  # pylint: disable=broad-except
        log.warning("liveness scoring failed: %s", exc)
        return None


# ---------------------------------------------------------------- backends
def _embed_mobilefacenet(arr: np.ndarray):
    """Returns (emb, face_score, crop_rgb) or an error string."""
    res = _detector.process(arr)
    if not res.detections:
        return "no_face"

    h, w = arr.shape[:2]
    best = max(
        res.detections,
        key=lambda d: d.location_data.relative_bounding_box.width * d.location_data.relative_bounding_box.height,
    )
    bb = best.location_data.relative_bounding_box
    score = float(best.score[0]) if best.score else 0.0

    # mediapipe returns relative (0..1) coords; clamp + convert to absolute
    x = max(0, int(bb.xmin * w))
    y = max(0, int(bb.ymin * h))
    bw = max(1, int(bb.width * w))
    bh = max(1, int(bb.height * h))
    x2 = min(w, x + bw)
    y2 = min(h, y + bh)
    crop = arr[y:y2, x:x2]
    if crop.size == 0:
        return "bad_crop"

    # The shipped mobilefacenet.tflite has a FLOAT32 input tensor. The
    # standard MobileFaceNet preprocessing is (pixel - 127.5) / 128.0,
    # mapping uint8 [0,255] to roughly [-1, 1]. Feeding raw [0,255]
    # floats saturates the network and collapses all faces onto the
    # same embedding (cos > 0.97 between strangers — fix verified
    # 2026-03). For a quantised UINT8 input the interpreter handles
    # dequant internally and we just pass the uint8 pixels through.
    crop_pil = Image.fromarray(crop).resize((MFN_INPUT_SIZE, MFN_INPUT_SIZE), Image.BILINEAR)
    crop_np = np.asarray(crop_pil)  # uint8 H,W,3

    in_dtype = _input_details[0]["dtype"]
    if in_dtype == np.float32:
        in_tensor = (crop_np.astype(np.float32) - 127.5) / 128.0
    else:
        in_tensor = crop_np.astype(in_dtype)

    in_tensor = np.expand_dims(in_tensor, axis=0)  # 1,112,112,3

    try:
        _interp.set_tensor(_input_details[0]["index"], in_tensor)
        _interp.invoke()
        raw_emb = _interp.get_tensor(_output_details[0]["index"])  # 1,192
    except Exception as exc:  # pylint: disable=broad-except
        log.exception("invoke failed: %s", exc)
        return "model_failed"

    emb = np.asarray(raw_emb, dtype=np.float32).reshape(-1)
    if emb.shape[0] != MFN_EMBED_DIM:
        log.error("unexpected embedding shape %s, expected %d", emb.shape, MFN_EMBED_DIM)
        return "bad_embedding_dim"
    return emb, score, crop


def _embed_insightface(arr: np.ndarray):
    """SCRFD detect + landmark-aligned ArcFace embedding (512-d, L2-normed)."""
    # insightface expects BGR
    faces = _insight.get(arr[:, :, ::-1])
    if not faces:
        return "no_face"
    best = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
    x1, y1, x2, y2 = (int(max(0, v)) for v in best.bbox[:4])
    h, w = arr.shape[:2]
    crop = arr[min(y1, h):min(y2, h), min(x1, w):min(x2, w)]
    if crop.size == 0:
        return "bad_crop"
    emb = np.asarray(best.normed_embedding, dtype=np.float32).reshape(-1)
    score = float(best.det_score)
    return emb, score, crop


@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest) -> JSONResponse:
    # 1. decode base64 → PIL RGB image
    try:
        raw = base64.b64decode(req.photo, validate=False)
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:  # pylint: disable=broad-except
        log.warning("decode failed: %s", exc)
        return JSONResponse(EmbedResponse(ok=False, error="decode_failed").model_dump(), status_code=400)

    arr = np.asarray(img, dtype=np.uint8)

    # 2. detect + embed via the configured backend
    result = (
        _embed_insightface(arr) if EMBEDDING_BACKEND == "insightface" else _embed_mobilefacenet(arr)
    )
    if isinstance(result, str):
        status = 500 if result in ("model_failed", "bad_embedding_dim") else 422
        return JSONResponse(EmbedResponse(ok=False, error=result).model_dump(), status_code=status)

    emb, score, crop = result

    # 3. quality gate on the face crop
    quality = _quality_metrics(crop, score)
    if ENFORCE_QUALITY and not quality.ok:
        return JSONResponse(
            EmbedResponse(ok=False, error="low_quality", quality=quality).model_dump(),
            status_code=422,
        )

    # 4. L2 normalise (matches mobile FaceEmbedder.l2Normalize; insightface
    #    embeddings arrive normed already — renorm is a harmless no-op)
    norm = float(np.linalg.norm(emb))
    if norm < 1e-9:
        return JSONResponse(EmbedResponse(ok=False, error="zero_embedding").model_dump(), status_code=500)
    emb = emb / norm

    # 5. optional passive liveness
    liveness = _liveness_score(crop)

    # encode as little-endian float32 byte array (mobile decodes with LITTLE_ENDIAN)
    dim = emb.shape[0]
    payload = struct.pack(f"<{dim}f", *emb.tolist())
    b64 = base64.b64encode(payload).decode("ascii")

    return JSONResponse(
        EmbedResponse(
            ok=True,
            embeddingBase64=b64,
            embedding=[round(float(v), 8) for v in emb.tolist()],
            faceScore=score,
            embeddingModel=_model_name(),
            quality=quality,
            livenessScore=liveness,
        ).model_dump()
    )
