# Mobile App Setup & Troubleshooting Guide

**Last Updated:** 2026-03-03  
**App:** `packages/mobile` (React Native + Expo SDK 54)  
**Build System:** Metro bundler + pnpm workspaces

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Running the Android App](#running-the-android-app)
3. [Moving from MVP to Production Backend](#moving-from-mvp-to-production-backend)
4. [Common Issues & Fixes](#common-issues--fixes)
5. [Architecture Decisions](#architecture-decisions)
6. [Developer Notes](#developer-notes)

---

## Quick Start

### Prerequisites

- **Node.js** 18+ and **pnpm** 9+
- **Android Studio** with SDK 36 (or Android SDK command-line tools)
- **Java 21** (for Gradle)
- **Android Emulator** or physical device with USB debugging enabled

### First-Time Setup

```bash
# Install dependencies
pnpm install

# Set inotify limits for Metro (Linux only)
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Create local env config (already exists but verify)
cd packages/mobile
ls -la .env.local  # Should contain EXPO_PUBLIC_* variables

# Start Android emulator
emulator -avd Pixel_9 &

# Build and run the app
cd ../..
./run-android.sh
```

**⚠️ Default Configuration:** The app runs in **MVP mode** by default with:
- `MockRelaySocket` (local loopback, no real server)
- Pass-through crypto (NO encryption, plaintext audio)

This is suitable for UI/audio pipeline testing only. For production deployment, see [Moving from MVP to Production Backend](#moving-from-mvp-to-production-backend).

---

## Running the Android App

### Using the Run Script (Recommended)

```bash
# From workspace root
./run-android.sh
```

**What this does:**
1. Tunes inotify limits for Metro's file watcher
2. Loads environment variables from `.env.local`
3. Runs `expo run:android` which:
   - Builds the APK with Gradle
   - Installs it to connected device/emulator
   - Starts Metro bundler
   - Opens the app

### Manual Steps

```bash
# 1. Start emulator (if not running)
emulator -avd Pixel_9 &

# 2. Verify device is connected
adb devices

# 3. Start Metro bundler
cd packages/mobile
pnpm start

# 4. In another terminal, build and install
cd packages/mobile
pnpm android
```

### Stopping the App

```bash
# Stop Metro bundler
pkill -f "node.*expo"

# Stop emulator
adb emu kill

# Force-stop app on device
adb shell am force-stop com.forbiddenlan.skytalk
```

---

## Moving from MVP to Production Backend

The current mobile app is configured for **MVP testing** with two critical limitations:

1. **MockRelaySocket** — All communications are local loopback (no real server)
2. **Pass-through crypto** — Audio is transmitted in plaintext (NO encryption)

### Prerequisites for Production

Before switching to the real backend, you must:

1. **Deploy the relay server** — See [BACKEND_INTEGRATION.md](./BACKEND_INTEGRATION.md) for complete server setup instructions
   - Deploy to DigitalOcean or your infrastructure
   - Configure authentication, talkgroups, and WebSocket endpoints
   - Set up key rotation for AES-GCM encryption
   - Verify server is reachable from your network

2. **Implement real AES-GCM encryption** — The pass-through polyfill MUST be replaced:
   ```bash
   # Current file that needs replacement
   packages/mobile/src/shims/setup-crypto.js
   ```
   
   Options for production encryption:
   - **Recommended:** `@noble/ciphers` (pure JS, 8KB, audited)
   - Alternative: `react-native-quick-crypto` (native, faster, complex)
   - Alternative: `crypto-browserify` + `@aws-crypto/aes-gcm`

### Switching to Production Mode

#### Step 1: Update Environment Configuration

Edit `packages/mobile/.env.local`:

```bash
# Change from mock mode to real backend
EXPO_PUBLIC_MOCK_MODE=false

# Point to your deployed relay server
EXPO_PUBLIC_WS_URL=wss://your-relay-server.example.com

# Add authentication config (see BACKEND_INTEGRATION.md)
EXPO_PUBLIC_AUTH_ENDPOINT=https://your-relay-server.example.com/auth
EXPO_PUBLIC_DEVICE_ID=your-device-uuid
```

#### Step 2: Replace Crypto Polyfill

**Install real crypto library:**
```bash
cd packages/mobile
pnpm add @noble/ciphers
```

**Replace `src/shims/setup-crypto.js` with real implementation:**
```javascript
import 'react-native-get-random-values';
import { gcm } from '@noble/ciphers/aes';
import { utf8ToBytes, bytesToHex } from '@noble/ciphers/utils';

// Real AES-GCM implementation using @noble/ciphers
if (typeof global.crypto.subtle === 'undefined') {
  global.crypto.subtle = {
    async importKey(format, keyData, algorithm, extractable, usages) {
      // Validate and store the raw key
      const key = new Uint8Array(keyData);
      if (key.length !== 32) throw new Error('AES-GCM requires 256-bit key');
      
      return {
        type: 'secret',
        extractable,
        algorithm,
        usages,
        _rawKey: key,
      };
    },
    
    async encrypt(algorithm, key, data) {
      const aes = gcm(key._rawKey, algorithm.iv);
      const plaintext = new Uint8Array(data);
      const ciphertext = aes.encrypt(plaintext);
      
      // Prepend IV for compatibility with Web Crypto API format
      const combined = new Uint8Array(algorithm.iv.length + ciphertext.length);
      combined.set(new Uint8Array(algorithm.iv), 0);
      combined.set(ciphertext, algorithm.iv.length);
      return combined.buffer;
    },
    
    async decrypt(algorithm, key, data) {
      const combined = new Uint8Array(data);
      const ivLength = 12; // GCM standard IV length
      const iv = combined.slice(0, ivLength);
      const ciphertext = combined.slice(ivLength);
      
      const aes = gcm(key._rawKey, iv);
      const plaintext = aes.decrypt(ciphertext);
      return plaintext.buffer;
    },
  };
}
```

#### Step 3: Test Encryption Before Production

**Verify encryption works locally:**
```bash
cd packages/mobile
pnpm test:crypto  # If you have unit tests

# Or manually test in app with console logging
```

**Test with backend server:**
1. Ensure relay server is running (see [BACKEND_INTEGRATION.md](./BACKEND_INTEGRATION.md))
2. Clear app cache: `rm -rf .expo node_modules/.cache`
3. Rebuild: `./run-android.sh`
4. Verify in Metro logs: Look for `[comms] init success` (not `[comms] init error`)
5. Test audio transmission between two devices

#### Step 4: Verify Production Readiness

**Checklist:**
- [ ] Relay server deployed and accessible via HTTPS/WSS
- [ ] Real AES-GCM encryption implemented (NOT pass-through)
- [ ] Environment variables point to production server
- [ ] Authentication working (JWT tokens, device registration)
- [ ] Audio encryption/decryption tested between devices
- [ ] Floor control arbitration working with real GPS timestamps
- [ ] Bandwidth monitoring confirms <18kbps per active stream

### Rollback to MVP Mode

If you need to switch back to mock mode for testing:

```bash
# Edit packages/mobile/.env.local
EXPO_PUBLIC_MOCK_MODE=true

# Clear cache and rebuild
rm -rf packages/mobile/.expo packages/mobile/node_modules/.cache
./run-android.sh
```

### Common Production Issues

**Issue: "WebSocket connection failed" / "ECONNREFUSED"**
- Verify relay server is running: `curl https://your-relay-server.example.com/health`
- Check firewall rules allow WSS traffic (port 443 or custom port)
- Test WebSocket connection: `wscat -c wss://your-relay-server.example.com`

**Issue: "Encryption error" / "Cannot decrypt audio"**
- Verify both devices use the same encryption key
- Check key rotation timing (see BACKEND_INTEGRATION.md)
- Ensure IV generation uses secure random values (not mock/hardcoded)

**Issue: Audio works but sounds garbled**
- May indicate encryption/decryption mismatch
- Check logs for `[Encryption] decrypt failed` errors
- Verify Opus codec bitrate matches between devices

---

## Common Issues & Fixes

### Issue 1: Metro Bundler Can't Resolve `expo-modules-core`

**Error:**
```
Unable to resolve "expo-modules-core" from "node_modules/.pnpm/expo@54.0.33_.../node_modules/expo/src/Expo.ts"
```

**Cause:**  
Metro's default configuration doesn't follow pnpm's symlinks into the `.pnpm/` virtual store. When `expo-modules-core` is resolved through a symlink, Metro can't find the actual file.

**Fix Applied:**  
Updated `packages/mobile/metro.config.js`:

```javascript
// Enable symlink following so Metro can watch files in pnpm's .pnpm/ directory
config.resolver.unstable_enableSymlinks = true;

// Add workspace node_modules to watchFolders
config.watchFolders = [
  path.resolve(workspaceRoot, "packages/comms"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Smart ignore function to avoid watching unnecessary files
config.watcher = {
  watcherOptions: {
    ignore: (filename) => {
      // Always ignore build/cache directories
      if (/(\.gradle|[/\\]android[/\\]app[/\\]build[/\\]|\.expo[/\\]|[/\\]dist[/\\]|[/\\]build[/\\]|[/\\]\.cache[/\\])/.test(filename)) {
        return true;
      }
      
      // In node_modules, only watch expo packages in .pnpm/expo-*/
      if (filename.includes("node_modules")) {
        const inPnpmExpo = filename.includes(".pnpm") && 
                           /\/expo[^/]*\/node_modules\/expo[^/]*\/src\//.test(filename);
        return !inPnpmExpo;
      }
      
      return false;
    },
  },
};
```

**Why This Works:**
- `unstable_enableSymlinks` tells Metro to follow symlinks and resolve to their real paths
- Adding `node_modules/` to `watchFolders` lets Metro discover files in `.pnpm/`
- The ignore function prevents Metro from opening file handles for all ~600k files in node_modules
- We only watch Expo source files that Metro actually needs to transform

**Tradeoff:**  
Increased Metro startup time (~2-3 seconds) and higher memory usage (~200MB more) because Metro now tracks additional file paths. This is acceptable because the alternative (not supporting pnpm workspaces) is worse.

---

### Issue 2: `crypto` Doesn't Exist / `crypto.subtle` is Undefined

**Error:**
```
WARN  [comms] init error: [ReferenceError: Property 'crypto' doesn't exist]
ERROR [TypeError: Cannot read property 'importKey' of undefined]
```

**Cause:**  
React Native's JavaScript runtime (Hermes) does not implement the Web Crypto API (`crypto.subtle`). The `@forbiddenlan/comms` package uses `crypto.subtle.importKey()`, `encrypt()`, and `decrypt()` for AES-GCM audio encryption, which doesn't exist in React Native.

**Fix Applied:**  
Created a Web Crypto API polyfill for React Native.

**Files Created/Modified:**

1. **`packages/mobile/src/shims/setup-crypto.js`** — Polyfill implementation:
   ```javascript
   import 'react-native-get-random-values';
   
   if (typeof global.crypto === 'undefined') {
     global.crypto = {};
   }
   
   if (typeof global.crypto.getRandomValues === 'undefined') {
     global.crypto.getRandomValues = (array) => {
       for (let i = 0; i < array.length; i++) {
         array[i] = Math.floor(Math.random() * 256);
       }
       return array;
     };
   }
   
   if (typeof global.crypto.subtle === 'undefined') {
     global.crypto.subtle = {
       async importKey(format, keyData, algorithm, extractable, usages) {
         // MVP: Return mock CryptoKey
         return { type: 'secret', extractable, algorithm, usages, _mockKey: true };
       },
       
       async encrypt(algorithm, key, data) {
         // MVP: Pass-through "encryption" - just prepend IV
         const combined = new Uint8Array(algorithm.iv.length + data.byteLength);
         combined.set(new Uint8Array(algorithm.iv), 0);
         combined.set(new Uint8Array(data), algorithm.iv.length);
         return combined.buffer;
       },
       
       async decrypt(algorithm, key, data) {
         // MVP: Pass-through "decryption" - strip IV
         const combined = new Uint8Array(data);
         const ivLength = 12;
         return combined.slice(ivLength).buffer;
       },
     };
   }
   ```

2. **`packages/mobile/index.js`** — Load polyfill before app:
   ```javascript
   import './src/shims/setup-crypto';
   import { registerRootComponent } from 'expo';
   import App from './src/App.jsx';
   registerRootComponent(App);
   ```

3. **`packages/mobile/metro.config.js`** — Shim crypto module:
   ```javascript
   // Removed 'crypto' from NODE_BUILTIN_SHIMS (was mapping to empty.js)
   
   // Added explicit crypto shim:
   if (moduleName === "crypto") {
     return { type: "sourceFile", filePath: path.resolve(shimDir, "crypto.js") };
   }
   ```

**Why This Works:**
- The polyfill is loaded before any code that uses `crypto` (including `@forbiddenlan/comms`)
- `global.crypto.subtle` is now defined with the methods the Encryption class needs
- Metro resolves `import crypto from 'crypto'` to our shim instead of throwing an error

**Tradeoff:**  
**⚠️ SECURITY WARNING:** The current implementation is a **pass-through for MVP testing only**. It prepends the IV but performs NO ACTUAL ENCRYPTION. Audio data is transmitted in plaintext.

**For Production:**  
Replace the polyfill with a real AES-GCM implementation using a pure-JavaScript crypto library:
- Option 1: `@noble/ciphers` (lightweight, audited)
- Option 2: `react-native-quick-crypto` (native bindings, faster but complex setup)
- Option 3: `crypto-browserify` + `@aws-crypto/aes-gcm` (browser-compatible)

**See [Moving from MVP to Production Backend](#moving-from-mvp-to-production-backend) for complete migration instructions.**

**Related Dependencies:**
```json
{
  "react-native-get-random-values": "^2.0.0",  // Polyfills crypto.getRandomValues
  "expo-crypto": "^55.0.8"                      // Alternative for hashing (not used for AES yet)
}
```

---

### Issue 3: `Cannot read property 'emit' of null`

**Error:**
```
ERROR  [TypeError: Cannot read property 'emit' of null]
```

**Cause:**  
In `packages/mobile/src/screens/Channels.jsx`, the code called `socket.emit()` without checking if socket was initialized. When comms initialization fails (e.g., due to crypto error), the socket object is `null`.

**Fix Applied:**
```javascript
// Before
useEffect(() => {
  if (!CONFIG.MOCK_MODE) {
    socket.emit('list-channels');
    socket.on('channels', list => setChannels(list));
    return () => socket.off('channels');
  }
}, []);

// After
useEffect(() => {
  if (!CONFIG.MOCK_MODE && socket) {
    socket.emit('list-channels');
    socket.on('channels', list => setChannels(list));
    return () => socket.off('channels');
  }
}, []);
```

**Why This Works:**  
The null check prevents the app from crashing when socket initialization fails. The app degrades gracefully to mock mode.

---

### Issue 4: Metro Bundler `EMFILE` / `ENOSPC` — too many open files or file watchers

**Errors (any of these):**
```
Error: EMFILE: too many open files, watch '/home/.../packages/mobile'
Error: ENOSPC: System limit for number of file watchers reached, watch '...'
```

**Cause:**  
Metro's file watcher (FallbackWatcher, since Watchman is disabled) uses Node.js `fs.watch()` which consumes inotify watches. Linux has THREE independent limits:

| Limit | Sysctl | Default | Needed |
|-------|--------|---------|--------|
| Watches per user | `fs.inotify.max_user_watches` | 8,192 | **4,194,304** |
| Instances per user | `fs.inotify.max_user_instances` | 128–512 | **8,192** |
| Open files per process | `ulimit -n` | 1,024 | **65,536** |

**Why 524,288 watches is NOT enough:**  
This monorepo runs on **btrfs**. VS Code + Java Language Server + Gradle extension consume **2,000,000+ inotify watches** on btrfs. The commonly-recommended 524,288 leaves nothing for Metro. We confirmed this by counting:
```bash
# This showed 2,093,154 watches in use with a 524,288 limit:
find /proc/*/fdinfo -type f 2>/dev/null -exec grep -l inotify {} \; 2>/dev/null | \
  while read f; do grep -c inotify "$f" 2>/dev/null; done | \
  awk '{s+=$1} END {print s}'
```

**Fix — Raise all three limits:**

```bash
# 1. Raise immediately (current session)
sudo sysctl -w fs.inotify.max_user_watches=4194304
sudo sysctl -w fs.inotify.max_user_instances=8192

# 2. Make permanent (survives reboot)
cat <<EOF | sudo tee /etc/sysctl.d/99-inotify.conf
fs.inotify.max_user_watches=4194304
fs.inotify.max_user_instances=8192
EOF
sudo sysctl --system

# 3. Raise open file limit
ulimit -n 65536
# Or permanently in /etc/security/limits.d/99-dev.conf:
# * soft nofile 65536
# * hard nofile 65536

# 4. Kill stale watchers and retry
pkill -9 -f "node\|expo\|metro"
sleep 1
cd packages/mobile && npx expo run:android --device
```

**Metro config (already applied):**  
`metro.config.js` disables Watchman (`useWatchman = false`) and uses an ignore function to skip unnecessary directories:
```javascript
config.watcher = {
  watcherOptions: {
    ignore: (filename) => {
      if (/(\.gradle|\.expo|build|dist|\.cache)/.test(filename)) return true;
      if (filename.includes("node_modules")) {
        const inPnpmExpo = filename.includes(".pnpm") && 
          /\/expo[^/]*\/node_modules\/expo[^/]*\//.test(filename);
        return !inPnpmExpo;
      }
      return false;
    },
  },
};
```

**Do NOT re-enable Watchman** — it triggers inotify-poison on this btrfs monorepo.

**Verification:**
```bash
# Check both limits
sysctl fs.inotify.max_user_watches fs.inotify.max_user_instances

# Count actual watches in use
find /proc/*/fdinfo -type f 2>/dev/null -exec grep -l inotify {} \; 2>/dev/null | \
  while read f; do grep -c inotify "$f" 2>/dev/null; done | \
  awk '{s+=$1} END {print "Total watches:", s}'

# Count inotify instances in use
find /proc/*/fd -lname 'anon_inode:inotify' 2>/dev/null | wc -l
```

---

### Issue 5: Gradle Build Fails with `SDK location not found`

**Error:**
```
FAILURE: Build failed with an exception.
* What went wrong: SDK location not found. Define location with sdk.dir in the local.properties file or with an ANDROID_HOME environment variable.
```

**Fix:**
```bash
# Set ANDROID_HOME
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools

# Add to ~/.bashrc or ~/.zshrc to persist
echo 'export ANDROID_HOME=$HOME/Android/Sdk' >> ~/.bashrc
echo 'export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools' >> ~/.bashrc
source ~/.bashrc

# Verify
echo $ANDROID_HOME
adb version
```

---

### Issue 6: Emulator Not Starting or Crashing

**Check available AVDs:**
```bash
emulator -list-avds
```

**Start emulator with verbose logging:**
```bash
emulator -avd Pixel_9 -verbose -show-kernel
```

**Common fixes:**

1. **KVM permissions (Linux):**
   ```bash
   sudo usermod -aG kvm $USER
   # Log out and back in
   ```

2. **Disk space:**
   ```bash
   df -h $ANDROID_HOME
   # Clean up old system images/avds if needed
   ```

3. **Wipe emulator data:**
   ```bash
   emulator -avd Pixel_9 -wipe-data
   ```

4. **Graphics driver issues:**
   ```bash
   # Try software rendering
   emulator -avd Pixel_9 -gpu swiftshader_indirect
   ```

---

## Architecture Decisions

### Why pnpm + Monorepo?

**Decision:** Use pnpm workspaces with `shamefully-hoist=true` instead of npm/yarn.

**Reasoning:**
- **Disk space:** pnpm's content-addressable store saves ~3GB compared to npm
- **Install speed:** pnpm is 2-3x faster on clean install
- **Strict dependencies:** pnpm's symlink-based isolation catches phantom dependencies early

**Tradeoff:**  
Metro bundler doesn't support pnpm's symlinks out of the box. We had to:
1. Enable `unstable_enableSymlinks` (adds ~200MB memory overhead)
2. Add workspace `node_modules/` to `watchFolders` (~2s startup penalty)
3. Implement smart ignore patterns to avoid watching 600k irrelevant files

Alternative would be using npm/yarn with flat node_modules, but this loses pnpm's benefits.

---

### Why Pass-Through Crypto for MVP?

**Decision:** Implement a no-op `crypto.subtle` polyfill for MVP instead of real AES-GCM.

**Reasoning:**
- **Time constraint:** Implementing proper AES-GCM in pure JS or integrating `react-native-quick-crypto` native modules would take 1-2 days
- **Testing:** The audio pipeline, PTT signaling, and UI can be tested without encryption
- **Encryption is end-to-end:** Even in production, the relay server doesn't decrypt audio — it just forwards encrypted blobs. For demo purposes with mock mode, no encryption is acceptable.

**Tradeoff:**  
**Audio is transmitted in plaintext** in the current build. This is only acceptable for:
- Local testing with MockRelaySocket
- Demo environment with trusted network
- **NOT acceptable for production deployment**

**Production Path Forward:**
1. Install `@noble/ciphers` or `react-native-quick-crypto`
2. Replace `setup-crypto.js` with real AES-GCM implementation
3. Test with actual DLS-140 hardware
4. Add key rotation testing

---

### Why Metro + Expo Instead of Plain React Native CLI?

**Decision:** Use Expo SDK 54 with custom development builds instead of bare React Native.

**Reasoning:**
- **Faster iteration:** Expo provides pre-compiled native modules (expo-av, expo-file-system, etc.)
- **OTA updates:** Expo supports over-the-air JS bundle updates (not used yet but available)
- **Hermes enabled:** Expo enables Hermes by default (faster startup, smaller bundle)

**Tradeoff:**  
- Cannot use libraries with native code that don't support Expo (e.g., some Bluetooth libraries)
- Must create custom development builds instead of using Expo Go for advanced features
- Slightly larger APK size (~5MB overhead)

For SkyTalk, the benefits outweigh the tradeoffs because we're not using exotic native modules.

---

## Developer Notes

### Metro Bundler Cache Issues

If you encounter stale imports or weird bundling errors:

```bash
# Clear Metro cache
pnpm start --clear

# Or manually
rm -rf packages/mobile/.expo
rm -rf packages/mobile/node_modules/.cache
rm -rf $TMPDIR/react-*
rm -rf $TMPDIR/metro-*

# Nuclear option (clean reinstall)
pnpm clean
pnpm install
```

### Debugging Native Modules

```bash
# View Android logs
adb logcat | grep ReactNative
adb logcat | grep expo

# View specific tag
adb logcat -s "ExpoModulesCore"

# View Hermes errors
adb logcat | grep Hermes
```

### Checking APK Size

```bash
ls -lh packages/mobile/android/app/build/outputs/apk/debug/app-debug.apk

# Analyze APK contents
unzip -l packages/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

### Profiling Metro Bundler Performance

```bash
# Enable Metro profiling
export PROFILE=1
pnpm start

# View bundle size breakdown
npx react-native-bundle-visualizer
```

### Testing Without Emulator (Web Mode)

```bash
cd packages/mobile
pnpm dev:mobile

# Opens in browser with react-native-web
# Good for UI testing, but no native modules
```

---

## Related Documentation

- **[BACKEND_INTEGRATION.md](./BACKEND_INTEGRATION.md)** — **CRITICAL for production:** Relay server deployment, authentication, WebSocket endpoints, key rotation. Read this before switching from MVP mode.
- [MASTER_GUIDE_v4.md](./MASTER_GUIDE_v4.md) — Overall architecture and design decisions
- [architecture.md](./architecture.md) — System architecture diagram
- [tradeoffs.md](./tradeoffs.md) — Design tradeoffs and alternatives considered (includes mobile-specific decisions)

---

## FAQ

**Q: Why do I see warnings about `shamefully-hoist` in npm output?**  
A: This is expected. The `shamefully-hoist=true` setting in `.npmrc` is a pnpm-specific config. npm doesn't recognize it and warns about it. The setting only affects pnpm, so the warning is harmless.

**Q: Can I use Expo Go instead of building a custom development APK?**  
A: No. SkyTalk uses native modules (`expo-av`, `react-native-get-random-values`) and custom native configuration that Expo Go doesn't support. You must use `expo run:android` to build a development client.

**Q: Why does the first build take 5+ minutes?**  
A: Gradle downloads dependencies, compiles native libraries (including OpenSSL for crypto), and builds the APK. Subsequent builds are ~30 seconds because Gradle caches most artifacts.

**Q: How do I switch between mock mode and real backend?**  
A: Edit `packages/mobile/.env.local` and change `EXPO_PUBLIC_MOCK_MODE=true/false`. Then restart Metro (`metro bundler restart` or `r` in the Metro terminal).

**Q: Can I run this on iOS?**  
A: Yes, but it's not tested. Run `pnpm ios` from `packages/mobile`. You'll need Xcode and CocoaPods. The crypto polyfill should work on iOS as well since it's pure JavaScript.

**Q: When should I switch from MVP mode to production backend?**  
A: Switch to production when:
1. You have a deployed relay server (see [BACKEND_INTEGRATION.md](./BACKEND_INTEGRATION.md))
2. You've implemented real AES-GCM encryption (replaced the pass-through polyfill)
3. You need multi-device testing over real network infrastructure
4. You're ready to test with actual DLS-140 satellite hardware

Do NOT use MVP mode (MockRelaySocket + pass-through crypto) for any deployment involving real user data or satellite transmission. See [Moving from MVP to Production Backend](#moving-from-mvp-to-production-backend) for migration steps.

---

**End of Document**
