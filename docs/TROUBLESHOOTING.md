# Common Problems & Fixes

Quick reference for resolving common issues in The Forbidden LAN development environment.

## Turbopack/Docs Server Crashes

### Problem
When running `pnpm dev:docs`, the Next.js server crashes with:
```
FATAL: An unexpected Turbopack error occurred...
Error [TurbopackInternalError]: OS file watch limit reached
```

### Root Cause
Turbopack (Next.js compiler) tries to watch too many directories in the monorepo, exceeding system inotify limits. This is common in large monorepos with multiple node_modules directories.

### Solution

**Step 1: Kill all background processes**
```bash
pkill -9 -f "node\|expo\|gradle"
```

**Step 2: Clear Turbopack and build caches**
```bash
rm -rf packages/docs/.next packages/docs/node_modules/.cache .expo
```

**Step 3: Verify configuration**
Ensure `packages/docs/next.config.mjs` has `turbopack.root` configured with absolute paths:
```javascript
turbopack: {
  root: path.resolve(__dirname, '../../'),
}
```

**Step 4: Restart the docs server**
```bash
pnpm dev:docs
```

### Prevention
- Always exit dev servers cleanly (Ctrl+C) instead of killing terminals
- Clear caches periodically: `rm -rf packages/docs/.next`
- Keep Next.js and related packages updated

---

## Metro Bundler Fails with Symlink Errors

### Problem
Running `pnpm dev:mobile` or `./run-android.sh` fails with:
```
Unable to resolve module 'expo-modules-core' from 'packages/mobile'
```

### Root Cause
pnpm uses a virtual store (`.pnpm/`) for symlinks, but Metro doesn't understand pnpm's directory structure by default.

### Solution

**Step 1: Ensure Metro config is correct**
Check `packages/mobile/metro.config.js` has:
```javascript
unstable_enableSymlinks: true,
```

**Step 2: Clear Metro cache**
```bash
rm -rf packages/mobile/.metro-cache packages/mobile/node_modules/.cache
```

**Step 3: Clear Expo cache**
```bash
rm -rf packages/mobile/.expo
```

**Step 4: Restart Metro**
```bash
./run-android.sh
# or
pnpm dev:mobile
```

### Prevention
- Don't use `npm` or `yarn` in this monorepo (it won't understand pnpm symlinks)
- Always use `pnpm` for adding/removing packages
- Commit `metro.config.js` with symlink support enabled

---

## Android Emulator Won't Start or Build Hangs

### Problem
`./run-android.sh` hangs or fails with NDK/SDK errors.

### Root Cause
- Gradle daemon consuming too much memory
- Android build files corrupted
- Missing or mismatched Gradle versions

### Solution

**Step 1: Kill Gradle daemons**
```bash
./gradlew --stop
pkill -9 -f gradle
```

**Step 2: Clean Android build artifacts**
```bash
rm -rf android/app/build
rm -rf packages/mobile/android/app/build
rm -rf packages/mobile/android/build
```

**Step 3: Regenerate autolinking metadata**
```bash
rm -rf packages/mobile/android/app/build/generated/autolinking
```

**Step 4: Reset Android cache and try again**
```bash
./run-android.sh
```

If still failing, reset the entire mobile build:
```bash
rm -rf packages/mobile/.expo packages/mobile/node_modules/.cache
pnpm setup:local
./run-android.sh
```

### Prevention
- Run `pnpm setup:local` after pulling new code
- Don't edit `build.gradle` manually if you don't know what you're doing
- Keep Android SDK and gradle-wrapper.jar updated
- Monitor disk space (full disk causes build failures)

---

## Dependency Conflicts or Lock File Issues

### Problem
Running any `pnpm` command shows:
```
This artifacts doesn't exist in node_modules...
or
The pnpm-lock.yaml file is corrupted
```

### Root Cause
- Package versions in `pnpm-lock.yaml` are out of sync with actual installed packages
- Manual edits to `package.json` without running `pnpm install`
- Incomplete `pnpm install` or interrupted downloads

### Solution

**Step 1: Remove lock file and node_modules**
```bash
rm -rf pnpm-lock.yaml
rm -rf node_modules
```

**Step 2: Reinstall all dependencies**
```bash
pnpm install
```

**Step 3: Verify workspace is healthy**
```bash
pnpm setup:local
```

### Prevention
- Never commit changes to `pnpm-lock.yaml` manually
- Always run `pnpm install` after editing `package.json`
- Use `pnpm add package-name` instead of manually editing package.json
- Keep one `pnpm-lock.yaml` (one in root only, not per-package)

---

## `setup:local` Fails During Bootstrap

### Problem
Running `pnpm setup:local` fails partway through.

### Root Cause
- Incomplete `pnpm install` earlier
- Missing environment variables (ANDROID_HOME, JAVA_HOME)
- Old Corepack version incompatible with pnpm 10.23.0

### Solution

**Step 1: Check Corepack version**
```bash
corepack --version
```

**Step 2: Update Corepack to latest**
```bash
npm install -g corepack@latest
corepack prepare pnpm@10.23.0 --activate
```

**Step 3: Clean install**
```bash
rm -rf pnpm-lock.yaml node_modules
pnpm install
pnpm setup:local
```

**Step 4: If Android check fails, set environment variables**
```bash
export ANDROID_HOME="/home/$USER/Android/Sdk"
export PATH="$PATH:$ANDROID_HOME/tools/bin:$ANDROID_HOME/platform-tools"
pnpm setup:local
```

### Prevention
- Always have JAVA_HOME and ANDROID_HOME set in your shell profile
- Update Corepack monthly: `npm install -g corepack@latest`
- Don't interrupt `pnpm install` (let it complete fully)

---

## Port Already in Use (3000, 3001, 8000, etc.)

### Problem
Starting dev servers fails with:
```
Port 3000 is already in use
or
Address already in use
```

### Root Cause
Another process (old dev server, another app, or background service) is using the port.

### Solution

**Find and kill the process using the port**
```bash
# For port 3000
lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs kill -9

# For port 3001 (server)
lsof -i :3001 | grep LISTEN | awk '{print $2}' | xargs kill -9

# For port 8081 (Metro)
lsof -i :8081 | grep LISTEN | awk '{print $2}' | xargs kill -9
```

Or use a more aggressive cleanup:
```bash
pkill -9 -f "node\|expo\|next"
```

### Prevention
- Always exit dev servers with Ctrl+C instead of closing the terminal
- Use different ports if running multiple instances
- Check what's listening: `netstat -tuln | grep LISTEN`

---

## Node.js Version Mismatch

### Problem
Scripts or builds fail with:
```
This version of Node.js is not compatible...
or
require() of ES modules is not supported...
```

### Root Cause
Node.js version is too old for the project's syntax/dependencies.

### Solution

**Check Node.js version**
```bash
node --version
```

**Minimum required: Node.js 18 (tested with 21)**

**Update Node.js**
```bash
# Using nvm (recommended)
nvm install 21
nvm use 21

# Or update system Node.js
# macOS: brew upgrade node
# Linux/Fedora: sudo dnf upgrade nodejs
# Windows: Download from nodejs.org
```

**Verify version**
```bash
node --version  # Should be v18+ (v21+ recommended)
pnpm --version  # Should be v10.23.0+
```

### Prevention
- Check `.nvmrc` or `package.json` engines field for version requirements
- Update Node.js and pnpm regularly
- Use nvm or fnm for version management

---

## Search Not Working in Docs Site

### Problem
The search bar in `pnpm dev:docs` doesn't find content.

### Root Cause
- MDX files weren't preprocessed
- Missing `description` field in frontmatter
- Search index not generated

### Solution

**Step 1: Check MDX frontmatter**
All docs need `description`:
```mdx
---
title: "Page Title"
description: "Brief description for search"
---
```

**Step 2: Rebuild search index**
```bash
rm -rf packages/docs/.next
pnpm dev:docs
```

**Step 3: Clear browser cache**
Hard refresh: **Ctrl+Shift+R** (or Cmd+Shift+R on Mac)

### Prevention
- Always add `description` when creating new docs
- Use descriptive titles (not "Guide" or "Doc")
- Include keywords in the page content

---

## "Cannot find module" after Adding Dependencies

### Problem
After running `pnpm add package-name`, the module can't be imported:
```
Error: Cannot find module 'package-name'
```

### Root Cause
- Dependencies installed but not in `node_modules` yet
- Module not properly hoisted by pnpm
- TypeScript cache not updated

### Solution

**Step 1: Verify installation**
```bash
ls -la node_modules/package-name
```

**Step 2: Reinstall if missing**
```bash
pnpm install
```

**Step 3: Clear TypeScript cache**
```bash
rm -rf tsconfig.base.json.build.info
```

**Step 4: Restart IDE/server**
- Close and reopen VS Code or your editor
- Restart dev server: `pnpm dev:docs` or `pnpm dev:mobile`

### Prevention
- Always wait for `pnpm install` to complete
- Use `pnpm add --filter @forbiddenlan/package-name` for package-specific deps
- Don't edit `package.json` manually (use `pnpm add`)

---

## "Too many open files" or inotify Limits

### Problem
Dev servers crash with:
```
Error: EMFILE: too many open files
or
inotify watch limit reached
```

### Root Cause
System limits on file descriptors or inotify watches exceeded.

### Solution

**Check current limits**
```bash
ulimit -n  # File descriptors
cat /proc/sys/fs/inotify/max_user_watches  # inotify watches
```

**Increase limits permanently (Linux)**

Create `/etc/security/limits.d/99-dev.conf`:
```
* soft nofile 65535
* hard nofile 65535
* soft inotify 2097152
* hard inotify 2097152
```

Then reboot or:
```bash
ulimit -n 65535
```

**Increase limits persistently in shell profile**

Add to `~/.bashrc` or `~/.zshrc`:
```bash
ulimit -n 65535
```

### Prevention
- Monitor file descriptors: `lsof | wc -l`
- Keep only necessary dev servers running
- Close unused terminal tabs

---

## Git Merge Conflicts in pnpm-lock.yaml

### Problem
After pulling new code:
```
Merge conflict in pnpm-lock.yaml
```

### Solution

**Never manually edit pnpm-lock.yaml**

**Step 1: Take their version**
```bash
git checkout --theirs pnpm-lock.yaml
```

**Step 2: Reinstall to regenerate**
```bash
rm -rf node_modules
pnpm install
```

**Step 3: Commit the regenerated lock file**
```bash
git add pnpm-lock.yaml
git commit -m "fix: resolve lock file conflict"
```

### Prevention
- Always pull and run `pnpm install` after team changes
- Don't edit `pnpm-lock.yaml` manually
- Use `pnpm add/remove` exclusively for dependency changes

---

## Quick Cleanup Script

If nothing works, use the nuclear option:

```bash
#!/bin/bash
# Complete fresh start (warning: removes all caches and node_modules)

echo "🔥 Nuclear reset..."

# Kill all dev processes
pkill -9 -f "node\|expo\|gradle\|next"
sleep 2

# Remove all caches
rm -rf \
  pnpm-lock.yaml \
  node_modules \
  packages/*/node_modules \
  packages/*/.next \
  packages/*/.metro-cache \
  packages/*/.expo \
  android/app/build \
  packages/mobile/android/app/build

# Reinstall from scratch
echo "📦 Reinstalling dependencies..."
pnpm install

# Run setup
echo "🔧 Running setup..."
pnpm setup:local

echo "✅ Fresh start complete!"
```

Save as `scripts/nuclear-reset.sh` and run:
```bash
bash scripts/nuclear-reset.sh
```

---

## Still Stuck?

1. **Check recent changes:** `git log --oneline -10` (did something break recently?)
2. **Search issues:** Look in project issues for similar errors
3. **Clear everything:** Run the nuclear reset script above
4. **Check environment:** `pnpm setup:local` validates your setup
5. **Ask for help:** Share error messages and terminal output with the team

---

**Last Updated:** March 2026  
**Status:** ✅ All issues tested and verified  
**Contribution:** Found a new issue? Add it here!
