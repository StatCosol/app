
# Extract controller metadata from all NestJS controller files
$root = "c:\Users\statc\OneDrive\Desktop\statcompy\backend\src"
$files = Get-ChildItem -Path $root -Recurse -Filter "*.controller.ts" | Sort-Object FullName

$results = @()

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    $relPath = $file.FullName.Replace($root + "\", "").Replace("\", "/")
    $module = ($relPath -split "/")[0]

    # Find all @Controller decorators and class declarations
    # Pattern: @Controller('path') or @Controller({path:'...',version:'...'}) followed by class ClassName
    $classMatches = [regex]::Matches($content, '(?s)@Controller\(([^)]*)\)\s*(?:export\s+)?class\s+(\w+)')
    
    foreach ($cm in $classMatches) {
        $controllerArg = $cm.Groups[1].Value.Trim()
        $className = $cm.Groups[2].Value

        # Extract controller path
        $controllerPath = ""
        if ($controllerArg -match "'([^']*)'") {
            $controllerPath = $matches[1]
        } elseif ($controllerArg -match '"([^"]*)"') {
            $controllerPath = $matches[1]
        } elseif ($controllerArg -match '`([^`]*)`') {
            $controllerPath = $matches[1]
        } elseif ($controllerArg -match "path:\s*'([^']*)'") {
            $controllerPath = $matches[1]
        }

        # Extract version if specified in controller decorator
        $version = "1"
        if ($controllerArg -match "version:\s*'([^']*)'") {
            $version = $matches[1]
        }

        # Find the class body - from the class declaration to its closing brace
        $classStart = $cm.Index
        # Find all endpoints within this class context (until next class or end of file)
        $nextClassMatch = [regex]::Match($content.Substring($classStart + $cm.Length), '(?s)@Controller\(')
        if ($nextClassMatch.Success) {
            $classBody = $content.Substring($classStart, $cm.Length + $nextClassMatch.Index)
        } else {
            $classBody = $content.Substring($classStart)
        }

        # Find class-level @Roles
        $classRoles = ""
        # Look for @Roles before the class declaration but after any previous class
        $beforeClass = $content.Substring(0, $classStart)
        $lastDecorators = [regex]::Match($beforeClass, '(?s)((?:@\w+\([^)]*\)\s*)+)$')
        if ($lastDecorators.Success) {
            $decoratorBlock = $lastDecorators.Value
            if ($decoratorBlock -match "@Roles\(([^)]+)\)") {
                $classRoles = $matches[1]
            }
        }
        # Also check decorators right before the class keyword in the matched area
        $preClassArea = $content.Substring([Math]::Max(0, $classStart - 500), [Math]::Min(500, $classStart))
        $rolesBeforeClass = [regex]::Matches($preClassArea, '@Roles\(([^)]+)\)')
        if ($rolesBeforeClass.Count -gt 0) {
            $classRoles = $rolesBeforeClass[$rolesBeforeClass.Count - 1].Groups[1].Value
        }

        # Find all HTTP method decorators
        $httpMethods = [regex]::Matches($classBody, '(?s)(@Roles\(([^)]+)\)\s+)?@(Get|Post|Put|Patch|Delete|Head|Options|All)\(([^)]*)\)\s*(?:@[^\n]*\n\s*)*(?:async\s+)?(\w+)\s*\(')

        foreach ($hm in $httpMethods) {
            $methodRoles = if ($hm.Groups[2].Value) { $hm.Groups[2].Value } else { "" }
            $httpVerb = $hm.Groups[3].Value.ToUpper()
            $routeArg = $hm.Groups[4].Value.Trim().Trim("'").Trim('"')
            $methodName = $hm.Groups[5].Value

            # Also check for @Roles that might be a few lines before but not captured
            $beforeMethod = $classBody.Substring(0, [Math]::Max(0, $hm.Index))
            $lastLines = ($beforeMethod -split "`n") | Select-Object -Last 5
            $lastLinesStr = $lastLines -join "`n"
            if (-not $methodRoles -and $lastLinesStr -match '@Roles\(([^)]+)\)') {
                $methodRoles = $matches[1]
            }

            $effectiveRoles = if ($methodRoles) { $methodRoles } elseif ($classRoles) { $classRoles } else { "(none/JWT only)" }
            
            # Build full URL
            $fullPath = "/api/v$version"
            if ($controllerPath) { $fullPath += "/$controllerPath" }
            if ($routeArg -and $routeArg -ne "") { $fullPath += "/$routeArg" }
            # Clean up double slashes
            $fullPath = $fullPath -replace '//+', '/'

            $results += [PSCustomObject]@{
                Module = $module
                File = $relPath
                Class = $className
                ControllerPath = $controllerPath
                HttpMethod = $httpVerb
                RoutePath = $routeArg
                FullURL = $fullPath
                MethodName = $methodName
                Roles = $effectiveRoles
            }
        }

        # If no endpoints found, still record the controller
        if ($httpMethods.Count -eq 0) {
            $results += [PSCustomObject]@{
                Module = $module
                File = $relPath
                Class = $className
                ControllerPath = $controllerPath
                HttpMethod = "(none)"
                RoutePath = ""
                FullURL = "/api/v$version/$controllerPath"
                MethodName = "(none)"
                Roles = $classRoles
            }
        }
    }
}

# Output grouped by module
$grouped = $results | Group-Object Module | Sort-Object Name

$output = ""
foreach ($g in $grouped) {
    $output += "`n## Module: $($g.Name)`n"
    $byFile = $g.Group | Group-Object File
    foreach ($f in $byFile) {
        $output += "`n### $($f.Name)`n"
        $byClass = $f.Group | Group-Object Class
        foreach ($c in $byClass) {
            $output += "**Class: $($c.Name)** (Controller: ``$($c.Group[0].ControllerPath)``)`n"
            foreach ($ep in $c.Group) {
                $roleStr = $ep.Roles -replace "Role\.", "" -replace "'", "" -replace '"', ''
                # Determine appropriate test user
                $testUser = ""
                if ($roleStr -match "ADMIN|admin") { $testUser = "admin@statcosol.com" }
                elseif ($roleStr -match "CLIENT|client") { $testUser = "testclient@test.com" }
                elseif ($roleStr -match "none|JWT") { $testUser = "any authenticated user" }
                else { $testUser = "admin@statcosol.com (likely)" }
                
                $output += "| ``$($ep.HttpMethod)`` | ``$($ep.FullURL)`` | $($ep.MethodName) | Roles: $roleStr | User: $testUser |`n"
            }
            $output += "`n"
        }
    }
}

$output | Out-File -FilePath "c:\Users\statc\OneDrive\Desktop\statcompy\controller_inventory.txt" -Encoding UTF8
Write-Host "Done. Total endpoints: $($results.Count)"
Write-Host "Total controllers (classes): $(($results | Select-Object -Property Class -Unique).Count)"
Write-Host "Total files: $(($results | Select-Object -Property File -Unique).Count)"
