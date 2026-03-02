const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [workspaceRoot];

// 2. Add node_modules paths for Metro to search
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Follow PNPM workspace symlinks (workspace:* deps are symlinked, not copied).
config.resolver.unstable_enableSymlinks = true;

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
  "crypto",
  "http",
  "https",
  "zlib",
  "fs",
  "os",
  "child_process",
  "worker_threads",
]);

config.resolver.resolveRequest = (context, moduleName, platform) => {
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

  // Shim Node.js built-ins that don't exist in React Native
  if (NODE_BUILTIN_SHIMS.has(moduleName)) {
    return { type: "sourceFile", filePath: path.resolve(shimDir, "empty.js") };
  }

  // Shim react-native-vector-icons (requires native linking, not in Expo Go)
  if (moduleName.startsWith("react-native-vector-icons/")) {
    return { type: "sourceFile", filePath: path.resolve(shimDir, "icon-shim.js") };
  }

  // Let Metro handle everything else normally
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
