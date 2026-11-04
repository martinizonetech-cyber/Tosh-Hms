@echo off
title Tosh Clinic HMS - Backend Server
cd /d "%~dp0"

echo ==============================================
echo   Tosh Clinic HMS - Starting Backend Server
echo ==============================================

if exist ".venv\Scripts\activate.bat" (
    call .venv\Scripts\activate.bat
) else if exist "..\.venv\Scripts\activate.bat" (
    call ..\.venv\Scripts\activate.bat
)

python run.py

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Backend server stopped with error code %ERRORLEVEL%.
    pause
)

