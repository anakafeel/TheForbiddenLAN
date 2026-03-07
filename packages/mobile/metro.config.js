const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch folders for hot-reload and module resolution.
//    Include workspace node_modules for pnpm virtual store (.pnpm/) where expo
//    packages resolve to when following symlinks. The aggressive ignore pattern
//    below prevents FallbackWatcher from opening file descriptors for unnecessary
//    directories.
config.watchFolders = [
  path.resolve(workspaceRoot, "packages/comms"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Explicitly disable Watchman. This monorepo triggers Watchman's inotify-poison
// error when it tries to crawl the workspace root. FallbackWatcher (Node.js
// native fs.watch) is lighter and respects the ignore regex below BEFORE opening
// any file descriptors — so only the necessary src directories get watched.
//
// In Metro 0.83 the flag lives under resolver, NOT watcher.watchman.
// metro-file-map reads config.resolver.useWatchman to decide between
// WatchmanWatcher and NodeWatcher (see createFileMap.js:114).
config.resolver.useWatchman = false;

// Enable symlink following so Metro can properly watch files that resolve through
// pnpm's virtual store symlinks. Without this, Metro can't compute SHA-1 for files
// in .pnpm/ directories.
config.resolver.unstable_enableSymlinks = true;

// NOTE: the initial file crawl that builds Metro's module-resolution map is a
// separate code path and still runs, so module resolution is unaffected.
config.watcher = {
  ...(config.watcher ?? {}),
  watcherOptions: {
    ...(config.watcher?.watcherOptions ?? {}),
    // Only watch source files in node_modules/.pnpm/expo*/node_modules/expo*/src/
    // and packages/comms/src/. Ignore everything else to avoid inotify exhaustion.
    ignore: (filename) => {
      // Always ignore common build/cache directories
      if (
        /(\.gradle|[/\\]android[/\\]app[/\\]build[/\\]|\.expo[/\\]|[/\\]dist[/\\]|[/\\]build[/\\]|[/\\]\.cache[/\\])/.test(
          filename,
        )
      ) {
        return true;
      }

      // In node_modules, only watch .pnpm/expo-*/node_modules/expo-*/
      // Ignore all other node_modules content
      if (filename.includes("node_modules")) {
        const inPnpmExpo =
          filename.includes(".pnpm") &&
          /\/expo[^/]*\/node_modules\/expo[^/]*\//.test(filename);
        return !inPnpmExpo;
      }

      // Watch everything else (packages/comms/src/, etc.)
      return false;
    },
  },
};

// 2. Add node_modules paths for Metro to resolve from (searching is different from watching)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Respect "exports" field in package.json for packages that use export maps.
config.resolver.unstable_enablePackageExports = true;

// 3. Global module interceptor.
//
// WHY resolveRequest instead of extraNodeModules:
// extraNodeModules only applies to requires FROM the mobile package itself.
// When @forbiddenlan/comms (inside packages/comms/dist/) requires 'ws',
// Metro resolves relative to that package and ignores extraNodeModules entirely.
// resolveRequest is a global hook that intercepts ALL requires from anywhere.
//
// We shim/redirect:
//   - @forbiddenlan/comms → packages/comms/src/index.ts (source; no pre-build required)
//   - 'ws' and all 'ws/*' subpaths → our native WebSocket wrapper
//   - Node built-ins (stream, net, tls, crypto) → empty module
//   - react-native-vector-icons → no-op icon component
//
// IMPORTANT: We do NOT shim 'events', 'buffer', 'util', 'url' — React Native
// has its own polyfills for these and replacing them breaks the TurboModule
// registry (causes PlatformConstants crash).

const shimDir = path.resolve(projectRoot, "src/shims");
const commsRoot = path.resolve(workspaceRoot, "packages/comms");

const NODE_BUILTIN_SHIMS = new Set([
  "stream",
  "net",
  "tls",
  "http",
  "https",
  "zlib",
  "fs",
  "os",
  "child_process",
  "worker_threads",
]);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // ─── Web-only packages: stub on native ──────────────────────────────────────
  // cobe (WebGL globe) and motion/react (Framer Motion web) are imported by
  // SatelliteGlobe.tsx which is only rendered on web. Even though AdminMap.tsx
  // guards the require() with `if (Platform.OS === 'web')`, Metro resolves ALL
  // require() calls at bundle time. The .native.tsx stub (SatelliteGlobe.native.tsx)
  // handles the file-level redirect; these stubs catch any direct import of the
  // underlying libraries on native as a second line of defence.
  if (
    platform !== "web" &&
    (moduleName === "cobe" ||
      moduleName === "motion" ||
      moduleName.startsWith("motion/"))
  ) {
    return { type: "sourceFile", filePath: path.resolve(shimDir, "empty.js") };
  }

  // ─── lucide-react → lucide-react-native ──────────────────────────────────────
  // lucide-react is the DOM/SVG web package — it renders nothing on native.
  // Redirect to lucide-react-native (uses react-native-svg) on all platforms
  // so icons render identically on Android, iOS, and web.
  if (moduleName === "lucide-react") {
    return context.resolveRequest(context, "lucide-react-native", platform);
  }

  // ─── pnpm monorepo: expo/AppEntry fix ────────────────────────────────────────
  // When the native Android binary requests the virtual entry bundle, Metro
  // resolves it from the pnpm virtual store:
  //   node_modules/.pnpm/expo@54.../node_modules/expo/AppEntry.js
  // That file contains a hardcoded relative import `../../App` which traverses
  // UP into the pnpm hash folder root — not our project root.
  //
  // Solutions:
  //   1. Intercept "expo/AppEntry" and serve our local index.js directly.
  //   2. When AppEntry.js tries to resolve "../../App", redirect it to App.jsx.
  // ─────────────────────────────────────────────────────────────────────────────
  // Catch both the bare "expo/AppEntry" and the full pnpm store path variant
  // (e.g. "./node_modules/.pnpm/expo@54.0.33_.../node_modules/expo/AppEntry")
  // that Expo bakes into the virtual-metro-entry when the pnpm hash changes.
  if (moduleName === "expo/AppEntry" || moduleName.includes("/expo/AppEntry")) {
    return {
      type: "sourceFile",
      filePath: path.resolve(projectRoot, "index.js"),
    };
  }

  // This handles the "../../App" import INSIDE AppEntry.js when Metro somehow
  // bypasses the intercept above (e.g., when originModulePath is inside .pnpm).
  if (
    moduleName === "../../App" &&
    context.originModulePath.includes("node_modules") &&
    context.originModulePath.includes("/expo/AppEntry")
  ) {
    return {
      type: "sourceFile",
      filePath: path.resolve(projectRoot, "src/App.jsx"),
    };
  }

  // Redirect @forbiddenlan/comms to TypeScript source so no pre-built dist is required.
  // babel-preset-expo transforms the .ts files at bundle time via Metro's Babel transformer.
  // ws and Node built-ins imported by comms/src are caught by the shims below.
  if (moduleName === "@forbiddenlan/comms") {
    return {
      type: "sourceFile",
      filePath: path.resolve(commsRoot, "src/index.ts"),
    };
  }

  // Shim the entire 'ws' package and all its subpaths (ws/lib/sender.js etc.)
  if (moduleName === "ws" || moduleName.startsWith("ws/")) {
    return { type: "sourceFile", filePath: path.resolve(shimDir, "ws.js") };
  }

  // Shim crypto with Web Crypto API polyfill (react-native-quick-crypto)
  if (moduleName === "crypto") {
    return { type: "sourceFile", filePath: path.resolve(shimDir, "crypto.js") };
  }

  // Shim Node.js built-ins that don't exist in React Native
  if (NODE_BUILTIN_SHIMS.has(moduleName)) {
    return { type: "sourceFile", filePath: path.resolve(shimDir, "empty.js") };
  }

  // Shim react-native-vector-icons (requires native linking, not in Expo Go)
  if (moduleName.startsWith("react-native-vector-icons/")) {
    return {
      type: "sourceFile",
      filePath: path.resolve(shimDir, "icon-shim.js"),
    };
  }

  // Let Metro handle everything else with symlink support enabled
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
