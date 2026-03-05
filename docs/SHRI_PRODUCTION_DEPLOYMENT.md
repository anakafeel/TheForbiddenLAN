# Production Deployment Guide for Shri

**Date:** 2026-03-05  
**Purpose:** Deploy UDP audio fixes to production server  
**Status:** ⚠️ **ACTION REQUIRED**

---

## What Changed (Exactly What You Need to Deploy)

These are the **exact commits** Shri needs to pull:

### Commit 1: Core UDP Audio Fixes
```
git log --oneline | grep -i "sender\|bridg"  # Look for commits about sender field and bridging
```

**Files changed:**
- `packages/server/src/ws/hub.ts` — Improved deviceId/userId bridging, better logging
- `packages/comms/src/AudioPipeline.ts` — Added `sender` field to PTT_AUDIO messages
- `packages/comms/src/ForbiddenLANComms.ts` — Pass `deviceId` to AudioPipeline constructor

### Commit 2: Decoder Race Condition Fix
**Files changed:**
- `packages/mobile/src/utils/comms.js` — Added promise guard for decoder init
- `packages/mobile/src/utils/opusDecoder.js` — Added promise guard for decoder init

---

## Quick Deploy Commands for Shri

```bash
# 1. SSH into production server
ssh root@134.122.32.45

# 2. Navigate to the project directory
cd /path/to/TheForbiddenLAN

# 3. Pull latest code (get the commits above)
git pull origin main

# 4. Check what changed
git log --oneline -5

# 5. Install dependencies (only if package.json changed)
pnpm install

# 6. Restart the server
# Find and kill existing process
pkill -f "tsx src/index"

# Start fresh
JWT_SECRET=your-production-secret \
DATABASE_URL=postgresql://skytalk:skytalk123@localhost:5432/skytalk \
PORT=3000 \
npx tsx src/index.ts &

# 7. Verify it's running
curl http://134.122.32.45:3000/health
```

---

## How to Verify It's Working

When clients connect, you should see:
```
[hub] UDP server listening on 0.0.0.0:3000
[hub] UDP_REGISTER: userId=dev-xxxx from 192.168.x.x:port
[hub] Bridged UDP endpoint: dev-xxxx → JWT userId xxx
```

When PTT is pressed:
```
[hub] UDP PTT_AUDIO received: session=0x... sender=dev-xxxx
[hub] UDP relay #1: chunk=0 → dev-yyyy
[hub] PTT_AUDIO relay: chunk=0 → UDP:1 WS:1
```

---

## If Something Goes Wrong

### Server won't start
```bash
# Check Postgres
docker ps | grep postgres

# Check port 3000
lsof -i :3000

# Check logs
tail -f /var/log/syslog
```

### UDP still not working
1. Check server logs for `[hub] UDP server listening`
2. Make sure firewall allows UDP port 3000:
   ```bash
   sudo firewall-cmd --add-port=3000/udp --permanent
   sudo firewall-cmd --reload
   ```

### Rollback (if needed)
```bash
git revert HEAD
git push origin main
# Restart server
```

---

## After You Deploy

Tell the team:
1. "Production server updated with UDP audio fixes"
2. They can now switch their mobile apps back to production

Then they change their `.env` files to:
```
EXPO_PUBLIC_WS_URL=ws://134.122.32.45:3000/ws
EXPO_PUBLIC_API_URL=http://134.122.32.45:3000
```

And rebuild:
```bash
cd packages/mobile
npx expo run:android --device
```

---

## Questions?

Check `docs/UDP-AUDIO-MIGRATION-FIX.md` for full details on what was changed and why.
