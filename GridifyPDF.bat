@echo off
title GridifyPDF Server
echo ===================================================
echo            Starting GridifyPDF Server              
echo ===================================================
echo.
echo The web interface will open in your default browser shortly.
echo To shut down the server, press CTRL+C in this window.
echo.
cd /d "%~dp0"
start "" "http://127.0.0.1:8000"
python main.py
pause
