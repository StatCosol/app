# AuditXpert (Auditor portal) smoke test
$ErrorActionPreference = 'Continue'
$be = 'https://statcompy-backend.victoriouswave-37ad896d.centralindia.azurecontainerapps.io'
$fe = 'https://statcompy-frontend.victoriouswave-37ad896d.centralindia.azurecontainerapps.io'

function Hit([string]$Label, [string]$Method, [string]$Url, $Headers, $Body) {
    try {
        $params = @{ Method = $Method; Uri = $Url; Headers = $Headers }
        if ($Body) { $params.Body = ($Body | ConvertTo-Json -Compress); $params.ContentType = 'application/json' }
        $r = Invoke-WebRequest @params -UseBasicParsing
        $code = $r.StatusCode
        $len  = $r.Content.Length
        Write-Host ("[OK ] {0,3} {1,-55} {2}b" -f $code, $Label, $len) -ForegroundColor Green
        return $r.Content
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        $msg  = $_.ErrorDetails.Message
        if ($code -in @(200,201,204)) {
            Write-Host ("[OK ] {0,3} {1}" -f $code, $Label) -ForegroundColor Green
        } else {
            Write-Host ("[ERR] {0,3} {1} -> {2}" -f $code, $Label, $msg) -ForegroundColor Red
        }
    }
}

Write-Host "`n=== 1. AUTH ===" -ForegroundColor Cyan
$adm = Invoke-RestMethod -Method Post -Uri "$be/api/v1/auth/login" -ContentType 'application/json' `
        -Body '{"email":"it_admin@statcosol.com","password":"Admin@123"}'
$aH  = @{ Authorization = "Bearer $($adm.accessToken)" }
Write-Host "Admin token OK"

$aud = Invoke-RestMethod -Method Post -Uri "$be/api/v1/auth/login" -ContentType 'application/json' `
        -Body '{"email":"crm_india@statcosol.com","password":"Reset@5755"}'
$uH  = @{ Authorization = "Bearer $($aud.accessToken)" }
Write-Host "Auditor token OK (id=$($aud.user.id) role=$($aud.user.role))"

Write-Host "`n=== 2. AUDITOR DASHBOARD ===" -ForegroundColor Cyan
Hit 'GET dashboard/summary'           GET "$be/api/v1/auditor/audits/dashboard/summary"          $uH | Out-Null
Hit 'GET dashboard/upcoming'          GET "$be/api/v1/auditor/audits/dashboard/upcoming"         $uH | Out-Null
Hit 'GET dashboard/recent-submitted'  GET "$be/api/v1/auditor/audits/dashboard/recent-submitted" $uH | Out-Null
Hit 'GET dashboard/audits?tab=ACTIVE' GET "$be/api/v1/auditor/audits/dashboard/audits?tab=ACTIVE" $uH | Out-Null
Hit 'GET dashboard/audits?tab=COMPLETED' GET "$be/api/v1/auditor/audits/dashboard/audits?tab=COMPLETED" $uH | Out-Null

Write-Host "`n=== 3. AUDIT LISTING ===" -ForegroundColor Cyan
$listJson = Hit 'GET /auditor/audits' GET "$be/api/v1/auditor/audits" $uH
$list = $listJson | ConvertFrom-Json
$audits = @(if ($list.data) { $list.data } elseif ($list.items) { $list.items } elseif ($list -is [array]) { $list } else { @() })
Write-Host ("Auditor sees {0} audits" -f $audits.Count)

Write-Host "`n=== 4. STATIC SUB-ROUTES ===" -ForegroundColor Cyan
Hit 'GET reverification/list'  GET "$be/api/v1/auditor/audits/reverification/list" $uH | Out-Null
Hit 'GET non-compliances/overdue (Phase 5/6)' GET "$be/api/v1/auditor/audits/non-compliances/overdue" $uH | Out-Null

Write-Host "`n=== 5. PER-AUDIT WORKSPACE ENDPOINTS ===" -ForegroundColor Cyan
if ($audits.Count -gt 0) {
    $a = $audits[0]
    $aid = $a.id
    $cid = $a.clientId
    Write-Host "Sample audit: $($a.auditCode) [$aid] client=$cid"
    Hit "GET :id (workspace info)"      GET "$be/api/v1/auditor/audits/$aid"                       $uH | Out-Null
    Hit "GET :id/documents"             GET "$be/api/v1/auditor/audits/$aid/documents"             $uH | Out-Null
    Hit "GET :id/checklist"             GET "$be/api/v1/auditor/audits/$aid/checklist"             $uH | Out-Null
    Hit "GET :id/nc-overview"           GET "$be/api/v1/auditor/audits/$aid/nc-overview"           $uH | Out-Null
    Hit "GET :id/non-compliances"       GET "$be/api/v1/auditor/audits/$aid/non-compliances"       $uH | Out-Null
    Hit "GET :id/submission-history"    GET "$be/api/v1/auditor/audits/$aid/submission-history"    $uH | Out-Null
    Hit "GET :id/upload-lock"           GET "$be/api/v1/auditor/audits/$aid/upload-lock"           $uH | Out-Null
    Hit "GET :id/readiness"             GET "$be/api/v1/auditor/audits/$aid/readiness"             $uH | Out-Null
    Hit "GET :id/report-status"         GET "$be/api/v1/auditor/audits/$aid/report-status"         $uH | Out-Null
    Hit "GET reports/:id/latest"        GET "$be/api/v1/auditor/audits/reports/$aid/latest"        $uH | Out-Null
    Hit "GET reports/:id/history"       GET "$be/api/v1/auditor/audits/reports/$aid/history"       $uH | Out-Null

    if ($cid) {
        Hit "GET contractors?clientId"          GET "$be/api/v1/auditor/audits/contractors?clientId=$cid" $uH | Out-Null
        Hit "GET analytics/repeat-ncs/:client"  GET "$be/api/v1/auditor/audits/analytics/repeat-ncs/$cid" $uH | Out-Null
    }
} else {
    Write-Host "No audits assigned to this auditor - per-audit endpoints skipped." -ForegroundColor Yellow
}

Write-Host "`n=== 6. RBAC (admin should be 403 on AUDITOR-only endpoints) ===" -ForegroundColor Cyan
Hit 'admin->dashboard/summary (expect 403)'      GET "$be/api/v1/auditor/audits/dashboard/summary"          $aH | Out-Null
Hit 'admin->non-compliances/overdue (expect 403)' GET "$be/api/v1/auditor/audits/non-compliances/overdue"   $aH | Out-Null
Hit 'admin->repeat-ncs (expect 200 - override)' GET "$be/api/v1/auditor/audits/analytics/repeat-ncs/00000000-0000-0000-0000-000000000000" $aH | Out-Null

Write-Host "`n=== 7. FRONTEND ROOT ===" -ForegroundColor Cyan
$root = Invoke-WebRequest -Uri $fe -UseBasicParsing
Write-Host ('FE / -> HTTP {0} ({1} bytes)' -f $root.StatusCode, $root.Content.Length)

Write-Host "`n=== DONE ===" -ForegroundColor Cyan
