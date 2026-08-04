@echo off
title GridifyPDF Server
echo ===================================================
echo            Starting GridifyPDF Server              
echo ===================================================
echo.
echo Launching GridifyPDF server...
echo The web interface will open in your default browser once ready.
echo To shut down the server, press CTRL+C in this window.
echo.
cd /d "%~dp0"
python main.py
pause

