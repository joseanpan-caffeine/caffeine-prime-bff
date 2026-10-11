# Instala o Flutter (canal stable) em C:\dev\flutter e adiciona ao PATH do usuario.
$ErrorActionPreference = "Stop"
$dest = "C:\dev"
$flutterDir = "$dest\flutter"

if (Test-Path "$flutterDir\bin\flutter.bat") {
  Write-Host "Flutter ja existe em $flutterDir" -ForegroundColor Yellow
} else {
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Write-Host "Consultando versao estavel..." -ForegroundColor Cyan
  $releases = Invoke-RestMethod "https://storage.googleapis.com/flutter_infra_release/releases/releases_windows.json"
  $hash = $releases.current_release.stable
  $rel = $releases.releases | Where-Object { $_.hash -eq $hash } | Select-Object -First 1
  $url = $releases.base_url + "/" + $rel.archive
  $zip = "$env:TEMP\flutter_stable.zip"
  Write-Host "Baixando Flutter $($rel.version) (~1 GB, pode levar alguns minutos)..." -ForegroundColor Cyan
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $ProgressPreference = "SilentlyContinue"
  Invoke-WebRequest -Uri $url -OutFile $zip
  Write-Host "Extraindo em $dest ..." -ForegroundColor Cyan
  Expand-Archive -Path $zip -DestinationPath $dest -Force
  Remove-Item $zip -Force
}

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$flutterDir\bin*") {
  [Environment]::SetEnvironmentVariable("Path", "$userPath;$flutterDir\bin", "User")
  Write-Host "PATH do usuario atualizado." -ForegroundColor Green
}
$env:Path = "$flutterDir\bin;" + $env:Path

Write-Host "`nRodando flutter doctor (a primeira vez demora, baixa o Dart SDK)..." -ForegroundColor Cyan
& "$flutterDir\bin\flutter.bat" doctor
Write-Host "`nPronto. FECHE e REABRA o VS Code para o comando 'flutter' funcionar em qualquer terminal." -ForegroundColor Green
