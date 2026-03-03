#!/usr/bin/zsh
echo "Stopping background Metro or node processes..."
pkill -f "metro"
pkill -f "node test-server.js"
pkill -f "node echo-server.js"
sleep 1

echo "Starting local WebSocket echo server..."
node echo-server.js &

echo "Restarting Physical Device build to pull new 10.1.1.43 LAN IP..."
./run-physical.sh
