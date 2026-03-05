# SkyTalk Admin Panel — Revised Implementation Plan

> **Handoff doc.** Drop this into a new chat session and say:
> "Read this file and help me implement the plan inside it."
> Everything the next session needs to know is in here.

---

## 1. What Changed and Why

The original plan was to build the admin panel in `packages/portal/` using Vite + React + shadcn/ui (web-only). **That plan is scrapped.** Here's why and what we're doing instead.

### The problem with the old approach

The original `packages/portal/` is a plain React web app — `<div>`, `<p>`, `<input>`, react-router-dom. It only runs in a browser. If we wanted admin functionality on mobile too, we'd need to build it twice: once in React (portal) and once in React Native (mobile). That's double the work for a week-long hackathon.

### The new approach: build inside `packages/mobile/`

We add admin screens directly into the existing Expo/React Native app. One codebase, one login, role-based routing:

```
LoginScreen
    │ login → decode JWT → check role
    │
    ├── role === "user"  →  User stack (ChannelsScreen → PTTScreen)  [already exists]
    │
    └── role === "admin" →  Admin stack (Dashboard, Devices, Talkgroups, Users)  [we build this]
```

This works because:
- **On native (Android/iOS):** Expo runs it as a normal React Native app.
- **On web:** `expo start --web` bundles it via Metro and serves it in a browser. React Native Web automatically translates `<View>` → `<div>`, `<Text>` → `<span>`, `<Pressable>` → `<button>`, etc.
- **Same code, both platforms.** No separate portal needed.

### Why NativeWind (not plain StyleSheet)

React Native normally uses `StyleSheet.create()` — JavaScript objects that look like CSS but aren't:
```js
const styles = StyleSheet.create({ container: { flex: 1, padding: 16, backgroundColor: '#000' } });
// Used as: <View style={styles.container}>
```

NativeWind lets you write Tailwind classes instead:
```jsx
<View className="flex-1 p-4 bg-black">
```

**Why this matters:**
- Tailwind classes are more readable and faster to iterate on
- NativeWind compiles these classes to native StyleSheet objects at build time — zero runtime cost
- On web, it outputs real CSS (same as regular Tailwind)
- If anyone on the team knows Tailwind, they can read and modify the admin screens immediately

**How NativeWind plugs into Metro:** NativeWind v4 provides a `withNativeWind()` function that wraps the existing Metro config. It adds a CSS transformer and a `.css` source extension. It does NOT touch `resolveRequest`, `watchFolders`, or any of the custom shims in our metro config — those are separate config keys. So it composes cleanly.

### Why we're NOT using packages/portal/ anymore

`packages/portal/` used:
- **Vite** as bundler (Metro is already the bundler for mobile)
- **react-router-dom** for navigation (React Navigation is already set up in mobile)
- **HTML elements** (`<div>`, `<input>`) which don't run on React Native
- **shadcn/ui** which is built on Radix UI (web-only DOM components)

None of that is cross-platform. The portal code can stay in the repo as reference, but we're not building on top of it.

---

## 2. Project Context (for anyone new)

**SkyTalk** — Push-to-talk walkie-talkie app over Iridium Certus satellite.
SKYTRAC Hackathon 2026 (Feb 28 – Mar 7). Team of 4.

**Team:**
- **Shri** — `packages/server/` (Fastify + Prisma + Postgres) + DigitalOcean infra
- **Saim** — `packages/comms/` (audio pipeline, WebSocket client, encryption)
- **Maisam + Annie** — `packages/mobile/` (Expo/React Native)

**Monorepo:** pnpm workspaces + Nx. Always use `pnpm`, never `npm`.

**NEVER RUN GIT COMMANDS** — Shri handles git manually.

---

## 3. Current State of `packages/mobile/`

### Two entry points (problem we're fixing)

The mobile package currently has TWO separate App components:

**`index.js` → `App.jsx`** (used on native):
- Uses `@react-navigation/stack` (Stack Navigator)
- Skips login entirely — goes straight to ChannelsScreen → PTTScreen
- No auth, no role check

**`App.tsx`** (used on web only):
- Uses `react-router-dom` (BrowserRouter)
- Has routes for `/login`, `/ptt`, `/map`
- LoginScreen exists but uses web-only HTML: `<div>`, `<input>`, `useNavigate()`, `import.meta.env`

**Our fix:** Unify into a single `App.jsx` using React Navigation for ALL platforms. React Navigation supports web via `@react-navigation/native`'s `NavigationContainer` with `linking` config. We drop `react-router-dom` and the web-only `App.tsx`.

### Zustand store (`src/store/index.ts`)

Already has `jwt` and `setJwt`. We add `user` (decoded JWT payload) and `setUser`. No new dependency needed.

```ts
// Current shape:
{ jwt, activeTalkgroup, talkgroups, signalStatus, floorStatus, gps, setJwt, ... }

// We add:
{ user: { sub, username, role } | null, setUser, clearAuth }
```

### Theme system (`src/theme/index.js`)

A full dark theme already exists with colors, spacing, radius, shadows, typography, and component style presets. The admin screens will use this theme for visual consistency with the existing PTT screens.

NativeWind doesn't replace this — we can use BOTH:
- NativeWind for layout classes (`className="flex-1 p-4"`)
- Theme constants for colors (`colors.background.primary`, `colors.status.active`)
- NativeWind's `style` prop still works alongside `className`

### Metro config (`metro.config.js`)

Already complex — custom `resolveRequest` for shims (ws, crypto, Node builtins), custom `watchFolders`, disabled Watchman. NativeWind's `withNativeWind()` wraps the ENTIRE config object. It modifies the transformer and extends `sourceExts` to include `.css`. It does NOT touch `resolveRequest`, `watchFolders`, or `watcher` — so it should compose without conflicts.

### Missing `"web"` platform

`app.json` only lists `"platforms": ["ios", "android"]`. We add `"web"` to enable `expo start --web`.

### JWT storage: no `localStorage` on native

The old portal plan used `localStorage` (browser-only). React Native doesn't have it. We use Zustand for JWT state (in-memory). On page refresh in the browser, you re-login. Fine for a hackathon. For production, you'd use `expo-secure-store` (native) or `localStorage` (web) via a Zustand persistence adapter.

---

## 4. Server API (all routes working, on DigitalOcean droplet)

**Base URL:** configured via `EXPO_PUBLIC_API_URL` env var (already exists in `src/config.js`)

**JWT payload:** `{ sub: userId, username: string, role: "admin"|"user" }`

| Method | Path | Auth | Response shape |
|--------|------|------|---------------|
| POST | /auth/login | None | `{ jwt }` |
| POST | /auth/register | None | `{ jwt, userId }` |
| GET | /talkgroups | JWT | `{ talkgroups: [{ id, name, rotation_counter, created_at }] }` |
| POST | /talkgroups | JWT+Admin | `{ talkgroup: { id, name, ... } }` |
| DELETE | /talkgroups/:id | JWT+Admin | `{ ok: true }` |
| GET | /talkgroups/:id/members | JWT | `{ members: [{ id, username, role }] }` |
| GET | /devices | JWT+Admin | `{ devices: [{ id, name, site, serial, active, created_at }] }` |
| PATCH | /devices/:id/status | JWT+Admin | `{ device: {...} }` |
| GET | /users | JWT+Admin | `{ users: [{ id, username, role, created_at, device_id }] }` |

---

## 5. Implementation Plan

### Step 0 — NativeWind setup

**Install:**
```bash
pnpm add nativewind tailwindcss --filter @forbiddenlan/mobile
```

**`packages/mobile/tailwind.config.js`** (new file):
```js
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: { extend: {} },
};
```

**`packages/mobile/global.css`** (new file):
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Modify `packages/mobile/babel.config.js`:**
```js
module.exports = {
  presets: ['babel-preset-expo', 'nativewind/babel'],
};
```

**Modify `packages/mobile/metro.config.js`:**
Add `withNativeWind()` wrapper around the entire config at the bottom:
```js
const { withNativeWind } = require('nativewind/metro');
// ... existing config stays exactly the same ...
module.exports = withNativeWind(config, { input: './global.css' });
```
(Currently just `module.exports = config;`)

**Modify `packages/mobile/app.json`:**
Add `"web"` to platforms:
```json
"platforms": ["ios", "android", "web"]
```

**Import global CSS in entry point — modify `packages/mobile/index.js`:**
```js
import './global.css';  // ADD THIS — loads NativeWind styles
```

**Verify:** `pnpm start --filter @forbiddenlan/mobile` should start Metro without errors.

---

### Step 1 — API helper: `src/lib/api.ts` (new file)

Same idea as the old portal plan but uses `CONFIG.API_URL` from `src/config.js` instead of `import.meta.env`, and reads JWT from the Zustand store instead of `localStorage`.

```ts
import { CONFIG } from '../config';

class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, body: any) {
    super(body?.error ?? `Request failed: ${status}`);
    this.status = status;
    this.body = body;
  }
}

// JWT getter — set by the store after login. Avoids circular import with Zustand.
let _getJwt: () => string | null = () => null;
export function setJwtGetter(fn: () => string | null) { _getJwt = fn; }

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const jwt = _getJwt();
  const headers: Record<string, string> = {};
  if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
  if (options.body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${CONFIG.API_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const api = {
  get:    <T>(path: string)                 => request<T>(path),
  post:   <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST',   body: body ? JSON.stringify(body) : undefined }),
  patch:  <T>(path: string, body: unknown)  => request<T>(path, { method: 'PATCH',  body: JSON.stringify(body) }),
  delete: <T>(path: string)                 => request<T>(path, { method: 'DELETE' }),
};
export { ApiError };
```

**Why the `setJwtGetter` pattern:** We can't import the Zustand store directly in `api.ts` because the store imports from `@forbiddenlan/comms` which triggers the Metro resolver chain. Instead, we inject a simple getter function from the app startup. This avoids circular dependencies.

---

### Step 2 — Expand Zustand store

Modify `src/store/index.ts` to add user/auth fields:

```ts
interface User { sub: string; username: string; role: string; }

// Add to AppState interface:
user: User | null;
setUser: (u: User | null) => void;
clearAuth: () => void;

// Add to create():
user: null,
setUser: (user) => set({ user }),
clearAuth: () => set({ jwt: null, user: null }),
```

---

### Step 3 — Rewrite LoginScreen with React Native components

Replace `src/screens/LoginScreen.tsx`. The current version uses web-only HTML (`<div>`, `<input>`, `useNavigate` from react-router-dom). Rewrite with:
- `<View>`, `<Text>`, `<TextInput>`, `<Pressable>` from react-native
- NativeWind classes for layout
- Theme colors from `src/theme/index.js`
- Calls `POST /auth/login` via `api.post()`
- Decodes JWT → calls `setJwt()` + `setUser()` on Zustand store
- Does NOT navigate — the parent navigator conditionally renders based on auth state

**How login triggers navigation (no explicit `navigate()` call):**
The root App component reads `user` from the Zustand store. If `user === null`, it shows the LoginScreen. When login succeeds and `setUser()` is called, the store updates, the App re-renders, and the navigator switches to the appropriate stack (admin or user) automatically. This is the standard React Navigation auth pattern — called "conditional rendering" instead of imperative `navigate()`.

---

### Step 4 — Rewrite App.jsx (unified navigation)

Replace the current `App.jsx` (which skips login). New structure:

```
App.jsx
├── if user === null → LoginScreen (no navigation chrome)
├── if user.role === "admin" → Admin Tab Navigator
│   ├── Dashboard tab
│   ├── Devices tab
│   ├── Talkgroups tab
│   └── Users tab
└── if user.role === "user" → User Stack Navigator (existing)
    ├── ChannelsScreen
    └── PTTScreen
```

Uses `@react-navigation/bottom-tabs` for the admin panel (tabs across the bottom — works well on both mobile and web). The user stack keeps the existing `@react-navigation/stack`.

**Why bottom tabs for admin (not a sidebar):**
- Bottom tabs are a native React Navigation primitive — no extra library needed
- They work on both mobile and web without any platform-specific code
- On web, the tabs render along the bottom just like on mobile
- A sidebar would require conditional rendering (sidebar on web, tabs on mobile) which adds complexity
- For v2 we can add a sidebar on web via responsive layout — v1 just needs to work

**What happens to `App.tsx` (the web-only react-router-dom version):** It becomes unused. `index.js` already imports `App.jsx` explicitly. Expo Web also uses `index.js` as the entry point. We can delete `App.tsx` or leave it — it won't be loaded.

**Install:** `pnpm add @react-navigation/bottom-tabs --filter @forbiddenlan/mobile`

---

### Step 5 — Admin screens (4 new files)

All admin screens go in `src/screens/admin/`. They use:
- React Native components (`View`, `Text`, `ScrollView`, `Pressable`, `TextInput`, `FlatList`, `Alert`)
- NativeWind classes for layout
- Theme constants for colors
- `api.get/post/patch/delete` from `src/lib/api.ts`
- `useEffect` + `useState` for data fetching (same pattern as old portal, just RN components)

**`src/screens/admin/AdminDashboard.tsx`**
- Fetches `/devices`, `/talkgroups`, `/users` in parallel
- Shows stat cards: Total Users, Total Devices, Active Devices, Talkgroups
- Device status list below (name, site, serial, active badge)

**`src/screens/admin/AdminDevices.tsx`**
- Fetches `GET /devices`
- FlatList of device rows: serial, name, site, active badge
- Enable/Disable toggle button per device (`PATCH /devices/:id/status`)

**`src/screens/admin/AdminTalkgroups.tsx`**
- Fetches `GET /talkgroups`
- Create form at top (TextInput + Create button → `POST /talkgroups`)
- FlatList of talkgroup cards
- Each card: expand to show members (`GET /talkgroups/:id/members`)
- Delete button per talkgroup (`DELETE /talkgroups/:id`)

**`src/screens/admin/AdminUsers.tsx`**
- Fetches `GET /users`
- Register form at top (username + password + Register button → `POST /auth/register`)
- FlatList of user rows: username, role badge, device_id, created date

**Feedback pattern (replacing toast):**
React Native doesn't have browser toast libraries. Use `Alert.alert()` for confirmations (delete), and a simple state-based message bar for success/error. Or use `react-native-toast-message` if we want something nicer. For v1, `Alert.alert()` is sufficient.

---

### Step 6 — Wire JWT getter + verify

In `App.jsx`, after the store is available, call:
```ts
import { setJwtGetter } from './lib/api';
import { useStore } from './store';

// Inside the App component:
const jwt = useStore(s => s.jwt);
useEffect(() => {
  setJwtGetter(() => useStore.getState().jwt);
}, []);
```

This connects the API helper to the Zustand store so every API call automatically includes the JWT.

---

## 6. File Summary

### New files to create

| File | Purpose |
|------|---------|
| `tailwind.config.js` | NativeWind/Tailwind configuration |
| `global.css` | Tailwind directives (`@tailwind base/components/utilities`) |
| `src/lib/api.ts` | Fetch wrapper with JWT + error handling |
| `src/screens/admin/AdminDashboard.tsx` | Dashboard: stat cards + device status |
| `src/screens/admin/AdminDevices.tsx` | Device list + enable/disable toggle |
| `src/screens/admin/AdminTalkgroups.tsx` | Talkgroup CRUD + member list |
| `src/screens/admin/AdminUsers.tsx` | User list + register form |

### Existing files to modify

| File | Change |
|------|--------|
| `metro.config.js` | Wrap with `withNativeWind()` |
| `babel.config.js` | Add `'nativewind/babel'` preset |
| `app.json` | Add `"web"` to platforms |
| `index.js` | Add `import './global.css'` |
| `src/store/index.ts` | Add `user`, `setUser`, `clearAuth` |
| `src/App.jsx` | Full rewrite: login gate + role-based navigation |
| `src/screens/LoginScreen.tsx` | Full rewrite: RN components, api.post, Zustand |

### Existing files that become unused

| File | Why |
|------|-----|
| `src/App.tsx` | Web-only react-router-dom entry point. Replaced by unified `App.jsx`. |

### Dependencies to install

```bash
pnpm add nativewind tailwindcss @react-navigation/bottom-tabs --filter @forbiddenlan/mobile
```

---

## 7. Execution Order

```
Step 0 (NativeWind setup: install, tailwind.config, global.css, babel, metro, app.json, index.js)
  └─> Step 1 (src/lib/api.ts)
        └─> Step 2 (expand Zustand store)
              └─> Step 3 (rewrite LoginScreen)
                    └─> Step 4 (rewrite App.jsx — unified navigation)
                          └─> Step 5 (admin screens — can be built in parallel)
                                ├── AdminDashboard.tsx
                                ├── AdminDevices.tsx
                                ├── AdminTalkgroups.tsx
                                └── AdminUsers.tsx
                          └─> Step 6 (wire JWT getter + verify)
```

---

## 8. Verification Checklist

### Native (Android/iOS via Expo Go)
- [ ] `expo start` → app loads without errors
- [ ] Shows login screen (not channels)
- [ ] Login with `admin` / `admin` → see admin tabs (Dashboard, Devices, Talkgroups, Users)
- [ ] Login with `pilot1` / `test` → see channels/PTT screen (existing user flow)
- [ ] Admin tabs: Dashboard loads stats, Devices loads list, Talkgroups loads list, Users loads list
- [ ] Create talkgroup → success alert → appears in list
- [ ] Delete talkgroup → confirm alert → removed from list
- [ ] Enable/Disable device → status updates
- [ ] Register user → success alert → appears in list

### Web (Expo Web via `expo start --web`)
- [ ] App loads in browser at localhost:8081
- [ ] Same login flow as native
- [ ] Admin tabs render correctly in browser
- [ ] All CRUD operations work
- [ ] Bottom tab navigation works

---

## 9. Potential Gotchas

0. **Remote server:** Set `EXPO_PUBLIC_API_URL=http://<droplet-ip>:3000` in `packages/mobile/.env`. The existing `src/config.js` already reads this.

1. **CORS:** Browser (Expo Web) at `localhost:8081` calling server on the droplet. Server has `@fastify/cors` registered — should work. If CORS errors appear, check `packages/server/src/index.ts` for `app.register(cors, { origin: true })`.

2. **NativeWind + Metro config:** The `withNativeWind()` wrapper adds CSS transformer support. It does NOT modify `resolveRequest`, `watchFolders`, or `watcher`. Should compose cleanly with existing config. If it breaks, the fallback is to use the theme system's `StyleSheet`-based `componentStyles` from `src/theme/index.js` directly (zero setup, already works).

3. **`react-native-web` install:** Expo SDK 54 includes `react-native-web` as a transitive dependency via `@expo/metro-runtime`. It should already be resolvable. If not, `pnpm add react-native-web react-dom --filter @forbiddenlan/mobile`.

4. **No `localStorage` on native:** JWT is stored in Zustand (in-memory). Page refresh on web = re-login. Fine for a hackathon. For persistence: add Zustand `persist` middleware with `expo-secure-store` (native) or `localStorage` (web).

5. **Register only creates `role: "user"`:** `POST /auth/register` always sets role to "user". Admin users come from the seed script.

6. **Two App files:** `index.js` explicitly imports `App.jsx`. `App.tsx` (the react-router-dom version) is orphaned — not imported by anything. It can be deleted or left alone.

7. **`@react-navigation/bottom-tabs` on web:** Works, but the tab bar renders at the bottom of the viewport. On web this looks slightly unusual (most web dashboards use sidebars). For v1 this is fine and proves cross-platform. v2 can add a responsive sidebar for web.

---

## 10. What This Means for Saim's Code (packages/comms)

**No impact.** We are not modifying anything in `packages/comms/`. The admin screens only call REST API endpoints — they don't use the WebSocket relay, audio pipeline, or encryption. The comms library is consumed by the PTT/user flow, which remains untouched.

The only shared touchpoint is the Zustand store (`src/store/index.ts`), which comms hooks like `useComms.ts` already read from. We're adding fields (`user`, `setUser`, `clearAuth`) but not changing existing fields.

---

## 11. v2 Scope (future)

- **Map UI:** `react-native-maps` (native) + `leaflet` (web) for GPS device positions
- **Real-time WebSocket:** Connect to relay, show presence dots, active transmissions
- **Responsive layout:** Sidebar on web, tabs on mobile (detect platform via `Platform.OS`)
- **Better tables:** `@shopify/flash-list` for large lists
- **Dark/light theme toggle**
- **Key rotation UI**
- **Talkgroup member management** (add/remove users)
