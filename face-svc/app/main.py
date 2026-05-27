"""
Face embedding microservice.

POST /embed
    Request:  { "photoBase64": "<base64 JPEG/PNG>" }
    Response: { "ok": true, "embeddingBase64": "<base64 little-endian float32[192]>",
                "faceScore": 0.97, "embeddingModel": "mobilefacenet-v1" }
              | { "ok": false, "error": "no_face" | "decode_failed" | "model_failed" }

Implementation notes
--------------------
* Face detection: mediapipe.solutions.face_detection (BlazeFace short-range model).
  Same family as ML Kit's on-device detector used by the Android app, so the
  bounding-box conventions line up well.
* Embedding: TFLite Interpreter loads the SAME `mobilefacenet.tflite` we ship
  in the Android APK (mobile/app/src/main/assets via secret-fetch in CI).
  Input: 112x112 RGB. Output: 192-d L2-normalized vector.
* Embeddings produced here are byte-compatible with embeddings produced by the
  Android FaceEmbedder → cosine similarity of probe vs stored embedding works.

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
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("face-svc")

MODEL_PATH = os.environ.get("MODEL_PATH", "/models/mobilefacenet.tflite")
INPUT_SIZE = 112
EMBED_DIM = 192
EMBEDDING_MODEL_NAME = "mobilefacenet-v1"

app = FastAPI(title="statcompy face embedding service", version="1.0.0")


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


_interp = None
_input_details = None
_output_details = None
_detector = None


@app.on_event("startup")
def _startup() -> None:  # pragma: no cover
    global _interp, _input_details, _output_details, _detector
    log.info("loading TFLite model from %s", MODEL_PATH)
    _interp = _load_tflite()
    _input_details = _interp.get_input_details()
    _output_details = _interp.get_output_details()
    log.info("model input: %s output: %s", _input_details[0]["shape"], _output_details[0]["shape"])
    _detector = _load_face_detector()
    log.info("ready")


# ---------------------------------------------------------------- API surface
class EmbedRequest(BaseModel):
    photoBase64: str


class EmbedResponse(BaseModel):
    ok: bool
    embeddingBase64: Optional[str] = None
    faceScore: Optional[float] = None
    embeddingModel: Optional[str] = None
    error: Optional[str] = None


@app.get("/health")
def health() -> dict:
    return {"ok": True, "model_loaded": _interp is not None, "model": EMBEDDING_MODEL_NAME}


@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest) -> JSONResponse:
    # 1. decode base64 → PIL RGB image
    try:
        raw = base64.b64decode(req.photoBase64, validate=False)
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:  # pylint: disable=broad-except
        log.warning("decode failed: %s", exc)
        return JSONResponse(EmbedResponse(ok=False, error="decode_failed").model_dump(), status_code=400)

    arr = np.asarray(img, dtype=np.uint8)

    # 2. detect largest face via mediapipe
    res = _detector.process(arr)
    if not res.detections:
        return JSONResponse(EmbedResponse(ok=False, error="no_face").model_dump(), status_code=422)

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
        return JSONResponse(EmbedResponse(ok=False, error="bad_crop").model_dump(), status_code=422)

    # 3. resize to 112x112 RGB, then preprocess for the model.
    #    The shipped mobilefacenet.tflite has a FLOAT32 input tensor. The
    #    standard MobileFaceNet preprocessing is (pixel - 127.5) / 128.0,
    #    mapping uint8 [0,255] to roughly [-1, 1]. Feeding raw [0,255]
    #    floats saturates the network and collapses all faces onto the
    #    same embedding (cos > 0.97 between strangers — see fix verified
    #    in container 2026-03 with 3 distinct AI faces dropping from
    #    cos 0.97/0.98/0.99 to cos 0.32/0.26/0.11 after normalization).
    #    For a quantised UINT8 input the interpreter handles dequant
    #    internally and we just pass the uint8 pixels through.
    crop_pil = Image.fromarray(crop).resize((INPUT_SIZE, INPUT_SIZE), Image.BILINEAR)
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
        return JSONResponse(EmbedResponse(ok=False, error="model_failed").model_dump(), status_code=500)

    emb = np.asarray(raw_emb, dtype=np.float32).reshape(-1)
    if emb.shape[0] != EMBED_DIM:
        log.error("unexpected embedding shape %s, expected %d", emb.shape, EMBED_DIM)
        return JSONResponse(EmbedResponse(ok=False, error="bad_embedding_dim").model_dump(), status_code=500)

    # L2 normalise (matches mobile FaceEmbedder.l2Normalize)
    norm = float(np.linalg.norm(emb))
    if norm < 1e-9:
        return JSONResponse(EmbedResponse(ok=False, error="zero_embedding").model_dump(), status_code=500)
    emb = emb / norm

    # encode as little-endian float32 byte array (mobile decodes with LITTLE_ENDIAN)
    payload = struct.pack(f"<{EMBED_DIM}f", *emb.tolist())
    b64 = base64.b64encode(payload).decode("ascii")

    return JSONResponse(
        EmbedResponse(
            ok=True,
            embeddingBase64=b64,
            faceScore=score,
            embeddingModel=EMBEDDING_MODEL_NAME,
        ).model_dump()
    )
