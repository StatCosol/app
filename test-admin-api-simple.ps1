# StatCo Admin API Testing Script
Write-Host "=== StatCo Admin API Testing ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Login and get token
Write-Host "1. Authenticating..." -ForegroundColor Yellow
$loginBody = Get-Content test-login.json -Raw
$loginResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
$token = $loginResponse.accessToken
Write-Host "   Token obtained" -ForegroundColor Green
Write-Host ""

# Step 2: Test Admin Dashboard Summary
Write-Host "2. Testing GET /api/admin/dashboard/summary" -ForegroundColor Yellow
try {
    $headers = @{ Authorization = "Bearer $token" }
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/admin/dashboard/summary" -Method Get -Headers $headers
    Write-Host "   Success" -ForegroundColor Green
    Write-Host "   Response: $($response | ConvertTo-Json -Depth 2 -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "   Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Step 3: Test Admin Clients List
Write-Host "3. Testing GET /api/admin/clients" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/admin/clients" -Method Get -Headers $headers
    Write-Host "   Success - Found $($response.Count) clients" -ForegroundColor Green
} catch {
    Write-Host "   Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Step 4: Test Admin Users List
Write-Host "4. Testing GET /api/admin/users" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/admin/users" -Method Get -Headers $headers
    Write-Host "   Success - Found $($response.Count) users" -ForegroundColor Green
} catch {
    Write-Host "   Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Step 5: Test Admin Assignments
Write-Host "5. Testing GET /api/admin/assignments" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/admin/assignments" -Method Get -Headers $headers
    Write-Host "   Success - Found $($response.Count) assignments" -ForegroundColor Green
} catch {
    Write-Host "   Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Step 6: Test Notifications
Write-Host "6. Testing GET /api/notifications/list" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/notifications/list" -Method Get -Headers $headers
    Write-Host "   Success" -ForegroundColor Green
} catch {
    Write-Host "   Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "=== Testing Complete ===" -ForegroundColor Cyan
