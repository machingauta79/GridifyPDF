@echo off
title Push to GitHub
echo ===================================================
echo            Pushing GridifyPDF to GitHub             
echo ===================================================
echo.
cd /d "%~dp0"
git remote add origin https://github.com/machingauta79/GridifyPDF.git 2>nul
git branch -M main
git push -f -u origin main
echo.
echo ===================================================
echo Push completed. Press any key to close.
echo ===================================================
pause
