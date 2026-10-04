Set-Location "$PSScriptRoot\.."; docker compose down -v; docker compose up -d --build; Start-Sleep 8; .\scripts\seed.ps1
