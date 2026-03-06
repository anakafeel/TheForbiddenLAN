# SkyTalk Bug Fixes Log

## 2026-03-05

### Fix 1: Missing `theme` import in Channels.jsx
**Issue:** App crash on launch - `ReferenceError: Property 'theme' doesn't exist`
**Root cause:** The merge from main broke the theme import. Line 12 had `const { colors, spacing... } = theme` but `theme` was never imported.
**Fix:** Changed to use `useAppTheme()` hook inside the component.
```javascript
// Before (broken)
const { colors, spacing, radius, shadows, typography } = theme;

// After (fixed)
export default function ChannelsScreen({ navigation }) {
  const { colors, spacing, radius, shadows, typography } = useAppTheme();
```

### Fix 2: Missing `MOCK_CHANNELS` reference
**Issue:** App crash when navigating to Channels or PTT screen - `ReferenceError: Property 'MOCK_CHANNELS' doesn't exist`
**Root cause:** Mock mode code was commented out but references remained.
**Fix:** 
- Changed `useState(MOCK_CHANNELS)` to `useState([])` in Channels.jsx
- Removed mock mode check in Channels.jsx and PTTScreen.jsx

### Fix 3: Missing `Platform` import in LoginScreen.tsx
**Issue:** `ReferenceError: Property 'Platform' doesn't exist` on login screen
**Root cause:** Used `Platform.OS` but never imported Platform from react-native.
**Fix:** Added Platform to import statement.
```javascript
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet, Platform } from 'react-native';
```

### Fix 4: Increased SATCOM timeout
**Issue:** Login times out over SATCOM even when server responds
**Root cause:** 60s timeout too short for high-latency satellite links with packet loss
**Fix:** Increased to 90s timeout in LoginScreen.tsx
```javascript
const timeoutId = setTimeout(() => controller.abort(), 90000); // was 60000
```

### Fix 5: Added DLS-140 firewall API method
**Issue:** SATCOM return traffic blocked
**Root cause:** DLS-140 firewall may block incoming satellite traffic
**Fix:** Added `setFirewallProfile()` method to DLS140Client.ts
```typescript
async setFirewallProfile(profile: 'unrestricted' | 'locked'): Promise<void> {
  await fetch(`${this.base}/network/firewall`, {
    method: 'PUT',
    headers: this.headers,
    body: JSON.stringify({ profile }),
  });
}
```

## Network Verification

### SATCOM Connection Confirmed Working
- Phone → DLS-140 (SATCOM) → Server: ✅
- Server → DLS-140 (SATCOM) → Phone: ✅
- Login via SATCOM: ✅
- WebSocket via SATCOM: ✅
- UDP registration via SATCOM: ✅

### Current Server IP
- Server: `134.122.32.45:3000`
- Client connects from SATCOM IP: `70.33.239.14` (DLS router)

## Testing Steps

### Pre-test
1. Ensure cellular is disabled on both phones
2. Connect both phones to their respective DLS-140 WiFi networks
3. Confirm DLS-140 units have SATCOM signal (check signal bars)

### Test Flow
1. **Login** - Both phones login with different users
2. **Join Talkgroup** - Both join the same talkgroup (e.g., "alpha")
3. **PTT Test** - One phone presses PTT, other should receive audio
4. **Check Server Logs** - Look for PTT_START, PTT_AUDIO messages

### Expected Server Logs
```
[hub] UDP_REGISTER: userId=dev-xxx from 70.33.239.14:xxxxx (total: N)
PTT_START ... fanned to N peer(s)
PTT_AUDIO ... chunk X ... fanned to N peer(s)
PTT_END ... fanned to N peer(s)
```
