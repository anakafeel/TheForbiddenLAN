const { WebSocketServer } = require('ws');

const wss = new WebSocketServer({ port: 8080 });

const clients = new Set();

console.log('🤖 Local MVP Echo Server running on ws://localhost:8080');
console.log('-------------------------------------------------------');
console.log('This server acts as a dumb relay for your SATCOM tests.');
console.log('It will bounce all Opus packets back to all connected clients.');

wss.on('connection', (ws, req) => {
  console.log(`[+] Client connected from ${req.socket.remoteAddress}`);
  clients.add(ws);

  ws.on('message', (message) => {
    try {
      const parsed = JSON.parse(message);
      
      if (parsed.type === 'SYNC_TIME') {
        // Reply with server time to fix clock drift
        ws.send(JSON.stringify({
          type: 'SYNC_TIME',
          clientTime: parsed.clientTime,
          serverTime: Date.now()
        }));
        return;
      }
      
      // Basic logging
      if (parsed.type === 'PTT_START') {
        console.log(`🎤 [PTT_START] from ${parsed.sender}`);
      } else if (parsed.type === 'PTT_END') {
        console.log(`🛑 [PTT_END] from ${parsed.sender}`);
      } else if (parsed.type === 'PTT_AUDIO') {
        process.stdout.write('.'); // Print dot for each audio chunk
      }

      // Fan-out routing (dumb relay: echo to all OTHER clients, or ALL clients in MVP loopback)
      // For MVP testing, we want to hear our own audio to verify the loopback works natively.
      for (const client of clients) {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(message.toString());
        }
      }
    } catch (e) {
      console.error('Failed to parse message:', e.message);
    }
  });

  ws.on('close', () => {
    console.log('\n[-] Client disconnected');
    clients.delete(ws);
  });
});
