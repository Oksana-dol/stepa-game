@echo off
cd /d "%~dp0"
echo Стёпа играет в слова: http://localhost:4173/
echo Для остановки закройте это окно.
py -m http.server 4173 --bind 127.0.0.1
if errorlevel 1 python -m http.server 4173 --bind 127.0.0.1
