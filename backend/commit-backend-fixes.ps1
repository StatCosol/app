# Run this in PowerShell from the statco-backend directory
# Requirements: git must be installed and configured locally

Write-Output "Staging backend changes..."
git add -A

Write-Output "Committing..."
$msg = Get-Content COMMIT_MESSAGE.txt -Raw
git commit -m $msg

Write-Output "Done. To push changes run: git push origin <branch>"
