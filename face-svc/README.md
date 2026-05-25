# statcompy face-svc

Internal HTTP microservice that turns an enrollment **photo** into a
192-dim face **embedding** that is byte-compatible with the
on-device kiosk matcher (MobileFaceNet TFLite).

## Why a separate service

The Node backend container runs on Alpine (musl libc). `tflite-runtime`,
mediapipe, and most TF prebuilts ship glibc-only binaries, so we keep this
heavy ML dependency out of the main API container. Backend calls this service
over the internal Container App network — no public ingress.

## Endpoints

* `GET /health` — liveness.
* `POST /embed { photoBase64 }` →  
  `{ ok: true, embeddingBase64, faceScore, embeddingModel }`  
  or `{ ok: false, error: "no_face" | "decode_failed" | ... }`

The returned `embeddingBase64` is the base64 of the little-endian float32
byte array (192 floats = 768 bytes) — same encoding the Android client uses
when it self-enrolls.

## Build & deploy

```powershell
# 1. Pull the SAS URL for the model (same secret used by Android CI).
$modelUrl = gh secret list --repo StatCosol/app   # see MOBILEFACENET_TFLITE_URL

# 2. Build in ACR (Docker not required locally).
az acr build `
    --registry statcompyacr001 `
    --image face-svc:latest `
    --file face-svc/Dockerfile `
    --build-arg MOBILEFACENET_TFLITE_URL="$modelUrl" `
    face-svc

# 3. First-time create (internal-only ingress, on the same env as backend).
$env_id = az containerapp env list -g statcompy-rg --query "[0].id" -o tsv
# Generate a shared secret used to auth backend → face-svc.
$apiKey = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Min 0 -Max 256 } | ForEach-Object { [byte]$_ }))
az containerapp create `
    -g statcompy-rg -n statcompy-face-svc `
    --environment $env_id `
    --image statcompyacr001.azurecr.io/face-svc:latest `
    --ingress internal --target-port 8080 `
    --min-replicas 1 --max-replicas 3 `
    --cpu 1.0 --memory 2.0Gi `
    --secrets "api-key=$apiKey" `
    --env-vars "FACE_SVC_API_KEY=secretref:api-key" `
    --registry-server statcompyacr001.azurecr.io

# 4. Tell the backend where to find it (and inject the same shared secret).
$face_url = "http://statcompy-face-svc"  # internal DNS in the env
az containerapp secret set -g statcompy-rg -n statcompy-backend `
    --secrets "face-svc-api-key=$apiKey"
az containerapp update `
    -n statcompy-backend -g statcompy-rg `
    --set-env-vars "FACE_SVC_URL=$face_url" "FACE_SVC_API_KEY=secretref:face-svc-api-key"
```

## Subsequent updates

```powershell
az acr build --registry statcompyacr001 --image face-svc:latest `
    --file face-svc/Dockerfile `
    --build-arg MOBILEFACENET_TFLITE_URL="$modelUrl" face-svc
az containerapp update -g statcompy-rg -n statcompy-face-svc `
    --image statcompyacr001.azurecr.io/face-svc:latest
```
