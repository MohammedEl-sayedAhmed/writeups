# writeups

Source repository for a personal technical blog. Built with [Astro](https://astro.build), deployed as static HTML to [Cloudflare Pages](https://pages.cloudflare.com), and cross-posted automatically to [dev.to](https://dev.to) for reach.

## Architecture

```
src/content/blog/*.md   →  Astro build       →  Cloudflare Pages   (primary, your URL)
                       ↘  GitHub Action      →  dev.to             (cross-post)
```

Source of truth is markdown in `src/content/blog/`. Push to `main` triggers both pipelines.

## Layout

| Path | What it is |
|---|---|
| `src/content/blog/` | One markdown file per post |
| `src/content.config.ts` | Frontmatter schema (Zod-validated at build time) |
| `src/pages/` | Page templates (home, blog index, post template, RSS feed) |
| `src/layouts/`, `src/components/` | Reusable view code |
| `src/consts.ts` | Site title and description |
| `astro.config.mjs` | Astro config (site URL, integrations) |
| `.github/workflows/crosspost.yml` | dev.to cross-post automation |

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

# optional, Astro-side
updatedDate: 'May 17 2026'
heroImage: '../../assets/your-image.jpg'

# optional, cross-post-side (read by .github/workflows/crosspost.yml)
tags: 'rust, systems, distributed'    # comma-separated, max 4, no '#'
canonical_url: 'https://mammar.pages.dev/blog/your-slug/'
published: true                        # set false to keep the dev.to copy as a draft
---

Post body in markdown.
```

The filename (without `.md`) becomes the URL slug. Push to `main` → Cloudflare Pages rebuilds the site → cross-post Action publishes/updates the dev.to copy.

## Deployment

### Primary — Cloudflare Pages

Auto-deploys on every push to `main`. Build settings on Cloudflare:

- Build command: `npm run build`
- Output directory: `dist`
- Node version: `22` (pinned via `.nvmrc`)

### Cross-post — dev.to via GitHub Actions

[`.github/workflows/crosspost.yml`](.github/workflows/crosspost.yml) runs on every push that touches `src/content/blog/**`. It:

1. Skips silently if `DEVTO_TOKEN` is not configured (so the workflow file can land before the secret is in place).
2. Otherwise calls [`sinedied/publish-devto`](https://github.com/sinedied/publish-devto) (pinned to a commit SHA).
3. On first publish of a post, the action writes the dev.to article `id` back into the post's frontmatter and commits it — subsequent pushes update the same dev.to article instead of creating duplicates. Do not edit `id` by hand.

**Setup (one-time):**

1. Generate a dev.to API key at https://dev.to/settings/extensions.
2. In this repo: Settings → Secrets and variables → Actions → New repository secret.
3. Name: `DEVTO_TOKEN`, value: the key from step 1.

Set `canonical_url` in each post's frontmatter so search engines credit the Astro/Cloudflare site (yours) as the original, not dev.to.

Hashnode cross-posting is not currently automated — their GraphQL API moved to paid access. If that changes (or you decide to pay), a parallel workflow can be added.

### Security hardening applied to the workflow

| Hardening | Why |
|---|---|
| `permissions: {}` at workflow level + `contents: write` only on the job | Default-deny; least privilege |
| All third-party and official actions pinned to **commit SHA**, not tags | Prevents tag-retargeting / upstream-repo-compromise attacks |
| [`.github/dependabot.yml`](.github/dependabot.yml) auto-PRs action and npm updates weekly | SHA-pinning doesn't strand us on stale, vulnerable versions |
| `timeout-minutes: 10` on the job | Caps blast radius of any stuck or looping step |
| `concurrency:` group with `cancel-in-progress: false` | Two pushes can't race; in-flight publishes finish before the next runs |
| Secrets injected via `env:` and referenced as quoted shell vars, never inlined | Avoids shell-injection if a secret value ever contains special characters |
| Trigger restricted to `push` on `main` (no `pull_request` from forks) | Untrusted PRs cannot access secrets |

## Notes

- `pubDate` is the original publication date; don't change it once a post is live or RSS readers will re-fetch.
- Add `updatedDate` to signal an edit.
- GitHub Actions on public repos are free with no monthly minute cap.
