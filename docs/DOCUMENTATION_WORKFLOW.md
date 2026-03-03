# Documentation Workflow Guide

This guide covers the complete workflow for managing, updating, and publishing documentation in the Fumadocs platform.

## Quick Reference

| Task | Command | Result |
|------|---------|--------|
| **Start docs site locally** | `pnpm dev:docs` | http://localhost:3000 (hot-reload) |
| **Check setup** | `pnpm setup:local` | Validates all 6 packages including docs |
| **Build for production** | `cd packages/docs && pnpm build` | Optimized static site in `.next/` |
| **Add new guide** | Create `.mdx` in `content/docs/guides/` | Auto-appears in sidebar |
| **Update Fumadocs** | `pnpm update fumadocs-*` | Latest features & fixes |

## Documentation is Code

Treat documentation like your codebase:

- **Track changes:** Commit `.mdx` files to Git
- **Review PRs:** Have team members review docs before merge
- **Version control:** Documentation versioning via Git tags
- **CI/CD:** Auto-build & publish docs on push to main

## Content Organization

### Current Structure

```
packages/docs/content/docs/
├── index.mdx                          # Homepage
├── guides/
│   ├── setup-local.mdx               # Local development guide
│   ├── mobile-troubleshooting.mdx    # Mobile app fixes
│   ├── ui-development.mdx            # React Native patterns
│   └── dependency-management.mdx     # Adding packages
├── infra/
│   └── architecture.mdx               # System architecture
└── reference/
    └── api-contracts.mdx             # API specifications
```

### Naming Conventions

- **Use kebab-case:** `my-feature-guide.mdx` ✅
- **Use underscores sparingly:** `local_dev.mdx` ❌
- **No spaces in filenames:** `my guide.mdx` ❌
- **Descriptive names:** `react-native-debugging.mdx` ✅ vs `guide2.mdx` ❌

### Section Organization

| Section | Purpose | Location |
|---------|---------|----------|
| **Guides** | Step-by-step how-tos | `guides/` |
| **Infrastructure** | System design, deployment | `infra/` |
| **Reference** | API docs, specs, config | `reference/` |
| **Troubleshooting** | Common issues & solutions | `troubleshooting/` |

## Creating Documentation

### 1. Basic Page Template

```mdx
---
title: "Page Title"
description: "One-line summary for search results"
icon: BookOpen  # Optional: icon from lucide-react
---

## Section Heading

Start with an introductory paragraph that explains what the page covers.

### Subsection

Content here...
```

### 2. Frontmatter Fields

| Field | Required | Purpose | Example |
|-------|----------|---------|---------|
| `title` | ✅ | Page title + H1 | `"Mobile App Setup"` |
| `description` | ✅ | Search summary | `"Set up mobile dev environment"` |
| `icon` | ❌ | Sidebar icon | `Smartphone` |
| `full` | ❌ | Full width layout | `true` |

### 3. Common Markdown Patterns

**Callouts:**
```mdx
> [!NOTE]
> Use this for general information

> [!WARNING]
> Use this for important cautions

> [!TIP]
> Use this for helpful tips
```

**Code Blocks with Language:**
```mdx
\`\`\`bash
# This is a bash script
pnpm dev:docs
\`\`\`

\`\`\`typescript
// This is TypeScript
const config: Config = {};
\`\`\`
```

**Links:**
```mdx
[Link text](./other-file.mdx)           # Relative links
[External](https://example.com)         # External links
```

**Images:**
```mdx
![Alt text](/images/screenshot.png)
```

### 4. Advanced Components

**Tabs (multiple language examples):**
```mdx
import { Tabs, Tab } from 'fumadocs-ui/components/tabs';

<Tabs items={["Shell", "PowerShell"]}>
  <Tab value="Shell">
    \`\`\`bash
    pnpm dev:docs
    \`\`\`
  </Tab>
  <Tab value="PowerShell">
    \`\`\`powershell
    pnpm dev:docs
    \`\`\`
  </Tab>
</Tabs>
```

**Steps (ordered procedures):**
```mdx
import { Steps } from 'fumadocs-ui/components/steps';

<Steps>
  <Step>
    First step description
  </Step>
  <Step>
    Second step description
  </Step>
</Steps>
```

## Workflow: From Draft to Published

### Phase 1: Write Documentation

```bash
# Create new guide
touch packages/docs/content/docs/guides/my-new-guide.mdx
```

Edit the file with your content:

```mdx
---
title: "My New Feature Guide"
description: "How to use my new feature"
---

## Getting Started

[Your content here]
```

### Phase 2: Preview in Development

```bash
pnpm dev:docs
```

- Visit **http://localhost:3000/docs/guides/my-new-guide**
- Verify formatting, links, code blocks
- Check sidebar appears correctly
- Test search functionality

### Phase 3: Review & Iterate

```bash
# Make changes
# Hot-reload automatically detects changes
# Test again in browser
```

### Phase 4: Commit to Version Control

```bash
git add packages/docs/content/docs/guides/my-new-guide.mdx
git commit -m "docs: add my new feature guide"
git push origin feature/my-feature
```

### Phase 5: Merge & Deploy

- Create pull request
- Team reviews documentation
- Merge to main branch
- Documentation auto-publishes (if CI/CD configured)

## Migrating Existing Documentation

### Converting from Markdown (.md) to MDX

1. **Copy file:**
   ```bash
   cp docs/legacy-guide.md packages/docs/content/docs/guides/legacy-guide.mdx
   ```

2. **Add frontmatter:**
   ```mdx
   ---
   title: "Legacy Guide"
   description: "Description from the original doc"
   ---

   [Rest of original markdown...]
   ```

3. **Update links:**
   - Change `[link](./other-doc.md)` → `[link](./other-doc.mdx)`
   - Change `[link](/docs/api-contracts.md)` → `[link](/docs/reference/api-contracts)`

4. **Preview:**
   ```bash
   pnpm dev:docs
   # Check it appears in sidebar
   ```

5. **Remove old file (optional):**
   ```bash
   rm docs/legacy-guide.md
   ```

### Mass Migration Script

To convert all `.md` files to `.mdx`:

```bash
#!/bin/bash
# Rename all .md to .mdx in content/docs
find packages/docs/content/docs -name "*.md" -exec sh -c 'mv "$1" "${1%.md}.mdx"' _ {} \;
```

## Keeping Documentation Fresh

### Regular Maintenance

- **Weekly:** Review new issues/PRs for documentation updates
- **Biweekly:** Update troubleshooting section with new issues solved
- **Monthly:** Review and refresh architecture documentation
- **Quarterly:** Audit all links, verify nothing is broken

### Broken Link Detection

```bash
# Search for broken relative links
grep -r "\[.*\](.*\.md)" packages/docs/content/docs/ | grep -v "\.mdx)"
# Fix any .md references (should be .mdx)

# Broken image references
grep -r "!\[.*\](.*)" packages/docs/content/docs/ | grep -v "/public/"
```

### Documentation Review Checklist

Before committing documentation:

- ✅ Title is clear and descriptive
- ✅ Description summarizes the content
- ✅ Code examples are tested and work
- ✅ Links are relative and working
- ✅ Images have alt text
- ✅ Grammar and spelling checked
- ✅ Consistent with documentation style guide (see below)

## Documentation Style Guide

### Voice & Tone

- **Friendly:** "Let's set up your mobile development environment"
- **Clear:** Avoid jargon, explain acronyms
- **Actionable:** Use imperative: "Run this command" vs "You can run"
- **Concise:** Remove unnecessary words

### Formatting Standards

**Headings:**
- H1 (`#`) — Reserved for page title (auto-generated from frontmatter)
- H2 (`##`) — Main sections
- H3 (`###`) — Subsections
- H4 (`####`) — Details under subsections

**Code Examples:**
- Always include language: `` ```bash `` not `` ``` ``
- Show input and output when helpful
- Test all code before publishing

**External Links:**
- Use descriptive text: `[Fumadocs docs](...)` ✅
- Avoid "click here": `click [here](...)` ❌
- Check links quarterly for decay

### Examples

✅ **Good:**
```mdx
---
title: "Setting Up Local Development"
description: "Complete guide to starting development locally with one command"
---

## Quick Start

Run the setup command once:

\`\`\`bash
pnpm setup:local
\`\`\`

This validates your development environment and installs dependencies.
```

❌ **Bad:**
```mdx
---
title: "Setup"
description: "How to setup"
---

## Setup Instructions

You need to setup your environment. Run the command below:

\`\`\`
setup:local
\`\`\`
```

## Troubleshooting Documentation Issues

### Search isn't finding my content

- Add `description` field to frontmatter
- Use descriptive `title` (not "Guide" or "Documentation")
- Include keywords in body text
- Restart dev server: `pnpm dev:docs`

### Page won't render

```bash
# Check MDX syntax errors
cd packages/docs
npm run build
# Look for error messages

# Clear cache and rebuild
rm -rf .next
pnpm dev:docs
```

### Sidebar showing wrong order

Folders are alphabetical by default. Reorder by adding number prefixes:

```
content/docs/
├── 01-guides/
├── 02-infra/
└── 03-reference/
```

### Images not displaying

- Ensure images are in `public/images/`
- Use absolute paths: `![alt](/images/name.png)`
- Not relative paths: `![alt](../../images/name.png)` ❌

## Publishing & Deployment

### Local Verification

```bash
pnpm dev:docs
# Visit http://localhost:3000
# Verify all pages render
# Test search
# Check mobile view
```

### Production Build

```bash
cd packages/docs
pnpm build
pnpm start
# Visit http://localhost:3000 (production build)
```

### Deployment Pipeline

**Recommended for CI/CD:**

```yaml
# In GitHub Actions or similar
- name: Build docs
  run: |
    cd packages/docs
    pnpm install
    pnpm build

- name: Deploy docs
  run: |
    # Deploy packages/docs/.next or pages/
    # to your hosting provider (Vercel, Netlify, etc.)
```

## FAQs

**Q: Can I use React components in documentation?**
A: Yes! Fumadocs supports JSX/TSX in MDX. Import and use any React component.

**Q: How do I version documentation?**
A: Use Git tags: `git tag docs-v1.0.0`. Fumadocs doesn't have built-in versioning.

**Q: Can I add custom CSS/styling?**
A: Yes, use Tailwind CSS classes in MDX or modify `tailwind.config.ts`.

**Q: How often should I update documentation?**
A: When you make code changes, update docs at the same time. Docs should never be out of sync.

**Q: Can others contribute documentation?**
A: Yes! Follow the workflow above (create branch, write docs, open PR for review, merge).

---

**Last Updated:** January 2025
**Maintainer:** Development Team
**Next Review:** Q2 2025
