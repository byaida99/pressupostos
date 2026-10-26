@echo off
rem Abre la app de presupuestos en su propia ventana, sin pestanas ni barra de direcciones
start "" chrome --app="%~dp0index.html"
