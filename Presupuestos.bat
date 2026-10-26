@echo off
rem Abre la app de presupuestos en su propia ventana, sin pestanas ni barra de direcciones
start "" msedge --app="%~dp0index.html"
