$ErrorActionPreference = "Stop"
$root = "D:\smart-todo-microservices"

Get-Job | Remove-Job -Force -ErrorAction SilentlyContinue

$services = @(
  @{ Name = "auth-service"; Dir = "$root\services\auth-service"; Port = "3001"; Env = @{ } },
  @{ Name = "category-service"; Dir = "$root\services\category-service"; Port = "3002"; Env = @{ } },
  @{ Name = "task-service"; Dir = "$root\services\task-service"; Port = "3003"; Env = @{ CATEGORY_SERVICE_URL = "http://127.0.0.1:3002" } },
  @{ Name = "notification-service"; Dir = "$root\services\notification-service"; Port = "3004"; Env = @{ } },
  @{ Name = "realtime-service"; Dir = "$root\services\realtime-service"; Port = "3005"; Env = @{ } },
  @{ Name = "analytics-service"; Dir = "$root\services\analytics-service"; Port = "3006"; Env = @{ TASK_SERVICE_URL = "http://127.0.0.1:3003"; NOTIFICATION_SERVICE_URL = "http://127.0.0.1:3004" } }
)

foreach ($service in $services) {
  $scriptBlock = {
    param($dir, $port, $envMap)
    Set-Location $dir
    $env:PORT = $port
    $env:JWT_SECRET = if ($env:JWT_SECRET) { $env:JWT_SECRET } else { "smart-todo-super-secret" }
    foreach ($entry in $envMap.GetEnumerator()) {
      ${env:$($entry.Key)} = $entry.Value
    }
    npm start
  }

  Start-Job -Name $service.Name -ScriptBlock $scriptBlock -ArgumentList $service.Dir, $service.Port, $service.Env | Out-Null
  Write-Host "Started $($service.Name) on port $($service.Port)"
}

Write-Host "All services launched. Waiting for startup..."
Start-Sleep -Seconds 4

foreach ($service in $services) {
  $url = "http://127.0.0.1:$($service.Port)/health"
  try {
    $resp = Invoke-RestMethod -Uri $url -UseBasicParsing -TimeoutSec 5
    Write-Host "[$($service.Name)] OK -> $($resp.service)"
  } catch {
    Write-Host "[$($service.Name)] NOT READY -> $($_.Exception.Message)"
  }
}
