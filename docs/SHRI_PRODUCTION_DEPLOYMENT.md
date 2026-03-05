# Production Deployment Guide for Shri

**Date:** 2026-03-05  
**Purpose:** Deploy UDP audio fixes to production server

---

## What Changed

The following files were modified to fix UDP audio:

| File | Change |
|------|--------|
| `packages/server/src/ws/hub.ts` | Improved deviceId bridging, better logging |
| `packages/comms/src/AudioPipeline.ts` | Added `sender` field to PTT_AUDIO |
| `packages/comms/src/ForbiddenLANComms.ts` | Pass `deviceId` to AudioPipeline |

---

## Deployment Options

### Option 1: Shri Deploys (Recommended)

Shri has direct access to the production server. Here's what he needs to do:

```bash
# 1. SSH into production server
ssh root@134.122.32.45

# 2. Navigate to the project directory
cd /path/to/TheForbiddenLAN  # or wherever the repo is cloned

# 3. Pull latest changes
git pull origin main  # or whatever branch has the UDP fixes

# 4. Install dependencies (if needed)
npm install  # or pnpm install

# 5. Restart the server
# Option A: If running via Node directly:
pkill -f "tsx src/index"  # kill existing process
JWT_SECRET=your-secret \
DATABASE_URL=postgresql://user:pass@localhost:5432/skytalk \
PORT=3000 \
npx tsx src/index.ts &

# Option B: If running via Docker:
docker compose down
docker compose up -d --build

# 6. Verify server is running
curl http://134.122.32.45:3000/health  # if you have a health endpoint
```

### Option 2: You Deploy (If Shri Gives You Access)

If Shri gives you SSH access:

```bash
# 1. SSH into production server
ssh root@134.122.32.45

# 2. Navigate to project directory
cd /path/to/TheForbiddenLAN

# 3. Pull and restart (same as above)
```

---

## Server Logs to Verify

After deployment, you should see these logs when clients connect:

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

## If Deployment Issues

### Server won't start
- Check Postgres is running: `docker ps` or `pg_isready`
- Check environment variables are set correctly
- Check port 3000 is not in use: `lsof -i :3000`

### UDP still not working after deploy
- Check server logs for `[hub] UDP server listening`
- Check client logs for `[UdpSocket] ✅ Connected`
- Verify production server has UDP port 3000 open in firewall

### Firewall check (if needed)
```bash
# On the server, open UDP port 3000
sudo firewall-cmd --add-port=3000/udp --permanent
sudo firewall-cmd --reload
```

---

## Client Build

After server is deployed, rebuild the mobile app to connect to production:

```bash
cd packages/mobile

# Clear Metro cache
npx expo start --clear

# Build and install
npx expo run:android --device
```

The app is now configured to connect to:
- WebSocket: `ws://134.122.32.45:3000/ws`
- API: `http://134.122.32.45:3000`

---

## Rollback (If Needed)

If UDP audio breaks on production:

1. **Quick fix:** Revert env to use local server while you investigate:
   - Edit `.env` to point to `192.168.2.133:3000`

2. **Full rollback:** Revert the code changes:
   ```bash
   git revert <commit-hash>
   git push origin main
   # Then restart server
   ```

---

## Questions?

If Shri has questions about the deployment, have him:
1. Check server logs first
2. Verify Postgres is running
3. Check firewall rules for UDP port 3000
