// Signal status bar — shows satellite bars, cellular signal, active link
import type { SignalStatus } from '@forbiddenlan/comms';
interface Props { status: SignalStatus; }

export function SignalBar({ status }: Props) {
  const linkColor = status.activeLink === 'cellular' ? '#2ECC71'
    : status.activeLink === 'satellite' ? '#F39C12' : '#E74C3C';
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
      backgroundColor:'#1E3A5F', padding:'8px 16px', borderRadius:8, color:'white', fontSize:13 }}>
      <span>🛰 {status.certusSignalBars}/5</span>
      <span style={{ color: linkColor, fontWeight:'bold' }}>
        {status.activeLink.toUpperCase()}
      </span>
      <span>📶 {status.cellularSignal}%</span>
      <span style={{ color:'#aaa' }}>{status.certusDataUsedKB.toFixed(1)} KB sat</span>
    </div>
  );
}
