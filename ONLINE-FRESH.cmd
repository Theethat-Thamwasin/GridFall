@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "GRIDFALL_NODE=%~dp0runtime\node.exe"
if not exist "%GRIDFALL_NODE%" set "GRIDFALL_NODE=node"
"%GRIDFALL_NODE%" "%~dp0tools\online.js" --fresh --open-browser
set "GRIDFALL_EXIT_CODE=%errorlevel%"
if not "%GRIDFALL_EXIT_CODE%"=="0" pause
exit /b %GRIDFALL_EXIT_CODE%
