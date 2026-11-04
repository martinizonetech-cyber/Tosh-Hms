@echo off
title Tosh Clinic HMS - Backend Server
cd /d "%~dp0backend"

echo ==============================================
echo   Tosh Clinic HMS - Starting Backend Server
echo ==============================================

:: Check if virtual environment exists
if exist ".venv\Scripts\activate.bat" (
    echo [INFO] Activating virtual environment (.venv)...
    call .venv\Scripts\activate.bat
) else if exist "..\.venv\Scripts\activate.bat" (
    echo [INFO] Activating root virtual environment (.venv)...
    call ..\.venv\Scripts\activate.bat
) else if exist "venv\Scripts\activate.bat" (
    echo [INFO] Activating virtual environment (venv)...
    call venv\Scripts\activate.bat
)

:: Run backend
python run.py

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Backend server failed to start or stopped with error code %ERRORLEVEL%.
    pause
)

