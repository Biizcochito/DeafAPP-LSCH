@echo off
REM ============================================================
REM  LSCh - Inicia la API en este PC
REM  Para detenerla: Ctrl+C. Edita las lineas "set" si lo necesitas.
REM ============================================================
chcp 65001 >nul
cd /d "%~dp0"
title LSCh - API

REM Puerto en el que escucha la API
if "%LSCH_PUERTO%"=="" set LSCH_PUERTO=5000

REM Webs que pueden llamar a la API (separadas por comas). Sin esto el navegador bloquea las respuestas.
if "%LSCH_CORS_ORIGINS%"=="" set LSCH_CORS_ORIGINS=https://deafapp-lsch.deafapp-lsch.workers.dev,http://localhost:8081

REM 127.0.0.1 = solo este PC (usalo con el tunel).
REM 0.0.0.0   = tambien otros dispositivos de tu red (Windows pedira permiso en el firewall).
if "%LSCH_HOST%"=="" set LSCH_HOST=127.0.0.1

REM Opcional: token para /predecir y /contribuir. /clasificar sigue abierta (una web estatica no puede esconder un token).
REM set LSCH_API_TOKEN=cambia-esto

if not exist modelo_lsch_lstm.keras (
  echo No se encuentra modelo_lsch_lstm.keras en esta carpeta.
  echo Ejecuta primero:  python entrenar_modelo.py
  pause
  exit /b 1
)

node ..\scripts\backend.cjs start
echo.
echo La API se detuvo.
pause
