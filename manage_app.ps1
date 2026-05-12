param (
    [string]$Action = "start"
)

$BackendPort = 8002
$FrontendPort = 5173
$RootPath = Get-Location
$BackendDir = Join-Path $RootPath "backend"
$FrontendDir = Join-Path $RootPath "frontend"

function Stop-App {
    Write-Host "Stopping PureStream..." -ForegroundColor Yellow
    $ports = @($BackendPort, $FrontendPort)
    foreach ($port in $ports) {
        $processes = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
        if ($processes) {
            foreach ($pidVal in $processes) {
                Write-Host "Killing process on port $port (PID: $pidVal)" -ForegroundColor Red
                Stop-Process -Id $pidVal -Force -ErrorAction SilentlyContinue
            }
        } else {
             Write-Host "No process found on port $port" -ForegroundColor Gray
        }
    }
    Write-Host "Stopped." -ForegroundColor Green
}

function Start-App {
    # Check if ports are already in use
    $backendActive = Get-NetTCPConnection -LocalPort $BackendPort -ErrorAction SilentlyContinue
    $frontendActive = Get-NetTCPConnection -LocalPort $FrontendPort -ErrorAction SilentlyContinue
    
    if ($backendActive -or $frontendActive) {
        Write-Host "Ports are already in use. Stopping existing instances..." -ForegroundColor Yellow
        Stop-App
    }

    Write-Host "Starting PureStream Backend..." -ForegroundColor Cyan
    # Launch in a new CMD window so user can see logs and it stays open (/k)
    Start-Process "cmd.exe" -ArgumentList "/k title PureStream Backend & cd /d `"$BackendDir`" & python run_windows.py" -WindowStyle Normal

    Write-Host "Starting PureStream Frontend..." -ForegroundColor Cyan
    # Launch in a new CMD window
    Start-Process "cmd.exe" -ArgumentList "/k title PureStream Frontend & cd /d `"$FrontendDir`" & npm run dev" -WindowStyle Normal
    
    Write-Host "PureStream is starting!" -ForegroundColor Green
    Write-Host "Backend API: http://localhost:$BackendPort"
    Write-Host "Frontend UI: http://localhost:$FrontendPort"
}

switch ($Action.ToLower()) {
    "stop" { Stop-App }
    "start" { Start-App }
    "restart" { Stop-App; Start-App }
    default { 
        Write-Host "Usage: .\manage_app.ps1 [start|stop|restart]" -ForegroundColor Red 
        Write-Host "Defaulting to 'start'..." -ForegroundColor Yellow
        Start-App
    }
}
