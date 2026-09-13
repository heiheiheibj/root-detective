$user = [System.Environment]::GetEnvironmentVariable('OPENROUTER_API_KEY', 'User')
$machine = [System.Environment]::GetEnvironmentVariable('OPENROUTER_API_KEY', 'Machine')
Write-Output ("UserScope set: " + ($null -ne $user))
Write-Output ("MachineScope set: " + ($null -ne $machine))
Write-Output ("CurrentProcess set: " + ($null -ne $env:OPENROUTER_API_KEY))
if ($user) { Write-Output ("UserScope value length: " + $user.Length) }
