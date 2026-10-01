@echo off
cd /d "%~dp0"
title Jack of All Wings server
set PY=python
where python >nul 2>nul || set PY=py
%PY% server.py 8000 /
if errorlevel 1 pause
