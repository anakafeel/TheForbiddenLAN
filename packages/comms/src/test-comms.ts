import { ForbiddenLANComms } from './ForbiddenLANComms';

const isMock = process.argv.includes('--mock');

const comms = new ForbiddenLANComms({
  relayUrl: 'ws://localhost:9999',
  dls140Url: 'http://192.168.111.1:3000',
  deviceId: 'test-device-001',
});

if (isMock) {
  console.log('🧪 Running in MOCK relay mode');
}

async function main() {
  await comms.connect('fake-jwt', 'skytrac', 'skytrac');
  console.log('✅ Connected');
  const signal = await comms.getSignalStatus();
  console.log('✅ Signal status:', JSON.stringify(signal, null, 2));
  const gps = comms.getGPS();
  console.log('✅ GPS (null expected indoors):', gps);
  comms.joinTalkgroup('TG-1');
  console.log('✅ Joined TG-1');
  setTimeout(() => { comms.disconnect(); console.log('✅ Disconnected cleanly'); }, 3000);
}

main().catch(console.error);
