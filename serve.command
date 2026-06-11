#!/bin/zsh
# AirKeys launcher — double-click me!
cd "$(dirname "$0")"
PORT=8417
echo "🎹 AirKeys starting at http://localhost:$PORT"
( sleep 1; open "http://localhost:$PORT" ) &
exec python3 serve.py $PORT
