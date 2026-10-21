@echo off
rem The Asset Admin (fork/asset-admin.cjs, fork/ARTIST.md): double-click to open it.
title Asset Admin
cd /d "%~dp0.."
where node >nul 2>nul || (echo. & echo Node.js is not installed. Get the LTS version from https://nodejs.org, install it, then double-click this again. & echo. & pause & exit /b 1)
where git >nul 2>nul || (echo. & echo Git is not installed. Get it from https://git-scm.com/download/win, install it, then double-click this again. & echo. & pause & exit /b 1)
echo Starting the Asset Admin. Keep this window open while you use it; close it to stop.
node fork\asset-admin.cjs %*
echo.
pause
