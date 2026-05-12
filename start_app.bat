@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File manage_app.ps1 start
