$base = "http://localhost:3000"

$users = @(
    @{ role = 'CEO';        email = 'mkkallepalli@gmail.com';   pwd = 'Statco@123'; endpoints = @('/api/ceo/dashboard/summary', '/api/ceo/dashboard/client-overview') },
    @{ role = 'CCO';        email = 'compliance@statcosol.com'; pwd = 'Statco@123'; endpoints = @('/api/cco/dashboard', '/api/cco/crms-under-me') },
    @{ role = 'CRM';        email = 'slvmgmtconsultants@gmail.com'; pwd = 'Statco@123'; endpoints = @('/api/crm/dashboard', '/api/crm/dashboard/due-compliances?tab=OVERDUE') },
    @{ role = 'AUDITOR';    email = 'payroll_audit@statcosol.com'; pwd = 'Statco@123'; endpoints = @('/api/auditor/dashboard/summary', '/api/auditor/audits') },
    @{ role = 'CLIENT';     email = 'sravan@vedhaentch.com';      pwd = 'Statco@123'; endpoints = @('/api/client/dashboard', '/api/client/contractors') },
    @{ role = 'CONTRACTOR'; email = 'srisai@gmail.com';           pwd = 'Statco@123'; endpoints = @('/api/contractor/dashboard', '/api/contractor/documents') }
)

Write-Host "=== Role smoke ==="

foreach ($u in $users) {
    Write-Host "`n[$($u.role)] login..." -ForegroundColor Cyan
    try {
        $login = Invoke-RestMethod -Uri "$base/api/auth/login" -Method Post -Body (@{ email = $u.email; password = $u.pwd } | ConvertTo-Json) -ContentType 'application/json'
        $token = $login.accessToken
        if (-not $token) { throw "No token returned" }
        Write-Host "  ✓ login"
        $headers = @{ Authorization = "Bearer $token" }
        foreach ($ep in $u.endpoints) {
            try {
                $res = Invoke-RestMethod -Uri "$base$ep" -Headers $headers -Method Get -SkipHttpErrorCheck -ErrorAction SilentlyContinue
                if ($res -is [System.Net.Http.HttpResponseMessage]) {
                    $code = $res.StatusCode.Value__
                } elseif ($res.PSObject.Properties.Name -contains 'statusCode') {
                    $code = $res.statusCode
                } else {
                    $code = 200
                }
                Write-Host "  $code $ep"
            }
            catch {
                Write-Host ("  ✗ " + $ep + ": " + $_.Exception.Message) -ForegroundColor Yellow
            }
        }
    }
    catch {
        Write-Host ("  ✗ login failed: " + $_.Exception.Message) -ForegroundColor Red
    }
}
