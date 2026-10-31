param(
    [Parameter(Mandatory=$true)][string]$Serial,
    [Parameter(Mandatory=$true)][string]$Adb,
    [Parameter(Mandatory=$true)][string]$Provisioning,
    [string]$Apk = (Join-Path $PSScriptRoot '..\android\app\build\outputs\apk\release\app-release.apk'),
    [switch]$EnableWifiReturnButton
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($Serial -notmatch '^[A-Za-z0-9_.:-]+$') { throw 'Numéro de cadre invalide.' }
$adbPath = (Resolve-Path -LiteralPath $Adb).Path
$apkPath = (Resolve-Path -LiteralPath $Apk).Path
$provisionPath = (Resolve-Path -LiteralPath $Provisioning).Path
$setup = Get-Content -LiteralPath $provisionPath -Raw | ConvertFrom-Json
if ($setup.apiBase -ne 'https://mosa-506ef.web.app' -or $setup.enrollmentToken -notmatch '^[A-Za-z0-9_-]{40,80}$') { throw 'Préparation Mosa en ligne invalide.' }
function Invoke-MosaAdb([string[]]$AdbArguments) {
    & $adbPath -s $Serial @AdbArguments
    if ($LASTEXITCODE -ne 0) { throw 'Opération ADB échouée. Le script est arrêté.' }
}
Invoke-MosaAdb -AdbArguments @('get-state')
Invoke-MosaAdb -AdbArguments @('install', '-r', $apkPath)
if ($EnableWifiReturnButton) {
    # This switch records the installer's explicit choice to grant the approved overlay permission.
    Invoke-MosaAdb -AdbArguments @('shell', 'appops', 'set', 'app.mosa.frame', 'SYSTEM_ALERT_WINDOW', 'allow')
}
Invoke-MosaAdb -AdbArguments @('shell', 'am', 'force-stop', 'app.mosa.frame')
Invoke-MosaAdb -AdbArguments @('shell', 'mkdir', '-p', '/sdcard/Android/data/app.mosa.frame/files')
Invoke-MosaAdb -AdbArguments @('push', $provisionPath, '/sdcard/Android/data/app.mosa.frame/files/provisioning.json')
Invoke-MosaAdb -AdbArguments @('shell', 'cmd', 'package', 'set-home-activity', 'app.mosa.frame/.MainActivity')
Invoke-MosaAdb -AdbArguments @('shell', 'am', 'start', '-n', 'app.mosa.frame/.MainActivity')
Write-Output 'Mosa installé. Vérifier le foyer, les photos et le retour Wi-Fi sur ce cadre.'
if (-not $EnableWifiReturnButton) { Write-Warning 'Le bouton de retour Wi-Fi doit être autorisé avant de remettre le cadre.' }
