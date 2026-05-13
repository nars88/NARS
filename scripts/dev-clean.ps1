$ErrorActionPreference = "SilentlyContinue"

$projectPath = "C:\my projects\iraqorder"

$nextProcesses = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq "node.exe" -and
  $_.CommandLine -like "*next*dev*" -and
  $_.CommandLine -like "*$projectPath*"
}

if ($nextProcesses) {
  $nextProcesses | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force
  }
  Write-Host "Stopped $($nextProcesses.Count) old Next.js process(es)."
} else {
  Write-Host "No old Next.js processes found."
}

npm run dev
