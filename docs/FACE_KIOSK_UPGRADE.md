# Face Kiosk 1:N Accuracy Upgrade

Implements the accuracy roadmap: ArcFace model path, multi-template matching,
two-level decision with review fallback, per-client thresholds, passive
liveness hook, enrollment quality gates, duplicate detection over templates,
photo/embedding retention, and consent (already present, unchanged).

## What changed

### face-svc (v2)
- **Pluggable embedding backends** via `EMBEDDING_BACKEND`:
  - `mobilefacenet` (default) — unchanged behavior, byte-compatible with the
    Android kiosk's on-device embedder (192-d).
  - `insightface` — SCRFD detection + landmark **alignment** + ArcFace
    (`buffalo_l`, 512-d). Install `requirements-arcface.txt` or build the
    image with `--build-arg WITH_ARCFACE=1`. Model pack downloads to
    `INSIGHTFACE_HOME` on first use (~280 MB; pre-bake for air-gapped envs).
- **Quality gate on every /embed**: face box px, brightness, Laplacian
  sharpness. Failures return `error=low_quality` with per-reason detail
  (`too_dark(31<40)` etc). Tune via `MIN_FACE_PX`, `MIN_BRIGHTNESS`,
  `MAX_BRIGHTNESS`, `MIN_SHARPNESS`; disable with `ENFORCE_QUALITY=false`.
- **Passive liveness hook**: set `LIVENESS_MODEL_PATH` to a MiniFASNet-style
  ONNX anti-spoof model → `/embed` returns `livenessScore` (P(real), 0..1).
  Unset → `null`, gate disabled.
- **Protocol fix**: accepts both `photoBase64` and legacy `image`; response
  carries both the base64 embedding and a JSON float array. (The old backend
  client and face-svc did not actually speak the same schema — the quality
  gate silently never ran.)

### Backend (NestJS)
- **Model-compat matching**: gallery entries whose `embedding_model` or
  dimension differ from the probe are excluded — no cross-model cosine.
- **Multi-template gallery** (`face_enrollment_templates`): each enrollment
  session appends a template (capped by `FACE_MAX_TEMPLATES`, default 4,
  oldest evicted). Matching takes MAX cosine per subject; the ambiguity
  margin is computed **between subjects**, never between one person's own
  templates. Optional auto-refresh: set `FACE_AUTO_REFRESH_MIN_SCORE`
  (e.g. 0.92) to append a template after very confident matches.
- **Two-level decision** on every punch:
  - `AUTO` — score ≥ auto-accept AND margin ≥ min-margin AND liveness OK →
    recorded + mirrored to daily attendance (unchanged path).
  - `REVIEW_PENDING` — score in the review band, or margin/liveness weak →
    punch is stored with full audit data + photo but **not** counted; kiosk
    shows a generic "held for review" message (no name leak on borderline
    matches). Admin approves/rejects at
    `GET /api/v1/mobile-attendance/punches/review` and
    `POST /api/v1/mobile-attendance/punches/review/{employee|contractor}/:id`
    (`{ "action": "APPROVE" | "REJECT", "note?" }`). Approval resolves
    IN/OUT and mirrors to attendance.
  - Hard reject — below the review band (unchanged error).
- **Per-client threshold overrides** (NULL = env default): columns on
  `clients`: `face_auto_accept_score`, `face_review_min_score`,
  `face_min_match_margin`, `face_min_liveness_score`.
- **Server-side re-embedding**: `FACE_SERVER_EMBED=true` + `FACE_SVC_URL`
  set + punch carries a photo → the probe embedding is computed by face-svc
  (so an ArcFace rollout needs **no kiosk APK release**). Device embedding
  remains the fallback.
- **Duplicate check** now also scans extra templates, so one face cannot be
  registered under two identities even after re-enrollments drift.
- **Retention (opt-in, both unset by default = no deletion)**:
  - `FACE_PUNCH_PHOTO_RETENTION_DAYS` — daily 03:00 sweep deletes punch
    photos (S3 or local) older than N days and clears `photo_url`; match
    audit numbers are kept.
  - `FACE_EMBEDDING_RETENTION_AFTER_EXIT_DAYS` — employees/contractors
    inactive longer than N days get enrollment deactivated, embedding
    crypto-shredded, templates deleted.

## Environment variables (new)

| Variable | Default | Meaning |
|---|---|---|
| `EMBEDDING_BACKEND` (face-svc) | `mobilefacenet` | `insightface` enables ArcFace |
| `INSIGHTFACE_MODEL` / `INSIGHTFACE_HOME` / `INSIGHTFACE_DET_SIZE` | `buffalo_l` / `/models/insightface` / `640` | ArcFace pack config |
| `LIVENESS_MODEL_PATH` / `LIVENESS_INPUT_SIZE` (face-svc) | unset / `80` | passive anti-spoof ONNX |
| `MIN_FACE_PX`,`MIN_BRIGHTNESS`,`MAX_BRIGHTNESS`,`MIN_SHARPNESS`,`ENFORCE_QUALITY` (face-svc) | `112,40,235,40,true` | capture quality gate |
| `FACE_REVIEW_ENABLED` | `true` | two-level decision on/off |
| `FACE_REVIEW_MIN_SCORE` | auto − 0.06 | bottom of the review band |
| `FACE_MIN_LIVENESS_SCORE` | unset | passive liveness gate |
| `FACE_SERVER_EMBED` | `false` | probe embedding via face-svc |
| `FACE_AUTO_REFRESH_MIN_SCORE` | unset | template auto-refresh trigger |
| `FACE_MAX_TEMPLATES` | `4` | templates kept per subject |
| `FACE_PUNCH_PHOTO_RETENTION_DAYS` | unset | photo retention sweep |
| `FACE_EMBEDDING_RETENTION_AFTER_EXIT_DAYS` | unset | embedding shred after exit |
| `FACE_SVC_API_KEY` (backend) | unset | forwarded to face-svc |

## ArcFace rollout plan (zero kiosk-app release)

1. Build face-svc with ArcFace: `az acr build ... --build-arg WITH_ARCFACE=1`,
   deploy with `EMBEDDING_BACKEND=insightface` (keep the old revision handy).
2. Backend: set `FACE_SERVER_EMBED=true` (punches with photos re-embed
   server-side; `embedding_model` on punches flips to `arcface-buffalo_l-v1`).
3. **Re-enroll subjects** (admin/kiosk flow as usual). New enrollments get
   ArcFace embeddings; the matcher automatically partitions old vs new via
   the model filter, so un-re-enrolled people simply stop matching — drive
   re-enrollment site by site, watch the `0/N roster entries comparable`
   warning in logs to find stragglers.
4. Recalibrate thresholds: ArcFace cosine distributions differ from
   MobileFaceNet. Start at auto=0.45, review-min=0.35, margin=0.08 (ArcFace
   same-person cosine typically 0.5–0.8, impostor < 0.3), then tune from the
   `face punch match scores` log lines per client via the `clients.face_*`
   columns.

## Capture guidance (site setup — Android app follow-ups)

Fixed kiosk mount at face height, front light, no backlight/window behind
the user. The server now rejects too-dark/blurry/too-small captures with the
specific reason — surface `low_quality` reasons on the kiosk screen, and add
a face-box guide overlay in the app (tracked as a mobile follow-up; server
work is done).

## Scale note

Matching is brute-force cosine over the scoped roster (client+branch) —
fine to ~10k templates per site. Beyond that, move gallery search to
pgvector (already on Postgres) before reaching for FAISS.

## Follow-ups (not in this change)

- Kiosk app: face-box guide overlay + low_quality reason display + "held
  for review" screen styling.
- Review-queue UI page in the client portal (service methods
  `listReviewPunches` / `reviewPunch` are already in
  `client-mobile-attendance.service.ts`).
- Passive liveness model file procurement (MiniFASNet ONNX) and bake into
  the face-svc image for production.
