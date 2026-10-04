param([int]$n = 2)
docker kill "fd-api-$n"; Write-Host "killed fd-api-$n; compose restarts it"
