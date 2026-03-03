# The Forbidden LAN - Documentation Index

Welcome to The Forbidden LAN project documentation! This index helps you find what you need quickly.

## 🚀 Getting Started (First Time?)

**Start here if you're new to the project:**

1. **[LOCAL_DEV_BOOTSTRAP.md](LOCAL_DEV_BOOTSTRAP.md)** — One-command local setup
   - `pnpm setup:local` gets everything running
   - ~2 minute complete environment setup
   - For all operating systems (macOS, Linux, Windows)

2. **[MOBILE_SETUP_TROUBLESHOOTING.md](MOBILE_SETUP_TROUBLESHOOTING.md)** — Fix mobile app issues
   - Metro bundler problems
   - Crypto/Web API polyfills
   - Android emulator setup
   - Common error solutions

3. **[UI_DEVELOPMENT_GUIDE.md](UI_DEVELOPMENT_GUIDE.md)** — React Native patterns
   - Component structure
   - Navigation with React Navigation
   - State management with Redux
   - File organization

## 📚 Working with Documentation (You)

**Read these if you're creating or updating docs:**

1. **[FUMADOCS_SETUP_GUIDE.md](FUMADOCS_SETUP_GUIDE.md)** — Complete Fumadocs system
   - How to start the docs site locally (`pnpm dev:docs`)
   - Adding new documentation pages
   - MDX features (tabs, callouts, code blocks)
   - Search functionality
   - Production build & deployment

2. **[DOCUMENTATION_WORKFLOW.md](DOCUMENTATION_WORKFLOW.md)** — Day-to-day docs workflow
   - Writing new guides
   - Migrating existing documentation
   - Review & publishing process
   - Style guide & best practices
   - Maintenance workflow

3. **[DEPENDENCY_MANAGEMENT.md](DEPENDENCY_MANAGEMENT.md)** — Managing packages
   - Adding dependencies with `pnpm add`
   - Corepack pinning for consistency
   - Making updates to the monorepo
   - Adding packages to the docs site

## 🛠️ Architecture & Design

**Understanding the system:**

- **[architecture.md](architecture.md)** — High-level system design
- **[architecture-audit.md](architecture-audit.md)** — Recent architecture decisions
- **[BACKEND_INTEGRATION.md](BACKEND_INTEGRATION.md)** — Server integration points
- **[api-contracts.md](api-contracts.md)** — API specifications

## 🔧 Infrastructure & Deployment

**Running and deploying the system:**

- **[MASTER_GUIDE_v4.md](MASTER_GUIDE_v4.md)** — Comprehensive deployment guide
- **[MASTER_GUIDE_v3.md](MASTER_GUIDE_v3.md)** — (Legacy) previous version
- **[expo-migration.md](expo-migration.md)** — Expo & React Native setup
- **[expo-monorepo-audit.md](expo-monorepo-audit.md)** — Monorepo evaluation

## 📖 Quick Reference

### Common Commands

```bash
# Local Development
pnpm setup:local              # Complete environment setup
pnpm dev:mobile              # Start mobile app (Expo)
pnpm dev:server              # Start backend server
pnpm dev:docs                # Start documentation site (localhost:3000)

# Running All Services
pnpm dev                      # Run all packages in parallel

# Building
pnpm build                    # Build all packages
pnpm build --filter=@forbiddenlan/mobile  # Build specific package

# Testing
pnpm test                     # Run all tests
pnpm test --filter=@forbiddenlan/comms    # Test specific package

# Monorepo Structure
pnpm list                     # Show workspace structure
pnpm list --depth=0          # Show top-level packages

# Package Management
pnpm add package-name         # Add to root deps
pnpm add package-name --filter=@forbiddenlan/mobile  # Add to specific package
pnpm update                   # Update all packages
```

### Project Structure

```
TheForbiddenLAN/
├── docs/                          # 📄 This directory (main docs)
├── packages/
│   ├── comms/                    # 📡 Comms library (locking, encryption, relay)
│   ├── mobile/                   # 📱 Mobile app (React Native/Expo)
│   ├── server/                   # 🖥️ Backend server (Express/Prisma)
│   ├── portal/                   # 🌐 Web portal (Vite, React)
│   └── docs/                     # 📚 **NEW:** Fumadocs Next.js site
├── android/                      # 🤖 Android build outputs
├── scripts/                      # 🔨 Automation scripts
├── package.json                  # 📦 Monorepo root config
└── pnpm-workspace.yaml          # 🔗 Workspace definition
```

### Package Descriptions

| Package | Purpose | Technology | Status |
|---------|---------|-----------|--------|
| **@forbiddenlan/comms** | Satellite comms library (encryption, locking, relay) | TypeScript, Web Crypto | ✅ Core |
| **@forbiddenlan/mobile** | Mobile app for iOS/Android | React Native, Expo, Metro | ✅ Development |
| **@forbiddenlan/server** | REST API backend | Node.js, Express, Prisma, PostgreSQL | ✅ Development |
| **@forbiddenlan/portal** | Web dashboard | Vite, React, TypeScript | ✅ Development |
| **@forbiddenlan/docs** | Documentation site | Next.js, Fumadocs, MDX | ✅ NEW - Live |

## 🔍 Finding Specific Information

**By Topic:**

| Topic | Where to Look |
|-------|---|
| "How do I set up locally?" | [LOCAL_DEV_BOOTSTRAP.md](LOCAL_DEV_BOOTSTRAP.md) |
| "Something is broken, help!" | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) |
| "My Metro bundler is failing" | [MOBILE_SETUP_TROUBLESHOOTING.md](MOBILE_SETUP_TROUBLESHOOTING.md) |
| "How do I build React Native UI?" | [UI_DEVELOPMENT_GUIDE.md](UI_DEVELOPMENT_GUIDE.md) |
| "How does the system work?" | [architecture.md](architecture.md) |
| "What's the API spec?" | [api-contracts.md](api-contracts.md) |
| "How do I deploy?" | [MASTER_GUIDE_v4.md](MASTER_GUIDE_v4.md) |
| "How do I add a new dependency?" | [DEPENDENCY_MANAGEMENT.md](DEPENDENCY_MANAGEMENT.md) |
| "How do I write documentation?" | [FUMADOCS_SETUP_GUIDE.md](FUMADOCS_SETUP_GUIDE.md) |
| "How do I publish documentation?" | [DOCUMENTATION_WORKFLOW.md](DOCUMENTATION_WORKFLOW.md) |

## 🌐 Documentation Platform (NEW!)

The project now uses **Fumadocs** for searchable, versioned documentation.

**Start the documentation site:**
```bash
pnpm dev:docs
```

Then visit: **http://localhost:3000**

This site includes:
- ✅ All project guides
- ✅ Full-text search
- ✅ Dark/light mode
- ✅ Mobile-responsive layout
- ✅ Syntax-highlighted code examples
- ✅ API reference

**Documentation is stored in:**
```
packages/docs/content/docs/
```

For details on adding/editing docs, see [FUMADOCS_SETUP_GUIDE.md](FUMADOCS_SETUP_GUIDE.md).

## 🤝 Contributing

### Get Help

- **Stuck on setup?** → Check [LOCAL_DEV_BOOTSTRAP.md](LOCAL_DEV_BOOTSTRAP.md)
- **Build errors?** → Check [MOBILE_SETUP_TROUBLESHOOTING.md](MOBILE_SETUP_TROUBLESHOOTING.md)
- **Need guidance?** → Check the relevant guide above

### Share Knowledge

1. Found a solution? Update [MOBILE_SETUP_TROUBLESHOOTING.md](MOBILE_SETUP_TROUBLESHOOTING.md)
2. Created a new feature? Write a guide and add to Fumadocs
3. Discovered an issue? Document it in troubleshooting section

### Update Documentation

```bash
# 1. Edit markdown files in this folder (docs/)
# 2. Or add to Fumadocs site (packages/docs/content/docs/)
# 3. Test with pnpm dev:docs
# 4. Commit and push
git add docs/
git commit -m "docs: add example guide"
git push
```

## 📊 Documentation Status

| Document | Status | Last Updated | Maintainer |
|----------|--------|--------------|-----------|
| LOCAL_DEV_BOOTSTRAP.md | ✅ Current | Jan 2025 | DevOps |
| TROUBLESHOOTING.md | ✅ Current | Mar 2026 | DevOps |
| MOBILE_SETUP_TROUBLESHOOTING.md | ✅ Current | Jan 2025 | Mobile Team |
| UI_DEVELOPMENT_GUIDE.md | ✅ Current | Jan 2025 | Mobile Team |
| FUMADOCS_SETUP_GUIDE.md | ✅ Current | Jan 2025 | DevOps |
| DOCUMENTATION_WORKFLOW.md | ✅ Current | Jan 2025 | DevOps |
| DEPENDENCY_MANAGEMENT.md | ✅ Current | Jan 2025 | DevOps |
| architecture.md | ⚠️ Needs Review | Dec 2024 | Architecture |
| BACKEND_INTEGRATION.md | ✅ Current | Jan 2025 | Backend |
| MASTER_GUIDE_v4.md | ✅ Current | Jan 2024 | DevOps |

## 📞 Support & Questions

**Common Questions:**

- **Q: How do I run just the mobile app?**
  A: `pnpm dev:mobile` or see [MOBILE_SETUP_TROUBLESHOOTING.md](MOBILE_SETUP_TROUBLESHOOTING.md)

- **Q: How do I add a new package?**
  A: See [DEPENDENCY_MANAGEMENT.md](DEPENDENCY_MANAGEMENT.md)

- **Q: Where do I write documentation?**
  A: See [FUMADOCS_SETUP_GUIDE.md](FUMADOCS_SETUP_GUIDE.md)

- **Q: How do I fix Metro bundler errors?**
  A: See [MOBILE_SETUP_TROUBLESHOOTING.md](MOBILE_SETUP_TROUBLESHOOTING.md) troubleshooting section

- **Q: What's the project architecture?**
  A: See [architecture.md](architecture.md)

## 🚀 Next Steps

1. **New to the project?**
   - Run `pnpm setup:local` to set up your environment
   - Read [architecture.md](architecture.md) to understand the system
   - Check out [UI_DEVELOPMENT_GUIDE.md](UI_DEVELOPMENT_GUIDE.md) if focusing on mobile

2. **Want to contribute docs?**
   - Start with [FUMADOCS_SETUP_GUIDE.md](FUMADOCS_SETUP_GUIDE.md)
   - Follow [DOCUMENTATION_WORKFLOW.md](DOCUMENTATION_WORKFLOW.md)
   - Write in Markdown/MDX and add to `packages/docs/content/docs/`

3. **Need to deploy?**
   - See [MASTER_GUIDE_v4.md](MASTER_GUIDE_v4.md)
   - Check [BACKEND_INTEGRATION.md](BACKEND_INTEGRATION.md) for API details

4. **Managing dependencies?**
   - Read [DEPENDENCY_MANAGEMENT.md](DEPENDENCY_MANAGEMENT.md)
   - Use `pnpm add` with `--filter` for package-specific deps

---

**Last Updated:** January 2025  
**Version:** 4.0 (Fumadocs Era)  
**Maintainers:** Development Team

*For issues or updates to this index, check [DOCUMENTATION_WORKFLOW.md](DOCUMENTATION_WORKFLOW.md).*
