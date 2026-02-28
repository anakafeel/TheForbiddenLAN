// Large PTT button — hold to transmit, release to end
interface Props { transmitting: boolean; onDown: () => void; onUp: () => void; }

export function PTTButton({ transmitting, onDown, onUp }: Props) {
  return (
    <button
      onMouseDown={onDown} onMouseUp={onUp}
      onTouchStart={onDown} onTouchEnd={onUp}
      style={{
        width: 180, height: 180, borderRadius: '50%', border: 'none', cursor: 'pointer',
        backgroundColor: transmitting ? '#E74C3C' : '#0D6EFD',
        boxShadow: transmitting ? '0 0 40px #E74C3C88' : '0 0 20px #0D6EFD44',
        fontSize: 24, color: 'white', fontWeight: 'bold',
        transition: 'all 0.1s ease',
        transform: transmitting ? 'scale(0.95)' : 'scale(1)',
      }}>
      {transmitting ? '🔴 TX' : '🎙 PTT'}
    </button>
  );
}
