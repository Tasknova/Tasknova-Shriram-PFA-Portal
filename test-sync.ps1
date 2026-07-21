# Test the sync endpoint
Write-Host "=== Testing Agent Config Sync ===" -ForegroundColor Cyan

Write-Host "`n1. Testing diagnostic endpoint..." -ForegroundColor Yellow
$testResponse = Invoke-WebRequest -Uri "http://localhost:3000/api/ai-agents/test-config-sync" -Method GET -ErrorAction SilentlyContinue
Write-Host "Status: $($testResponse.StatusCode)" -ForegroundColor Green
$testData = $testResponse.Content | ConvertFrom-Json
Write-Host "Response:" -ForegroundColor Yellow
$testData | ConvertTo-Json -Depth 3 | Write-Host

Write-Host "`n2. Testing sync endpoint..." -ForegroundColor Yellow
$syncResponse = Invoke-WebRequest -Uri "http://localhost:3000/api/ai-agents/sync-configs" -Method POST -ErrorAction SilentlyContinue
Write-Host "Status: $($syncResponse.StatusCode)" -ForegroundColor Green
$syncData = $syncResponse.Content | ConvertFrom-Json
Write-Host "Response:" -ForegroundColor Yellow
$syncData | ConvertTo-Json -Depth 2 | Write-Host

Write-Host "`n3. Testing config fetch endpoint..." -ForegroundColor Yellow
$configResponse = Invoke-WebRequest -Uri "http://localhost:3000/api/ai-agents/AGT_0FBEDCFF/config" -Method GET -ErrorAction SilentlyContinue
Write-Host "Status: $($configResponse.StatusCode)" -ForegroundColor Green
$configData = $configResponse.Content | ConvertFrom-Json
Write-Host "Response:" -ForegroundColor Yellow
$configData | ConvertTo-Json -Depth 2 | Write-Host
