@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   没有找到 Node.js。请先安装 Node.js 24 或更新版本：https://nodejs.org/
  echo.
  pause
  exit /b 1
)
node server.mjs
pause
