// Signal status bar — shows satellite bars, cellular signal, active link
import type { SignalStatus } from '@forbiddenlan/comms';
import { useAppTheme } from '../theme';
import {
  getSignalColor,
  getSignalStrengthFromBars,
  getSignalStrengthFromPercent,
} from '../utils/signalStrength';
interface Props { status: SignalStatus; }

export function SignalBar({ status }: Props) {
  const { colors } = useAppTheme();
  const satStrength = getSignalStrengthFromBars(status.certusDataBars, 5);
  const cellStrength = getSignalStrengthFromPercent(status.cellularSignal);
  const linkStrength = status.activeLink === 'satellite'
    ? satStrength
    : status.activeLink === 'cellular'
      ? cellStrength
      : 'none';
  const linkColor = getSignalColor(linkStrength, colors);
  const satColor = getSignalColor(satStrength, colors);
  const cellColor = getSignalColor(cellStrength, colors);
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
      backgroundColor:colors.background.tertiary, padding:'8px 16px', borderRadius:8, color:colors.text.primary, fontSize:13 }}>
      <span style={{ color: satColor }}>🛰 {status.certusDataBars}/5</span>
      <span style={{ color: linkColor, fontWeight:'bold' }}>
        {status.activeLink.toUpperCase()}
      </span>
      <span style={{ color: cellColor }}>📶 {status.cellularSignal}%</span>
      <span style={{ color:colors.text.muted }}>{status.certusDataUsedKB.toFixed(1)} KB sat</span>
    </div>
  );
}
