# Find all matching zip files in the current directory
$zipFiles = Get-ChildItem -Path $PSScriptRoot -Filter "jobtracker-distribution-v*.zip"

if (-not $zipFiles) {
    Write-Host "No distribution zip files found matching pattern 'jobtracker-distribution-v*.zip'" -ForegroundColor Red
    exit 1
}

# Sort by Version object to properly handle semantic versioning (e.g. v1.10 > v1.2)
$latestZip = $zipFiles | Sort-Object {
    if ($_.Name -match 'v?(\d+\.\d+(\.\d+)?)') {
        [version]$Matches[1]
    }
} -Descending | Select-Object -First 1

Write-Host "Found latest distribution package: $($latestZip.Name)" -ForegroundColor Green

# Unzip using standard PowerShell Expand-Archive (overwrites existing files)
Write-Host "Extracting package..." -ForegroundColor Yellow
Expand-Archive -Path $latestZip.FullName -DestinationPath $PSScriptRoot -Force

# Execute Docker Compose commands
Write-Host "Restarting container stack..." -ForegroundColor Yellow
docker compose --env-file deploy/.env.prod -f docker-compose.prod.yml down
docker compose --env-file deploy/.env.prod -f docker-compose.prod.yml up -d --build

Write-Host "Deployment complete for $($latestZip.Name)!" -ForegroundColor Green

