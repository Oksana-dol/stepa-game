#!/bin/sh
cd "$(dirname "$0")"
echo "Стёпа играет в слова: http://localhost:4173/"
echo "Для остановки нажмите Ctrl+C."
python3 -m http.server 4173 --bind 127.0.0.1
