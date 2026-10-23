# One-time Windows machine setup for Devin snapshots: Node 24 LTS (MSI), PATH, deps, build.
# Verified on Windows Server 2022: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows-setup.ps1
$ErrorActionPreference = 'Stop'
$msi = "$env:TEMP\node-v24.22.1-x64.msi"
Invoke-WebRequest -Uri https://nodejs.org/dist/v24.22.1/node-v24.22.1-x64.msi -OutFile $msi
$p = Start-Process msiexec.exe -ArgumentList '/i', $msi, '/qn', '/norestart' -Wait -PassThru
if ($p.ExitCode -ne 0) { throw "msiexec exit $($p.ExitCode)" }
$nodeDir = 'C:\Program Files\nodejs'
$machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
if (-not $machinePath.StartsWith("$nodeDir;")) {
  [Environment]::SetEnvironmentVariable('Path', "$nodeDir;" + ($machinePath -replace [regex]::Escape("$nodeDir;"), ''), 'Machine')
}
$env:PATH = "$nodeDir;" + $env:PATH
node -v; npm -v
& 'C:\Program Files\Git\bin\bash.exe' scripts/install-deps.sh
if ($LASTEXITCODE -ne 0) { throw "install-deps.sh exit $LASTEXITCODE" }
npx vite build
if ($LASTEXITCODE -ne 0) { throw "vite build exit $LASTEXITCODE" }
