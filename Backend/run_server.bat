@echo off
set PYTHON_EXE=C:\SIH\AureliaX-updated\AureliaX\Backend\VoiceShield-AI\.venv\Scripts\python.exe
echo Starting VoiceShield AI FastAPI Backend on http://localhost:8000...
"%PYTHON_EXE%" api\main.py
