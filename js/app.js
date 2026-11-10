# Doplnenie automatickej synchronizácie LPIS parciel pri overení nového IČO z RegisterUZ
$appJsPath = Join-Path -Path (Get-Location).Path -ChildPath "js\app.js"
if (Test-Path $appJsPath) {
    $content = Get-Content -Path $appJsPath -Raw -Encoding UTF8
    $oldBlock = "store.upsertEntity(entityData);"
    $newBlock = "store.upsertEntity(entityData);`n    await apiService.syncPublicRegistersForEntity(entityData);"
    if ($content -notmatch "syncPublicRegistersForEntity") {
        $updated = $content.Replace($oldBlock, $newBlock)
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($appJsPath, $updated, $utf8NoBom)
        Write-Host "✅ Súbor js\app.js bol prepojený s automatickou synchronizáciou LPIS blokov!" -ForegroundColor Green
    } else {
        Write-Host "ℹ️ Prepojenie je už v js\app.js aktívne." -ForegroundColor Cyan
    }
}