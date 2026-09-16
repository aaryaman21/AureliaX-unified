$pythonExe = "C:\SIH\AureliaX-updated\AureliaX\Backend\VoiceShield-AI\.venv\Scripts\python.exe"
Write-Host "Starting VoiceShield AI FastAPI Backend on http://localhost:8000..." -ForegroundColor Cyan
& $pythonExe api\main.py
