# Test CEO Dashboard Endpoints

Write-Host "=== Testing CEO Dashboard Endpoints ===" -ForegroundColor Cyan

# Login
Write-Host "`n1. Logging in..." -ForegroundColor Yellow
$body = @{
    email = "admin@statcosol.com"
    password = "Admin@123"
} | ConvertTo-Json

try {
    $login = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -Body $body -ContentType "application/json"
    $token = $login.accessToken
    Write-Host "✓ Login successful" -ForegroundColor Green
} catch {
    Write-Host "✗ Login failed: $_" -ForegroundColor Red
    exit 1
}

$headers = @{
    Authorization = "Bearer $token"
}

# Test CEO Dashboard Summary
Write-Host "`n2. Testing GET /api/ceo/dashboard/summary" -ForegroundColor Yellow
try {
    $result = Invoke-RestMethod -Uri "http://localhost:3000/api/ceo/dashboard/summary" -Method GET -Headers $headers
    Write-Host "✓ CEO Dashboard Summary:" -ForegroundColor Green
    Write-Host ($result | ConvertTo-Json -Depth 3)
} catch {
    Write-Host "✗ Failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
}

# Test Client Overview
Write-Host "`n3. Testing GET /api/ceo/dashboard/client-overview" -ForegroundColor Yellow
try {
    $result = Invoke-RestMethod -Uri "http://localhost:3000/api/ceo/dashboard/client-overview" -Method GET -Headers $headers
    Write-Host "✓ Client Overview:" -ForegroundColor Green
    Write-Host ($result | ConvertTo-Json -Depth 3)
} catch {
    Write-Host "✗ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test CCO/CRM Performance
Write-Host "`n4. Testing GET /api/ceo/dashboard/cco-crm-performance" -ForegroundColor Yellow
try {
    $result = Invoke-RestMethod -Uri "http://localhost:3000/api/ceo/dashboard/cco-crm-performance" -Method GET -Headers $headers
    Write-Host "✓ CCO/CRM Performance:" -ForegroundColor Green
    Write-Host ($result | ConvertTo-Json -Depth 3)
} catch {
    Write-Host "✗ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test Governance Compliance
Write-Host "`n5. Testing GET /api/ceo/dashboard/governance-compliance" -ForegroundColor Yellow
try {
    $result = Invoke-RestMethod -Uri "http://localhost:3000/api/ceo/dashboard/governance-compliance" -Method GET -Headers $headers
    Write-Host "✓ Governance Compliance:" -ForegroundColor Green
    Write-Host ($result | ConvertTo-Json -Depth 3)
} catch {
    Write-Host "✗ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test Recent Escalations
Write-Host "`n6. Testing GET /api/ceo/dashboard/recent-escalations" -ForegroundColor Yellow
try {
    $result = Invoke-RestMethod -Uri "http://localhost:3000/api/ceo/dashboard/recent-escalations" -Method GET -Headers $headers
    Write-Host "✓ Recent Escalations:" -ForegroundColor Green
    Write-Host ($result | ConvertTo-Json -Depth 3)
} catch {
    Write-Host "✗ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== CEO Dashboard Testing Complete ===" -ForegroundColor Cyan
