Set-Location "$PSScriptRoot\.."; docker compose up -d --build
# reload the gateway so it picks up the new addresses of any rebuilt web server (otherwise one server takes all the load)
Start-Sleep 3; docker exec fd-nginx nginx -s reload | Out-Null
Write-Host "Fair Drop: http://localhost:8088  admin: /admin  grafana: http://localhost:3001"
