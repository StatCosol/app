# Comprehensive API Endpoint Testing
$baseUrl = "http://localhost:3000"
$testResults = @()

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Url,
        [hashtable]$Headers = @{},
        [string]$Body = $null
    )
    
    try {
        $params = @{
            Uri = $Url
            Method = $Method
            Headers = $Headers
        }
        
        if ($Body) {
            $params.Body = $Body
            $params.ContentType = "application/json"
        }
        
        $response = Invoke-RestMethod @params
        $testResults += [PSCustomObject]@{
            Test = $Name
            Status = "PASS"
            Method = $Method
            Endpoint = $Url.Replace($baseUrl, "")
            Response = if ($response.Count) { "$($response.Count) items" } else { "Success" }
        }
        Write-Host "[PASS] $Name" -ForegroundColor Green
        return $response
    }
    catch {
        $testResults += [PSCustomObject]@{
            Test = $Name
            Status = "FAIL"
            Method = $Method
            Endpoint = $Url.Replace($baseUrl, "")
            Response = $_.Exception.Message
        }
        Write-Host "[FAIL] $Name - $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

Write-Host "=== StatCo Comply Comprehensive API Testing ===" -ForegroundColor Cyan
Write-Host ""

# 1. Health Check
Write-Host "1. Infrastructure Tests" -ForegroundColor Yellow
Test-Endpoint -Name "Health Check" -Method "GET" -Url "$baseUrl/api/health"
Write-Host ""

# 2. Authentication
Write-Host "2. Authentication Tests" -ForegroundColor Yellow
$loginBody = '{"email":"admin@statcosol.com","password":"Admin@123"}'
$loginResponse = Test-Endpoint -Name "Admin Login" -Method "POST" -Url "$baseUrl/api/auth/login" -Body $loginBody

if ($loginResponse) {
    $token = $loginResponse.accessToken
    $headers = @{ Authorization = "Bearer $token" }
    Write-Host "   Token obtained successfully" -ForegroundColor Gray
} else {
    Write-Host "   Cannot proceed without authentication" -ForegroundColor Red
    exit
}
Write-Host ""

# 3. Admin Module Tests
Write-Host "3. Admin Module Tests" -ForegroundColor Yellow
Test-Endpoint -Name "Admin Dashboard Summary" -Method "GET" -Url "$baseUrl/api/admin/dashboard/summary" -Headers $headers
Test-Endpoint -Name "Admin System Health" -Method "GET" -Url "$baseUrl/api/admin/dashboard/system-health" -Headers $headers
Test-Endpoint -Name "Admin Clients List" -Method "GET" -Url "$baseUrl/api/admin/clients" -Headers $headers
Test-Endpoint -Name "Admin Users List" -Method "GET" -Url "$baseUrl/api/admin/users" -Headers $headers
Test-Endpoint -Name "Admin Branches List" -Method "GET" -Url "$baseUrl/api/admin/branches" -Headers $headers
Test-Endpoint -Name "Admin Assignments List" -Method "GET" -Url "$baseUrl/api/admin/assignments" -Headers $headers
Test-Endpoint -Name "Admin Compliance Master" -Method "GET" -Url "$baseUrl/api/admin/masters/compliances" -Headers $headers
Test-Endpoint -Name "Admin Digest Status" -Method "GET" -Url "$baseUrl/api/admin/reminders/status" -Headers $headers
Write-Host ""

# 4. CEO Module Tests
Write-Host "4. CEO Module Tests" -ForegroundColor Yellow
Test-Endpoint -Name "CEO Dashboard Summary" -Method "GET" -Url "$baseUrl/api/ceo/dashboard/summary" -Headers $headers
Test-Endpoint -Name "CEO Client Overview" -Method "GET" -Url "$baseUrl/api/ceo/dashboard/client-overview" -Headers $headers
Test-Endpoint -Name "CEO CCO/CRM Performance" -Method "GET" -Url "$baseUrl/api/ceo/dashboard/cco-crm-performance" -Headers $headers
Write-Host ""

# 5. CCO Module Tests
Write-Host "5. CCO Module Tests" -ForegroundColor Yellow
Test-Endpoint -Name "CCO Dashboard Summary" -Method "GET" -Url "$baseUrl/api/cco/dashboard/summary" -Headers $headers
Test-Endpoint -Name "CCO CRMs List" -Method "GET" -Url "$baseUrl/api/cco/users?role=CRM" -Headers $headers
Test-Endpoint -Name "CCO Clients List" -Method "GET" -Url "$baseUrl/api/cco/clients" -Headers $headers
Write-Host ""

# 6. CRM Module Tests
Write-Host "6. CRM Module Tests" -ForegroundColor Yellow
Test-Endpoint -Name "CRM Dashboard Summary" -Method "GET" -Url "$baseUrl/api/crm/dashboard/summary" -Headers $headers
Test-Endpoint -Name "CRM Due Compliances" -Method "GET" -Url "$baseUrl/api/crm/dashboard/due-compliances?tab=OVERDUE" -Headers $headers
Test-Endpoint -Name "CRM Low Coverage Branches" -Method "GET" -Url "$baseUrl/api/crm/dashboard/low-coverage-branches" -Headers $headers
Test-Endpoint -Name "CRM Pending Documents" -Method "GET" -Url "$baseUrl/api/crm/dashboard/pending-documents" -Headers $headers
Test-Endpoint -Name "CRM Queries" -Method "GET" -Url "$baseUrl/api/crm/dashboard/queries" -Headers $headers
Write-Host ""

# 7. Auditor Module Tests
Write-Host "7. Auditor Module Tests" -ForegroundColor Yellow
Test-Endpoint -Name "Auditor Dashboard Summary" -Method "GET" -Url "$baseUrl/api/auditor/dashboard/summary" -Headers $headers
Test-Endpoint -Name "Auditor Audits List" -Method "GET" -Url "$baseUrl/api/auditor/audits" -Headers $headers
Write-Host ""

# 8. Client Module Tests
Write-Host "8. Client Module Tests" -ForegroundColor Yellow
Test-Endpoint -Name "Client Dashboard Summary" -Method "GET" -Url "$baseUrl/api/client/dashboard/summary" -Headers $headers
Write-Host ""

# 9. Contractor Module Tests
Write-Host "9. Contractor Module Tests" -ForegroundColor Yellow
Test-Endpoint -Name "Contractor Dashboard Summary" -Method "GET" -Url "$baseUrl/api/contractor/dashboard/summary" -Headers $headers
Write-Host ""

# 10. Notification System Tests
Write-Host "10. Notification System Tests" -ForegroundColor Yellow
Test-Endpoint -Name "Notifications Inbox" -Method "GET" -Url "$baseUrl/api/notifications/list?view=inbox" -Headers $headers
Test-Endpoint -Name "Notifications Outbox" -Method "GET" -Url "$baseUrl/api/notifications/list?view=outbox" -Headers $headers
Write-Host ""

# 11. Reports Module Tests
Write-Host "11. Reports Module Tests" -ForegroundColor Yellow
Test-Endpoint -Name "Reports List" -Method "GET" -Url "$baseUrl/api/reports" -Headers $headers
Write-Host ""

# 12. Payroll Module Tests
Write-Host "12. Payroll Module Tests" -ForegroundColor Yellow
Test-Endpoint -Name "Payroll Dashboard" -Method "GET" -Url "$baseUrl/api/payroll" -Headers $headers
Write-Host ""

# Summary
Write-Host ""
Write-Host "=== Test Summary ===" -ForegroundColor Cyan
$passed = ($testResults | Where-Object { $_.Status -eq "PASS" }).Count
$failed = ($testResults | Where-Object { $_.Status -eq "FAIL" }).Count
$total = $testResults.Count

Write-Host "Total Tests: $total" -ForegroundColor White
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor Red
Write-Host "Success Rate: $([math]::Round(($passed/$total)*100, 2))%" -ForegroundColor Cyan
Write-Host ""

# Export results
$testResults | Format-Table -AutoSize
$testResults | Export-Csv -Path "endpoint-test-results.csv" -NoTypeInformation
Write-Host "Results exported to endpoint-test-results.csv" -ForegroundColor Gray
