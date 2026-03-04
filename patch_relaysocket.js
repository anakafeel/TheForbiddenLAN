const fs = require('fs');
const filepath = 'packages/comms/src/RelaySocket.ts';
let code = fs.readFileSync(filepath, 'utf8');

// Replace .on('message')
code = code.replace(
  `    this.ws.on('message', (data) => {\n      try {\n        const msg = JSON.parse(data.toString()) as RelayMessage;\n        this.emit(msg.type, msg);\n        this.emit('*', msg);\n      } catch { /* ignore malformed messages */ }\n    });`,
  `    // this.ws.on('message', (data) => {
    //   try {
    //     const msg = JSON.parse(data.toString()) as RelayMessage;
    //     this.emit(msg.type, msg);
    //     this.emit('*', msg);
    //   } catch { /* ignore malformed messages */ }
    // });
    
    // React Native WebSocket uses addEventListener
    this.ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data) as RelayMessage;
        
        // Log audio packets for testing
        if (msg.type === 'PTT_AUDIO') {
          console.log(\`[RelaySocket] RX PTT_AUDIO from \${msg.talkgroup} | seq: \${msg.seq} | chunk: \${msg.chunk} | bytes: \${msg.data?.length || 0}\`);
        }
        
        this.emit(msg.type, msg);
        this.emit('*', msg);
      } catch { /* ignore malformed messages */ }
    });`
);

// Replace .on('open')
code = code.replace(
  `    this.ws.on('open', () => {`,
  `    // this.ws.on('open', () => {
    this.ws.addEventListener('open', () => {`
);

// Replace .on('close')
code = code.replace(
  `    this.ws.on('close', () => {`,
  `    // this.ws.on('close', () => {
    this.ws.addEventListener('close', () => {`
);

// Replace .on('error')
code = code.replace(
  `    this.ws.on('error', (err) => {\n      console.warn('[RelaySocket] error', err.message);\n      this.handleReconnect();\n    });`,
  `    // this.ws.on('error', (err) => {
    //   console.warn('[RelaySocket] error', err.message);
    //   this.handleReconnect();
    // });
    this.ws.addEventListener('error', (event) => {
      console.warn('[RelaySocket] error', event);
      this.handleReconnect();
    });`
);

// Enhance send logging for PTT_AUDIO
code = code.replace(
  `    if (this.ws?.readyState === WebSocket.OPEN) {\n      this.ws.send(JSON.stringify(msg));\n    }`,
  `    if (this.ws?.readyState === WebSocket.OPEN) {
      if ((msg as any).type === 'PTT_AUDIO') {
        console.log(\`[RelaySocket] TX PTT_AUDIO to \${(msg as any).talkgroup} | seq: \${(msg as any).seq} | chunk: \${(msg as any).chunk} | bytes: \${(msg as any).data?.length || 0}\`);
      }
      this.ws.send(JSON.stringify(msg));
    }`
);

fs.writeFileSync(filepath, code);
