@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-demo.ps1" -Mode normal
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)
