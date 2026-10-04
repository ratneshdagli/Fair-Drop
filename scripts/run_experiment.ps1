# usage: .\scripts\run_experiment.ps1 exp2 --scale 0.1 --also-fcfs
Set-Location "$PSScriptRoot\.."; docker compose exec -T attack python -m attack_engine run @args
