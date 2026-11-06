param([switch]$PreflightOnly, [switch]$VerifyOnly)
$ErrorActionPreference = 'Stop'
if ($PreflightOnly -and $VerifyOnly) { throw 'Choose only one verification mode.' }
$node = (Get-Command node.exe -ErrorAction Stop).Source
$script = Join-Path $PSScriptRoot 'server/scripts/launch-engraving-production.js'
$mode = if ($PreflightOnly) { '--preflight' } elseif ($VerifyOnly) { '--verify' } else { '--publish' }
Write-Host 'Target: https://api.tapandwrap.net (production). No MongoDB credentials are required.'
Write-Host 'Publication uses authenticated admin revisions and audit. It does not activate Render flags.'
Write-Host 'Credentials stay in process memory and the child stdin pipe. Do not use PowerShell transcription.'
$start = New-Object System.Diagnostics.ProcessStartInfo
$start.FileName = $node
$start.Arguments = '"' + $script + '" ' + $mode
$start.WorkingDirectory = Join-Path $PSScriptRoot 'server'
$start.UseShellExecute = $false
$start.RedirectStandardInput = $true
$start.EnvironmentVariables.Clear()
foreach ($key in @('PATH','Path','SystemRoot','WINDIR','TEMP','TMP','COMSPEC','PATHEXT','USERPROFILE','LOCALAPPDATA','APPDATA')) {
    $value = [Environment]::GetEnvironmentVariable($key)
    if ($null -ne $value) { $start.EnvironmentVariables[$key] = $value }
}
$start.EnvironmentVariables['NODE_OPTIONS'] = ''
$process = New-Object System.Diagnostics.Process
$process.StartInfo = $start
$password = $null
$plain = $null
$payload = $null
try {
    if (-not $PreflightOnly) {
        $email = Read-Host 'Existing production administrator email'
        $password = Read-Host 'Existing administrator password (hidden)' -AsSecureString
        $credential = New-Object System.Management.Automation.PSCredential($email, $password)
        $plain = $credential.GetNetworkCredential().Password
        $payload = @{email=$email; password=$plain} | ConvertTo-Json -Compress
    }
    if (-not $process.Start()) { throw 'Could not start the launch process.' }
    try { if ($payload) { $process.StandardInput.WriteLine($payload) } }
    finally { $process.StandardInput.Close(); $plain = $null; $payload = $null; $credential = $null; $email = $null }
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw 'Launch did not complete. Review the sanitized report; do not activate intake.' }
    Write-Host 'Completed. Review client/test-results-engraving-production-launch/latest.json.'
} finally {
    $plain = $null; $payload = $null; $credential = $null
    if ($password) { $password.Dispose() }
    $process.Dispose()
}
