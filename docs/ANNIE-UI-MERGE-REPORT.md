# Annie UI Merge — Integration Report

**Date:** 2026-03-05
**Branch merged:** `origin/mobile/annie` → `main`
**Commit range:** `b963ab1..fae9069` ("feat:proper dashboard v7")
**Author:** Annie Rabbani (AnnieR15)
**Integration by:** anakafeel

---

## What Annie's Branch Added

Annie built a complete redesign of the regular-user mobile experience. Her branch introduced:

### New Screens
| File | Description |
|---|---|
| `src/screens/DashboardScreen.tsx` | Bento-grid dashboard: active users panel, satellite/cellular signal cards (tappable), scrollable notifications feed |
| `src/screens/NotificationsScreen.tsx` | Notifications list screen |
| `src/screens/ProfileScreen.tsx` | User profile screen |
| `src/screens/AuthScreen.tsx` | Standalone auth screen (not used — we kept `LoginScreen.tsx`) |

### New Navigation Architecture
| File | Description |
|---|---|
| `src/navigation/AppDrawer.tsx` | Drawer navigator: Dashboard → PTT → Channels → Notifications (hidden) → Profile |
| `src/navigation/AuthStack.tsx` | Auth-gated stack: Login only |
| `src/navigation/RootNavigator.tsx` | Routes to AppDrawer or AuthStack based on `isAuthed` |
| `src/context/AuthContext.tsx` | `AuthProvider` wrapping `useStore.jwt` — exposes `signIn`, `signOut`, `isAuthed` |

### New / Updated Components
| File | Changes |
|---|---|
| `src/components/BottomMenu.jsx` | **New.** Bottom nav bar used by Dashboard, Channels, PTT, Profile screens. Removed Notifications tab + badge. |
| `src/components/PTTButton.jsx` | Changed from **toggle** to **push-to-hold** (`onPressIn`/`onPressOut`). Label: "HOLD TO TALK" / "TRANSMITTING". |

### New Data & Hooks
| File | Description |
|---|---|
| `src/data/notifications.ts` | 8 mock notifications (satellite link events, presence updates, PTT queue warnings) |
| `src/hooks/useAuth.ts` | Thin wrapper around `AuthContext` |
| `src/hooks/useTalkgroups.ts` | REST hook: `GET /talkgroups` with JWT auth |
| `src/theme/index.d.ts` | TypeScript declarations for the theme object |
| `src/config.d.ts` | TypeScript declarations for `CONFIG` |

### Store Changes (`src/store/index.ts`)
Added `preferredConnection: ConnectionMode` state (`'satellite' | 'cellular'`, default `'satellite'`) with `setPreferredConnection` action. Used by Dashboard and PTT screens to show the active transport.

---

## Merge Conflicts — How Each Was Resolved

### 1. `src/store/index.ts` — Content conflict
**Cause:** Shri's admin panel added `user/setUser/clearAuth`; Annie added `preferredConnection/setPreferredConnection`.
**Resolution:** Kept both sets of additions. Final type is `AppState` (exported) with all fields.

### 2. `src/screens/LoginScreen.tsx` — Content conflict
**Cause:** Annie's version used `AuthContext.signIn()` and had no SATCOM timeout or admin routing.
**Resolution:** Kept **HEAD** (our version). Rationale: our version has the 30s `AbortController` timeout required for SATCOM links, decodes the JWT payload, calls `setUser()` (required for admin routing in `App.jsx`), and calls `connectComms(jwt)` for PTT users.

### 3. `src/screens/Channels.jsx` — Content conflict
**Cause:** Annie's import section removed backend imports (`emitStartTalking`, `emitStopTalking`, `joinChannel`, `connectComms`, `useStore`) and `handlePTTToggle` had `// TODO` stubs.
**Resolution:** Kept HEAD's full backend import set, added Annie's `BottomMenu` import. Applied Annie's `handlePTTStart`/`handlePTTEnd` rename but **wired the audio** (see §Backend Integration below).

### 4. `src/App.jsx` — Delete/modify conflict
**Cause:** Annie deleted `App.jsx` and replaced it with `App.tsx` + `RootNavigator`. HEAD modified `App.jsx` with the admin navigator.
**Resolution:** Kept HEAD's `App.jsx` (preserves admin navigator) but replaced `UserNavigator` (old Channels→PTT stack) with Annie's `AppDrawer`. Wrapped `AppDrawer` in `ChannelProvider` since `Channels.jsx` and `PTTScreen.jsx` both consume `ChannelContext`.

### 5. `src/screens/PTTScreen.jsx` — Delete/modify conflict
**Cause:** Annie deleted `PTTScreen.jsx` (she was using `PTTScreen.tsx`). HEAD had the fully-wired version with floor control and SATCOM toggle.
**Resolution:** Kept HEAD's `PTTScreen.jsx`. Updated `AppDrawer.tsx` to explicitly import `'../screens/PTTScreen.jsx'` so Metro doesn't resolve to the stub `.tsx`.

### 6. `packages/mobile/package.json` — Content conflict
**Cause:** HEAD had `@react-navigation/bottom-tabs` (admin tabs) + `react-leaflet` + `satellite.js` + `tailwindcss`. Annie had `@react-navigation/drawer` + `@react-navigation/native-stack` + `react-dom`.
**Resolution:** Merged both. All navigation packages kept. `react-native-gesture-handler` and `react-native-reanimated` explicitly added (required by `@react-navigation/drawer`).

### 7. `package.json` (root) — Content conflict
**Cause:** HEAD had `@playwright/test`; Annie had `@types/react` + `@types/react-native`.
**Resolution:** Kept all three.

### 8. `packages/mobile/index.js` — Content conflict
**Cause:** Annie's version dropped the gesture handler import, global.css import, and imported `App` without explicit extension.
**Resolution:** Kept HEAD's version (gesture handler must be first import on Android; explicit `.jsx` extension avoids Metro ambiguity).

### 9. `packages/mobile/app.json` — Trivial whitespace conflict
**Resolution:** Kept HEAD's formatting.

### 10. `pnpm-lock.yaml` — Content conflict
**Resolution:** Run `pnpm install` to regenerate.

---

## Dev Artifacts Removed

The following files from Annie's branch were not code — they were local dev environment artifacts:

| File | Reason removed |
|---|---|
| `.expo/README.md`, `.expo/devices.json` | Expo device cache (root level) |
| `packages/mobile/.expo/README.md`, `.../devices.json` | Expo device cache |
| `pencil-halo.pen`, `pencil-welcome.pen` | Design tool session files |
| `packages/mobile/src/App.tsx` | Annie's replacement for App.jsx — superseded by our updated App.jsx |
| `packages/mobile/src/main.tsx` | Vite dev entry point — not used by Expo/Metro |
| `packages/mobile/src/screens/PTTScreen.tsx` | Partial reimplementation — superseded by our PTTScreen.jsx |

---

## Backend Integration Changes

### DashboardScreen.tsx — Connection mode selector wired
The satellite/cellular signal cards are now tappable. When a user taps "Satellite" or "Cellular":
1. `setPreferredConnection(mode)` — updates the store (persists across screens)
2. `comms.setTransportMode(mode === 'satellite' ? 'satcom' : 'cellular')` — actually switches the relay transport

**Before:** Tapping a card only updated local UI state.
**After:** Tapping a card switches the live transport in the comms SDK.

### Channels.jsx — Inline PTT wired with floor control + audio
The push-to-hold PTT button in each channel card is now fully wired:

```
onPressIn → handlePTTStart():
  emitStartTalking(deviceId, channelId)  ← floor control pre-check
  if floor busy → silently abort
  setIsTransmitting(true)
  startAudioStream()                     ← mic → Opus → AES-GCM → UDP

onPressOut → handlePTTEnd():
  setIsTransmitting(false)
  stopAudioStream()                      ← flush final audio chunk FIRST
  emitStopTalking(deviceId, channelId)   ← then clear floor
```

**Critical ordering:** `stopAudioStream()` is called before `emitStopTalking()`. The SDK guards `sendAudioChunk()` on its internal `isTransmitting` flag — reversing the order silently drops the last audio chunk.

**Before:** `handlePTTStart`/`handlePTTEnd` had `// TODO` stubs and did nothing.
**After:** Full audio TX with floor control.

### PTTScreen.jsx — Connection toggle syncs store
The existing `isSatcom` Switch toggle now also:
1. Calls `setPreferredConnection('satellite' | 'cellular')` to keep the store in sync
2. This means the Dashboard connection cards reflect the mode set from the PTT screen

---

## Navigation Flow (Post-Merge)

```
index.js
  └─ App.jsx
       ├─ user === null
       │    └─ <LoginScreen />   (full-screen, no nav container)
       │
       ├─ user.role === 'admin'
       │    └─ <NavigationContainer>
       │         └─ AdminNavigator (bottom tabs: Dashboard/Devices/Talkgroups/Users/Map)
       │
       └─ user.role === 'user'
            └─ <NavigationContainer>
                 └─ <ChannelProvider>
                      └─ AppDrawer (drawer navigator)
                           ├─ Dashboard   ← DashboardScreen.tsx (landing)
                           ├─ PTT         ← PTTScreen.jsx (fully wired: floor, audio, satcom)
                           ├─ Channels    ← Channels.jsx (inline push-to-hold PTT)
                           ├─ Notifications ← NotificationsScreen.tsx (hidden from drawer)
                           └─ Profile     ← ProfileScreen.tsx
```

BottomMenu within each user screen provides: Dashboard · Channels · PTT · Profile tabs.

---

## Known Issues / Next Steps

| # | Issue | Impact |
|---|---|---|
| 1 | `AuthStack.tsx` imports `LoginScreen` as default but it's a named export | `AuthStack` is currently unused (App.jsx doesn't use it), so no runtime error. Fix if RootNavigator is ever used. |
| 2 | `PTTScreen.jsx` has no `BottomMenu` — users can't navigate away without the system back button or the drawer | Low: Drawer is accessible via swipe gesture. Could add BottomMenu to PTTScreen.jsx. |
| 3 | `Channels.jsx` `selectChannel()` auto-navigates to PTT on channel select | Users land on PTT screen immediately. If inline PTT is the preferred flow, remove `navigation.navigate('PTT')`. |
| 4 | `useTalkgroups.ts` hook exists but `Channels.jsx` still fetches talkgroups inline | Minor redundancy. Could refactor to use the hook. |
| 5 | `preferredConnection` in store defaults to `'satellite'` but `isSatcom` in PTTScreen.jsx defaults to `false` | UI inconsistency. On first load PTTScreen shows CELLULAR active, Dashboard shows SATELLITE active. |
| 6 | `@react-navigation/drawer` requires `react-native-gesture-handler` and `react-native-reanimated` as peer deps | Added to package.json. Run `pnpm install` and `expo prebuild --clean` if drawer doesn't render on device. |
