import { FloorControl } from './FloorControl';

const fc = new FloorControl();

console.log('--- Test 1: Single press, should grant after 50ms ---');
fc.arbitrate({ type: 'PTT_START', talkgroup: 'TG-1', sender: 'device-AAA', timestamp: 1000, seq: 1 } as any);
setTimeout(() => {
  const f = fc.getFloor('TG-1');
  console.log(f.holder === 'device-AAA' ? '✅ PASS' : '❌ FAIL', 'holder:', f.holder);
}, 100);

console.log('--- Test 2: Collision, lower timestamp wins ---');
fc.arbitrate({ type: 'PTT_START', talkgroup: 'TG-2', sender: 'device-BBB', timestamp: 2000, seq: 1 } as any);
fc.arbitrate({ type: 'PTT_START', talkgroup: 'TG-2', sender: 'device-AAA', timestamp: 1995, seq: 1 } as any);
setTimeout(() => {
  const f = fc.getFloor('TG-2');
  console.log(f.holder === 'device-AAA' ? '✅ PASS' : '❌ FAIL', 'holder:', f.holder);
}, 100);

console.log('--- Test 3: Tiebreak, smaller UUID wins ---');
fc.arbitrate({ type: 'PTT_START', talkgroup: 'TG-3', sender: 'device-BBB', timestamp: 3000, seq: 1 } as any);
fc.arbitrate({ type: 'PTT_START', talkgroup: 'TG-3', sender: 'device-AAA', timestamp: 3000, seq: 1 } as any);
setTimeout(() => {
  const f = fc.getFloor('TG-3');
  console.log(f.holder === 'device-AAA' ? '✅ PASS' : '❌ FAIL', 'holder:', f.holder);
}, 100);
