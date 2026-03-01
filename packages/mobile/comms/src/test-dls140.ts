import { DLS140Client } from './DLS140Client';

const client = new DLS140Client('http://192.168.111.1:3000');

async function main() {
  await client.login('skytrac', 'skytrac');
  console.log('✅ Login OK');
  const status = await client.getStatus();
  console.log('✅ Raw status:', JSON.stringify(status, null, 2));
  const gps = await client.getGPS();
  console.log('✅ GPS:', JSON.stringify(gps, null, 2));
  const signal = await client.toSignalStatus();
  console.log('✅ Parsed signal:', JSON.stringify(signal, null, 2));
  const usage = await client.getDataUsage('24h');
  console.log('✅ Data usage:', JSON.stringify(usage, null, 2));
  const routing = await client.getRoutingPreference();
  console.log('✅ Routing:', JSON.stringify(routing, null, 2));
}

main().catch(console.error);
