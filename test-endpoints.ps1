# Test StatCo Comply API Endpoints
Write-Host "=== StatCo Comply API Endpoint Testing ===" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "http://localhost:3000"

# Test 1: Health Check
Write-Host "1. Testing Health Endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/health" -Method GET
    Write-Host "   ✓ Health Check: $($response | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Health Check Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 2: Login
Write-Host "2. Testing Login Endpoint..." -ForegroundColor Yellow
try {
    $loginBody = @{
        email = "admin@statcosol.com"
        password = "Admin@123"
    } | ConvertTo-Json
    
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.accessToken
    Write-Host "   ✓ Login Successful" -ForegroundColor Green
    Write-Host "   User: $($loginResponse.user.fullName) ($($loginResponse.user.roleCode))" -ForegroundColor Green
    Write-Host "   Token: $($token.Substring(0, 50))..." -ForegroundColor Gray
} catch {
    Write-Host "   ✗ Login Failed: $($_.Exception.Message)" -ForegroundColor Red
    exit
}
Write-Host ""

# Test 3: Admin Dashboard Summary
Write-Host "3. Testing Admin Dashboard Summary..." -ForegroundColor Yellow
try {
    $headers = @{
        Authorization = "Bearer $token"
    }
    $response = Invoke-RestMethod -Uri "$baseUrl/api/admin/dashboard/summary" -Method GET -Headers $headers
    Write-Host "   ✓ Admin Dashboard Summary:" -ForegroundColor Green
    Write-Host "   $($response | ConvertTo-Json -Depth 3)" -ForegroundColor Gray
} catch {
    Write-Host "   ✗ Admin Dashboard Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 4: Admin Clients List
Write-Host "4. Testing Admin Clients List..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/admin/clients" -Method GET -Headers $headers
    Write-Host "   ✓ Clients List Retrieved: $($response.Count) clients" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Clients List Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 5: Admin Users List
Write-Host "5. Testing Admin Users List..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/admin/users" -Method GET -Headers $headers
    Write-Host "   ✓ Users List Retrieved: $($response.Count) users" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Users List Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 6: Admin Assignments List
Write-Host "6. Testing Admin Assignments List..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/admin/assignments" -Method GET -Headers $headers
    Write-Host "   ✓ Assignments List Retrieved: $($response.Count) assignments" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Assignments List Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 7: Notifications List
Write-Host "7. Testing Notifications Inbox..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/notifications/list?view=inbox" -Method GET -Headers $headers
    Write-Host "   ✓ Notifications Retrieved: $($response.Count) notifications" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Notifications Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 8: CRM Dashboard (if CRM user exists)
Write-Host "8. Testing CRM Dashboard Summary..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/crm/dashboard/summary" -Method GET -Headers $headers
    Write-Host "   ✓ CRM Dashboard Summary Retrieved" -ForegroundColor Green
} catch {
    Write-Host "   ⚠ CRM Dashboard: $($_.Exception.Message)" -ForegroundColor Yellow
}
Write-Host ""

# Test 9: Compliance Master List
Write-Host "9. Testing Compliance Master List..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/admin/masters/compliances" -Method GET -Headers $headers
    Write-Host "   ✓ Compliance Master Retrieved: $($response.Count) compliances" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Compliance Master Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 10: Reports Endpoint
Write-Host "10. Testing Reports Endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/reports" -Method GET -Headers $headers
    Write-Host "   ✓ Reports Endpoint Accessible" -ForegroundColor Green
} catch {
    Write-Host "   ⚠ Reports: $($_.Exception.Message)" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "=== Testing Complete ===" -ForegroundColor Cyan
