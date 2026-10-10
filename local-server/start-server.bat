@echo off
rem Double-click to run the Brain Arcade server with Python (python.org, 3.8+).
rem No Python? Use BrainArcadeServer.exe from the GitHub Releases page instead.
cd /d "%~dp0"
python brain_arcade_server.py %*
if errorlevel 1 pause
