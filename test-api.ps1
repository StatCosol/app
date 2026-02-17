# Simple API Test Script
$baseUrl = "http://localhost:3000"

Write-Host "Testing Health Endpoint..."
$health = Invoke-RestMethod -Uri "$baseUrl/api/health" -Method GET
Write-Host "Health: $($health | ConvertTo-Json)"
Write-Host ""

Write-Host "Testing Login..."
$body = '{"email":"admin@statcosol.com","password":"Admin@123"}'
try {
    $login = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -Body $body -ContentType "application/json"
    $token = $login.accessToken
    Write-Host "Login Success: $($login.user.fullName) - $($login.user.roleCode)"
    Write-Host "Token: $($token.Substring(0,50))..."
    Write-Host ""
    
    $headers = @{
        Authorization = "Bearer $token"
    }
    
    Write-Host "Testing Admin Dashboard..."
    $dashboard = Invoke-RestMethod -Uri "$baseUrl/api/admin/dashboard/summary" -Method GET -Headers $headers
    Write-Host "Dashboard: $($dashboard | ConvertTo-Json -Depth 2)"
    Write-Host ""
    
    Write-Host "Testing Clients List..."
    $clients = Invoke-RestMethod -Uri "$baseUrl/api/admin/clients" -Method GET -Headers $headers
    Write-Host "Clients Count: $($clients.Count)"
    Write-Host ""
    
    Write-Host "Testing Users List..."
    $users = Invoke-RestMethod -Uri "$baseUrl/api/admin/users" -Method GET -Headers $headers
    Write-Host "Users Count: $($users.Count)"
    Write-Host ""
    
    Write-Host "All tests completed successfully!"
    
}
catch {
    Write-Host "Error: $($_.Exception.Message)"
    Write-Host "Response: $($_.ErrorDetails.Message)"
}
