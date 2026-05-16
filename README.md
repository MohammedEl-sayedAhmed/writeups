# writeups

Source repository for a personal technical blog. Built with [Astro](https://astro.build), deployed as static HTML to [Cloudflare Pages](https://pages.cloudflare.com).

## Layout

| Path | What it is |
|---|---|
| `src/content/blog/` | One markdown file per post |
| `src/content.config.ts` | Frontmatter schema (Zod-validated at build time) |
| `src/pages/` | Page templates (home, blog index, post template, RSS feed) |
| `src/layouts/`, `src/components/` | Reusable view code |
| `src/consts.ts` | Site title and description |
| `astro.config.mjs` | Astro config (site URL, integrations) |

## Local development

```bash
nvm use                 # picks Node 22 from .nvmrc
npm install             # first time only
npm run dev             # http://localhost:4321
npm run build           # produces ./dist
npm run preview         # serves ./dist locally
```

## Adding a post

Create `src/content/blog/<slug>.md`:

```yaml
---
title: 'Your post title'
description: 'One-line description for SEO and the post listing.'
pubDate: 'May 16 2026'
# optional:
updatedDate: 'May 17 2026'
heroImage: '../../assets/your-image.jpg'
---

Post body in markdown.
```

The filename (without `.md`) becomes the URL slug. Push to `main` → Cloudflare Pages rebuilds the site.

## Deployment

Auto-deploys to Cloudflare Pages on every push to `main`. Build settings on Cloudflare:

- Build command: `npm run build`
- Output directory: `dist`
- Node version: `22` (pinned via `.nvmrc`)

## Notes

- `pubDate` is the original publication date; don't change it once a post is live or RSS readers will re-fetch.
- Add `updatedDate` to signal an edit.
