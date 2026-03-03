const http = require('http');

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Mock DLS-140 API is running\n');
}).listen(3000, '0.0.0.0', () => {
  console.log('Mock DLS-140 Router running on port 3000');
});
