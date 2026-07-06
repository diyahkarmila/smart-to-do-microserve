$ErrorActionPreference = "Stop"
$baseUrl = "http://localhost"
$suffix = Get-Random
$username = "demo$suffix"
$password = "password123"

Write-Host "Register user..."
$register = Invoke-RestMethod -Method Post -Uri "$baseUrl/auth/register" -ContentType "application/json" -Body (@{
  username = $username
  password = $password
  displayName = "Demo User"
} | ConvertTo-Json)
$token = $register.token
$headers = @{ Authorization = "Bearer $token" }

Write-Host "Create category..."
$category = Invoke-RestMethod -Method Post -Uri "$baseUrl/categories" -Headers $headers -ContentType "application/json" -Body (@{
  name = "Campus"
  color = "#16a34a"
} | ConvertTo-Json)

Write-Host "Create task..."
$task = Invoke-RestMethod -Method Post -Uri "$baseUrl/tasks" -Headers $headers -ContentType "application/json" -Body (@{
  title = "Finish AFL-3 microservice demo"
  description = "Record architecture, API gateway, auth, and monitoring demo"
  priority = "high"
  status = "todo"
  dueDate = "2026-07-10"
  categoryId = $category.category.id
} | ConvertTo-Json)

Write-Host "Update task status..."
$updated = Invoke-RestMethod -Method Patch -Uri "$baseUrl/tasks/$($task.task.id)" -Headers $headers -ContentType "application/json" -Body (@{
  status = "doing"
} | ConvertTo-Json)

Start-Sleep -Seconds 1

Write-Host "Fetch task list..."
$tasks = Invoke-RestMethod -Method Get -Uri "$baseUrl/tasks" -Headers $headers

Write-Host "Fetch notifications..."
$notifications = Invoke-RestMethod -Method Get -Uri "$baseUrl/notifications" -Headers $headers

Write-Host "Fetch analytics summary..."
$analytics = Invoke-RestMethod -Method Get -Uri "$baseUrl/analytics/summary" -Headers $headers

Write-Host "\n=== TOKEN ==="
Write-Host $token
Write-Host "\n=== TASKS ==="
$tasks | ConvertTo-Json -Depth 10
Write-Host "\n=== NOTIFICATIONS ==="
$notifications | ConvertTo-Json -Depth 10
Write-Host "\n=== ANALYTICS ==="
$analytics | ConvertTo-Json -Depth 10
