param([double]$scale = 0.02)
Set-Location "$PSScriptRoot\.."; docker compose exec -T attack python -m attack_engine run exp7 --scale $scale
