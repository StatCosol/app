# ─────────────────────────────────────────────────────────────
# Azure Infrastructure Setup for Statcompy
# Architecture: Container Apps + ACR + PostgreSQL Flex + Azure Files
# Run once to provision all resources. Requires Azure CLI (az).
# ─────────────────────────────────────────────────────────────

param(
    [string]$ResourceGroup   = "statcompy-rg",
    [string]$Location        = "centralindia",
    [string]$AcrName         = "statcompyacr001",
    [string]$ContainerEnv    = "statcompy-env",
    [string]$BackendApp      = "statcompy-backend",
    [string]$FrontendApp     = "statcompy-frontend",
    [string]$FrontendOrigin  = "https://app.statcosol.com",
    [string]$FrontendPath    = "/app",
    [string]$DbServerName    = "statcompy-db",
    [string]$DbName          = "statcompy",
    [string]$StorageAccount  = "statcompystorage",
    [string]$FileShareName   = "statcompy-uploads",
    [Parameter(Mandatory)][string]$DbAdmin,
    [Parameter(Mandatory)][string]$DbPassword,
    [Parameter(Mandatory)][string]$JwtSecret
)

$ErrorActionPreference = "Stop"
$FrontendPublicUrl = "{0}{1}" -f $FrontendOrigin.TrimEnd('/'), $FrontendPath

# ── 1. Resource Group ────────────────────────────────────────
Write-Host "`n=== 1. Resource Group ===" -ForegroundColor Cyan
az group create --name $ResourceGroup --location $Location

# ── 2. Azure Container Registry ─────────────────────────────
Write-Host "`n=== 2. Azure Container Registry ===" -ForegroundColor Cyan
az acr create --resource-group $ResourceGroup --name $AcrName --sku Basic

az acr login --name $AcrName
$acrLoginServer = az acr show --name $AcrName --query loginServer -o tsv

# ── 3. PostgreSQL Flexible Server ────────────────────────────
Write-Host "`n=== 3. PostgreSQL Flexible Server ===" -ForegroundColor Cyan
az postgres flexible-server create `
    --resource-group $ResourceGroup `
    --name $DbServerName `
    --location $Location `
    --admin-user $DbAdmin `
    --admin-password $DbPassword `
    --sku-name Standard_B1ms `
    --tier Burstable `
    --storage-size 32 `
    --version 16 `
    --public-access 0.0.0.0 `
    --yes

# Create database and enable SSL
az postgres flexible-server db create `
    --resource-group $ResourceGroup `
    --server-name $DbServerName `
    --database-name $DbName

az postgres flexible-server firewall-rule create `
    --resource-group $ResourceGroup `
    --name $DbServerName `
    --rule-name AllowAzureServices `
    --start-ip-address 0.0.0.0 `
    --end-ip-address 0.0.0.0

$dbHost = "${DbServerName}.postgres.database.azure.com"

# ── 4. Storage Account & Azure File Share ────────────────────
Write-Host "`n=== 4. Storage Account & File Share ===" -ForegroundColor Cyan
az storage account create `
    --resource-group $ResourceGroup `
    --name $StorageAccount `
    --location $Location `
    --sku Standard_LRS `
    --kind StorageV2

$storageKey = (az storage account keys list `
    --resource-group $ResourceGroup `
    --account-name $StorageAccount `
    --query "[0].value" -o tsv)

az storage share create `
    --account-name $StorageAccount `
    --account-key $storageKey `
    --name $FileShareName `
    --quota 5

# ── 5. Container Apps Environment ────────────────────────────
Write-Host "`n=== 5. Container Apps Environment ===" -ForegroundColor Cyan
az extension add --name containerapp --upgrade --yes
az provider register --namespace Microsoft.App --wait
az provider register --namespace Microsoft.OperationalInsights --wait

az containerapp env create `
    --name $ContainerEnv `
    --resource-group $ResourceGroup `
    --location $Location

# Add Azure Files storage to environment
az containerapp env storage set `
    --name $ContainerEnv `
    --resource-group $ResourceGroup `
    --storage-name uploadstorage `
    --azure-file-account-name $StorageAccount `
    --azure-file-account-key $storageKey `
    --azure-file-share-name $FileShareName `
    --access-mode ReadWrite

# ── 6. Build & Push Images ───────────────────────────────────
Write-Host "`n=== 6. Build & Push Images ===" -ForegroundColor Cyan
$repoRoot = Split-Path -Parent $PSScriptRoot

docker build -t "${acrLoginServer}/statcompy-backend:latest" "$repoRoot/backend"
docker push "${acrLoginServer}/statcompy-backend:latest"

docker build -t "${acrLoginServer}/statcompy-frontend:latest" "$repoRoot/frontend"
docker push "${acrLoginServer}/statcompy-frontend:latest"

# ── 7. Deploy Backend Container App ─────────────────────────
Write-Host "`n=== 7. Backend Container App ===" -ForegroundColor Cyan
az containerapp create `
    --name $BackendApp `
    --resource-group $ResourceGroup `
    --environment $ContainerEnv `
    --image "${acrLoginServer}/statcompy-backend:latest" `
    --target-port 3000 `
    --ingress external `
    --registry-server $acrLoginServer `
    --cpu 1.0 `
    --memory 2.0Gi `
    --min-replicas 1 `
    --max-replicas 3 `
    --env-vars `
        NODE_ENV=production `
        PORT=3000 `
        "DB_HOST=${dbHost}" `
        DB_PORT=5432 `
        "DB_USER=${DbAdmin}" `
        "DB_PASS=${DbPassword}" `
        "DB_NAME=${DbName}" `
        DB_SSL=true `
        "JWT_SECRET=${JwtSecret}" `
        JWT_EXPIRES_IN=12h `
        JWT_ACCESS_EXPIRES_SEC=900 `
        SKIP_BOOTSTRAP_SEED=true `
        EMAIL_ENABLED=false `
        "FRONTEND_URL=${FrontendPublicUrl}" `
        "CORS_ORIGINS=${FrontendOrigin}"

# Mount Azure Files to /app/uploads
az containerapp update `
    --name $BackendApp `
    --resource-group $ResourceGroup `
    --set-env-vars UPLOADS_PATH=/app/uploads `
    --container-name $BackendApp `
    --revision-suffix "with-storage"

# Note: Volume mount requires YAML-based update or portal
# See Step 14 in deployment guide for portal-based mount setup
Write-Host "  >> Mount Azure File Share 'uploadstorage' to /app/uploads via Portal > Revision management" -ForegroundColor Yellow

# ── 8. Run Database Migrations ───────────────────────────────
Write-Host "`n=== 8. Run Database Migrations ===" -ForegroundColor Cyan
az containerapp job create `
    --name statcompy-migrate `
    --resource-group $ResourceGroup `
    --environment $ContainerEnv `
    --image "${acrLoginServer}/statcompy-backend:latest" `
    --registry-server $acrLoginServer `
    --cpu 0.5 `
    --memory 1.0Gi `
    --trigger-type Manual `
    --replica-timeout 300 `
    --env-vars `
        NODE_ENV=production `
        "DB_HOST=${dbHost}" `
        DB_PORT=5432 `
        "DB_USER=${DbAdmin}" `
        "DB_PASS=${DbPassword}" `
        "DB_NAME=${DbName}" `
        DB_SSL=true `
    --command "node" "scripts/apply-migrations.mjs"

az containerapp job start `
    --name statcompy-migrate `
    --resource-group $ResourceGroup

Write-Host "  >> Migration job started. Check status in portal." -ForegroundColor Yellow

# ── 9. Verify Backend Health ─────────────────────────────────
Write-Host "`n=== 9. Verify Backend ===" -ForegroundColor Cyan
$backendFqdn = az containerapp show `
    --name $BackendApp `
    --resource-group $ResourceGroup `
    --query "properties.configuration.ingress.fqdn" -o tsv

Write-Host "Backend URL: https://${backendFqdn}"
Write-Host "Health check: https://${backendFqdn}/api/v1/health"

# ── 10. Deploy Frontend Container App ────────────────────────
Write-Host "`n=== 10. Frontend Container App ===" -ForegroundColor Cyan
az containerapp create `
    --name $FrontendApp `
    --resource-group $ResourceGroup `
    --environment $ContainerEnv `
    --image "${acrLoginServer}/statcompy-frontend:latest" `
    --target-port 80 `
    --ingress external `
    --registry-server $acrLoginServer `
    --cpu 0.5 `
    --memory 1.0Gi `
    --min-replicas 1 `
    --max-replicas 3 `
    --env-vars `
        "BACKEND_URL=https://${backendFqdn}"

$frontendFqdn = az containerapp show `
    --name $FrontendApp `
    --resource-group $ResourceGroup `
    --query "properties.configuration.ingress.fqdn" -o tsv

# ── 11. Update Backend CORS with real frontend URL ───────────
Write-Host "`n=== 11. Update Backend CORS ===" -ForegroundColor Cyan
az containerapp update `
    --name $BackendApp `
    --resource-group $ResourceGroup `
    --set-env-vars `
        "FRONTEND_URL=${FrontendPublicUrl}" `
        "CORS_ORIGINS=${FrontendOrigin},https://${frontendFqdn}"

# ── Done ─────────────────────────────────────────────────────
Write-Host "`n=== Deployment Complete ===" -ForegroundColor Green
Write-Host "Backend:  https://${backendFqdn}"
Write-Host "Frontend (Azure): https://${frontendFqdn}/app/"
Write-Host "Frontend (Public): ${FrontendPublicUrl}"
Write-Host "Database: ${dbHost}:5432/${DbName}"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Mount Azure Files to /app/uploads via Portal (Revision management)"
Write-Host "  2. Test https://${backendFqdn}/api/v1/health"
Write-Host "  3. Route ${FrontendPath}/* on ${FrontendOrigin} to the frontend app"
Write-Host "  4. Route /api/* and /uploads/* on ${FrontendOrigin} to the frontend app or backend app"
Write-Host "  5. Add the custom domain in Azure Portal / Front Door and complete DNS validation"
Write-Host "  6. Run seed if needed from the backend container"
