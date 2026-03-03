# Fumadocs Documentation Platform Setup Guide

## Overview

The Forbidden LAN project uses **Fumadocs** as a modern, searchable documentation platform. It's a Next.js-based documentation site with full-text search, MDX support, and built-in UI components for guides, API documentation, and architecture diagrams.

**Key Info:**
- **Platform:** Fumadocs 14.2.9 + Next.js 16.1.6
- **Location:** `packages/docs/`
- **Start:** `pnpm dev:docs` (runs on http://localhost:3000)
- **Content:** `packages/docs/content/docs/` (MDX files)
- **Config:** `packages/docs/source.config.ts`

## Quick Start

### 1. Complete Local Setup

```bash
pnpm setup:local
```

This validates the Fumadocs package during initial bootstrap. If you already have dependencies installed, skip this.

### 2. Start the Documentation Site

```bash
pnpm dev:docs
```

Then visit: **http://localhost:3000**

You should see:
- ✅ Homepage with navigation
- ✅ Sidebar with all documentation sections
- ✅ Search bar at the top
- ✅ Dark/light mode toggle
- ✅ Mobile-responsive layout

## Project Structure

```
packages/docs/
├── app/                          # Next.js app directory
│   ├── layout.tsx               # Root layout with providers
│   ├── global.css               # Fumadocs theme & Tailwind
│   ├── docs/
│   │   ├── layout.tsx           # Docs sidebar layout
│   │   └── [[...slug]]/
│   │       └── page.tsx         # Dynamic MDX page renderer
│   └── api/
│       └── search/route.ts      # Full-text search API
├── content/
│   └── docs/
│       ├── index.mdx            # Homepage
│       ├── guides/              # How-to guides
│       ├── infra/               # Infrastructure docs
│       ├── reference/           # API reference
│       └── troubleshooting/     # Troubleshooting guides
├── lib/
│   ├── source.ts               # Fumadocs source loader
│   └── layout.shared.tsx        # Shared layout config
├── public/                       # Static assets (logos, images)
├── source.config.ts             # Fumadocs MDX configuration
├── next.config.mjs              # Next.js + Fumadocs plugin config
├── tailwind.config.ts           # Tailwind CSS with Fumadocs theme
├── tsconfig.json               # TypeScript configuration
└── package.json                # @forbiddenlan/docs dependencies
```

## Adding Documentation

### Create a New Document

1. **Create MDX file** in `packages/docs/content/docs/`:

```bash
# Example: Add a new guide
touch packages/docs/content/docs/guides/my-feature.mdx
```

2. **Add frontmatter (metadata)**:

```mdx
---
title: "My Feature Guide"
description: "Step-by-step guide for my feature"
icon: BookOpen  # or any icon from fumadocs-ui
---

## Introduction

Your content here...
```

3. **File will automatically appear** in the Fumadocs sidebar (organizing by folder structure)

### Folder Structure for Organization

- **`content/docs/index.mdx`** → Homepage
- **`content/docs/guides/`** → How-to guides (shows in sidebar)
- **`content/docs/infra/`** → Infrastructure & deployment docs
- **`content/docs/reference/`** → API reference & technical specs
- **`content/docs/troubleshooting/`** → Troubleshooting guides

The sidebar automatically builds from this structure.

## MDX Features

Fumadocs supports standard MDX with special components:

### Callouts (Info boxes)

```mdx
> [!NOTE]
> This is important information

> [!WARNING]
> Dangerous operation ahead

> [!TIP]
> Pro tip for power users
```

### Code Blocks

```mdx
```typescript
// Full syntax highlighting
const myFunction = () => "Hello Fumadocs";
```
```

### Tabs

```mdx
import { Tabs, Tab } from 'fumadocs-ui/components/tabs';

<Tabs items={["TypeScript", "JavaScript"]}>
  <Tab value="TypeScript">
    TypeScript code here
  </Tab>
  <Tab value="JavaScript">
    JavaScript code here
  </Tab>
</Tabs>
```

### Steps

```mdx
import { Steps } from 'fumadocs-ui/components/steps';

<Steps>
  <Step>
    First step
  </Step>
  <Step>
    Second step
  </Step>
</Steps>
```

## Configuration

### Navigation & Sidebar

Edit `packages/docs/lib/layout.shared.tsx` to customize:

```typescript
export const baseOptions: RootToggleType = {
  links: [
    {
      text: "Documentation",
      url: "/docs",
      active: "nested",
    },
  ],
};
```

The sidebar is **automatically generated** from `content/docs/` folder structure. Reorder by renaming folders with number prefixes:

```
content/docs/
├── 00-getting-started/
├── 01-guides/
├── 02-reference/
└── 03-troubleshooting/
```

### Search Configuration

Search is powered by Fumadocs built-in indexing. It scans all MDX files in `content/docs/` automatically.

To rebuild search index:

```bash
pnpm dev:docs
# Search re-indexes on hot reload
```

### Theme & Styling

Customize in `packages/docs/tailwind.config.ts`:

```typescript
export default {
  plugins: [
    require("@tailwindcss/typography"),
    require("fumadocs-ui/tailwind-plugin"),
  ],
};
```

Color scheme is defined in `app/global.css`:

```css
@import url("fumadocs-ui/style.css");
@import url("fumadocs-ui/tailwind-plugin");
```

## Building for Production

### Development Build

```bash
pnpm dev:docs
```

### Production Build

```bash
cd packages/docs
pnpm build
pnpm start  # Start production server
```

## Updating Fumadocs

All Fumadocs packages must stay in sync:

```bash
# Update all Fumadocs packages
pnpm update fumadocs-core fumadocs-mdx fumadocs-ui --filter @forbiddenlan/docs
```

**Always test after updates:**

```bash
pnpm setup:local
pnpm dev:docs  # Must run without errors
```

## Troubleshooting

### Site won't start (`pnpm dev:docs` fails)

If you get a Turbopack panic or inotify watch limit error, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md#turbopackdocs-server-crashes) for the complete fix.

### Search not working

```bash
# Rebuild MDX files
rm -rf packages/docs/.next
pnpm dev:docs
```

### Sidebar not showing content

- Check file paths in `packages/docs/content/docs/`
- Restart dev server: `pnpm dev:docs`
- Clear browser cache (Cmd+Shift+R / Ctrl+Shift+R)

### MDX syntax errors

Check `packages/docs/source.config.ts` for config issues:

```typescript
export const source = create({
  pageTree: createPresets([
    {
      pattern: "**/*.mdx",
      loader: loader(),
    },
  ]),
});
```

## Integrating with Existing Documentation

### Migrate existing .md files to Fumadocs

1. **Rename file** from `.md` to `.mdx`
2. **Add frontmatter**:

```mdx
---
title: "Original Document Title"
description: "Brief description for search"
---

[Rest of original markdown content...]
```

3. **Move to** `packages/docs/content/docs/[category]/`
4. **Test**: `pnpm dev:docs` and verify in sidebar

### Keep original docs/ folder

The original `docs/` folder is still available for:
- Raw markdown storage
- Legacy documentation references
- Backup copies

New content should go in `packages/docs/content/docs/`.

## API Reference

### Adding API Documentation

Create `content/docs/reference/api.mdx`:

```mdx
---
title: "API Reference"
description: "Complete API specification"
---

## Authentication

Every request requires an API key...

### GET /api/endpoint

**Parameters:**
- `id` (string): Resource ID

**Response:**
\`\`\`json
{ "success": true, "data": {} }
\`\`\`
```

Use `<Tabs>` component to show examples in multiple languages.

## Performance

- **Search:** Indexed at build time (instant)
- **Navigation:** SSG (Static Site Generation)
- **Images:** Optimized with Next.js Image component
- **Load time:** < 1 second on typical connection

## Security

- ✅ No external dependencies for core rendering
- ✅ No analytics by default (Fumadocs has optional analytics)
- ✅ All content is static HTML generated at build time
- ✅ Search happens client-side (no server queries)

## Next Steps

1. ✅ Complete setup with `pnpm setup:local`
2. ✅ Start site with `pnpm dev:docs`
3. 📝 Create new guides in `content/docs/guides/`
4. 🔍 Verify search works for all pages
5. 🚀 Build for production when ready

## Resources

- **Fumadocs Docs:** https://fumadocs.vercel.app
- **Next.js Docs:** https://nextjs.org/docs
- **MDX Guide:** https://mdxjs.com/
- **Tailwind CSS:** https://tailwindcss.com/docs

## Support

For issues with Fumadocs setup:

1. Check `pnpm --version` (should be 10.23.0+)
2. Verify Node.js version: `node --version` (16.x or later)
3. Clear cache: `rm -rf packages/docs/.next pnpm-lock.yaml`
4. Reinstall: `pnpm install`
5. Test: `pnpm dev:docs`

---

**Last Updated:** January 2025
**Status:** ✅ Fully Functional (tested on localhost:3000)
