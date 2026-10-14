@echo off
REM ============================================================
REM  LSCh - Abre un tunel HTTPS hacia la API de este PC
REM  Necesita cloudflared y que iniciar_api.bat este corriendo.
REM ============================================================
chcp 65001 >nul
cd /d "%~dp0"
title LSCh - Tunel

if "%LSCH_PUERTO%"=="" set LSCH_PUERTO=5000

where cloudflared >nul 2>&1
if errorlevel 1 (
  echo cloudflared no esta instalado.
  echo Instalalo con:   winget install --id Cloudflare.cloudflared
  echo o descargalo desde https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
  echo y vuelve a ejecutar este archivo.
  pause
  exit /b 1
)

echo Abriendo un tunel hacia http://localhost:%LSCH_PUERTO% ...
echo.
echo Copia la direccion https://algo.trycloudflare.com que aparece abajo.
echo Cambia cada vez que reinicies el tunel. Para comprobarla:
echo   python probar_api.py --url https://algo.trycloudflare.com
echo.
cloudflared tunnel --url http://localhost:%LSCH_PUERTO%
echo.
echo El tunel se cerro.
pause
