# writeups

Source repository for a personal technical blog. Built with [Astro](https://astro.build), deployed as static HTML to [Cloudflare Pages](https://pages.cloudflare.com), and cross-posted automatically to [dev.to](https://dev.to) for reach.

## Architecture

<p align="center"><img src="docs/architecture.svg" width="100%" alt="writeups architecture"></p>

Source of truth is markdown in `src/content/blog/`. A push to `main` fans out to parallel pipelines: Cloudflare Pages rebuilds the Astro site (including the satori/resvg per-post Open Graph images) and deploys it to `mammar.pages.dev`; `crosspost.yml` publishes or updates the dev.to copy via `sinedied/publish-devto` and opens an auto-merging PR — the dashed loop is that PR writing the dev.to article `id` back into the post's frontmatter so subsequent pushes update the same article instead of creating duplicates; `send-webmentions.yml` pings every outgoing link's webmention endpoint; `test.yml` runs the Vitest and Playwright suites as required checks that gate the auto-merge PR. `diagnose-devto.yml` is a manual-only diagnostic against the Forem API.

<details>
<summary>Mermaid fallback</summary>

```mermaid
flowchart LR
    author["Author<br/>npm run dev / build"]
    src["src/content/blog/*.md<br/>Zod-validated frontmatter"]
    push["git push → main<br/>protected · linear history"]
    cf["Cloudflare Pages<br/>Astro build (Node 22)<br/>satori + resvg OG images"]
    cross["crosspost.yml<br/>working branch → auto-merge PR"]
    test["test.yml — unit + e2e<br/>Vitest + Playwright"]
    wm["send-webmentions.yml<br/>POST to outgoing-link endpoints"]
    diag["diagnose-devto.yml<br/>manual workflow_dispatch only"]
    site(("mammar.pages.dev"))
    devto(("dev.to/mammar"))
    ends(("webmention endpoints"))
    forem(("dev.to Forem API"))

    author -->|authors| src
    src -->|commit| push
    push -->|webhook deploy| cf
    push -->|on push: blog| cross
    push -->|on push: blog| wm
    push -->|PR + push| test
    cf -->|deploy| site
    cross -->|POST/PUT| devto
    cross -.->|PR writes dev.to id to frontmatter| src
    test -.->|required checks| cross
    wm -->|webmention| ends
    diag -->|manual run| forem
    devto -.->|canonical_url| site
```

</details>

## Features

What the site does, beyond rendering markdown:

- **Light and dark themes** — CSS-variable design system. Dark is the default. The header toggle switches to light. The choice persists in `localStorage`. No flash on load.
- **Per-post Open Graph images** — auto-generated at build (`/og/<slug>.png`) via [satori](https://github.com/vercel/satori) + [@resvg/resvg-js](https://github.com/yisibl/resvg-js) using bundled Inter. Used for the `og:image` / `twitter:image` cards on dev.to, Twitter, LinkedIn, Slack, etc.
- **JSON-LD** — every post emits `BlogPosting` structured data (`@type`, `author`, `datePublished`, `mainEntityOfPage`, etc.) for richer search results.
- **Tag archives** — frontmatter `tags` automatically drive `/tags/<slug>/` listing pages plus a `/tags/` index with counts. Tag chips on posts and the blog list are clickable.
- **Reader affordances on post pages**:
  - Sticky table of contents (≥1180px) with active-section highlight; collapses to a `<details>` accordion on smaller viewports.
  - Reader font-size control (S/M/L/XL), persisted.
  - Reading-time estimate (computed at build from word count).
  - Reading-progress bar at the top of the article.
  - Copy-code button on every fenced block.
  - Heading anchor links via `rehype-slug` + `rehype-autolink-headings`.
  - Prev/next post navigation.
- **Search** — [Pagefind](https://pagefind.app) full-text search. Open it with Cmd/Ctrl-K.
- **Comments** — [Giscus](https://giscus.app) comments under each post. Set `comments: false` to hide them on a post.
- **Webmentions** — received mentions show under each post. The build reads them from webmention.io. `send-webmentions.yml` sends outbound webmentions.
- **Related posts** — chosen from shared tags.
- **Share sheet** — share buttons on each post, plus a "Discuss on dev.to" link when the post has a dev.to copy.
- **Scroll-to-top button**.
- **View transitions** — Astro's `ClientRouter` between pages.
- **RSS** at `/rss.xml`, **sitemap** at `/sitemap-index.xml`.

`.mdx` posts render on the site. The cross-post, the tag swap and the webmentions read only `*.md` files.

## Layout

| Path | What it is |
|---|---|
| `src/content/blog/` | One markdown file per post |
| `src/content.config.ts` | Frontmatter schema (Zod-validated at build time) |
| `src/pages/` | Page templates: home, `about`, `blog/` index + `[...slug]` post template, `tags/` index + `[tag]` archive, `og/[...slug].png` build-time OG image, `rss.xml.js` feed |
| `src/lib/` | Build-time helpers: dev.to URL lookup, related posts, share links, webmentions |
| `src/layouts/`, `src/components/` | Reusable view code (Header, Footer, BaseHead, TableOfContents, BlogPost layout, etc.) |
| `src/styles/global.css` | Design tokens (colors, spacing, type scale) and prose styles |
| `src/consts.ts` | Site title, description, author name + URL, social links, Giscus settings |
| `astro.config.mjs` | Astro config (site URL, integrations, rehype plugins) |
| `tests/unit/`, `tests/e2e/` | Vitest unit tests and Playwright e2e specs |
| `vitest.config.ts`, `playwright.config.ts` | Test configs |
| `.github/workflows/crosspost.yml` | dev.to cross-post automation |
| `.github/workflows/test.yml` | `unit` and `e2e` jobs (required checks) |
| `.github/workflows/send-webmentions.yml` | Outbound webmentions |
| `.github/workflows/diagnose-devto.yml` | Manual dev.to diagnostic |
| `.github/scripts/swap-tags.py` | Swaps `tags` and `devto_tags` around the dev.to publish |
| `scripts/diagnose-devto.py` | The script that `diagnose-devto.yml` runs |
| `docs/` | Architecture diagram |
| `public/` | Static files served as is |
| `AGENTS.md` | Project context for coding agents |

## Local development

```bash
nvm use                 # picks Node 22 from .nvmrc
npm install             # first time only
npm run dev             # http://localhost:4321
npm run build           # produces ./dist
npm run preview         # serves ./dist locally
```

Tests:

```bash
npm test                          # Vitest unit tests
npx playwright install chromium   # first time only
npm run build                     # e2e runs against ./dist
npm run test:e2e                  # Playwright e2e
```

The build calls the dev.to API (for the "Discuss on dev.to" link) and webmention.io (for received webmentions). If a call fails, the build continues without that data. The optional `WEBMENTION_IO_TOKEN` environment variable is passed to the webmention.io request.

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

# optional, site-side
tags: 'rust, systems, distributed'    # comma-separated, no '#'; drives chips, tag archives, OG images, related posts
comments: true                         # set false to hide Giscus comments on this post

# optional, cross-post-side (read by .github/workflows/crosspost.yml)
devto_tags: 'rust, systems'           # dev.to subset: max 4, lowercase alphanumeric; needed only if `tags` breaks dev.to's rules
canonical_url: 'https://mammar.pages.dev/blog/your-slug/'
published: true                        # set false to keep the dev.to copy as a draft
---

Post body in markdown.
```

The filename (without `.md`) becomes the URL slug. Each `tags` entry becomes a clickable chip on the post and is also indexed under `/tags/<slug>/` (slug = lowercased, spaces → hyphens). The site's `og:image` / `twitter:image` card is generated automatically at build from the post's title, date, and tags — no `heroImage` required. The dev.to copy does not use it.

Merge the PR into `main` → Cloudflare Pages rebuilds the site → cross-post Action publishes/updates the dev.to copy.

## Deployment

### Primary — Cloudflare Pages

Auto-deploys on every push to `main`. Build settings on Cloudflare:

- Build command: `npm run build`
- Output directory: `dist`
- Node version: `22` (pinned via `.nvmrc`)

### Cross-post — dev.to via GitHub Actions

[`.github/workflows/crosspost.yml`](.github/workflows/crosspost.yml) runs on every push to `main` that touches `src/content/blog/**`, and on manual `workflow_dispatch`. It skips its own `chore(crosspost):` merges. It:

1. Skips with a warning if `DEVTO_TOKEN` or `CROSSPOST_PAT` is missing.
2. Otherwise calls [`sinedied/publish-devto`](https://github.com/sinedied/publish-devto) (pinned to a commit SHA).
3. On first publish of a post, the action writes the dev.to article `id` and `date` into the post's frontmatter on a per-run branch. The workflow then opens an auto-merge PR from that branch. The PR merges into `main` after `unit` and `e2e` pass. So far the auto-merge step has failed and the PR had to be merged by hand (#67), so check that it merged. Later pushes update the same dev.to article instead of creating duplicates. Do not edit `id` or `date` by hand.

**Setup (one-time):**

1. Generate a dev.to API key at https://dev.to/settings/extensions.
2. In this repo: Settings → Secrets and variables → Actions → New repository secret.
3. Name: `DEVTO_TOKEN`, value: the key from step 1.
4. Add a second secret, `CROSSPOST_PAT`: a fine-grained PAT with `contents: write` and `pull-requests: write` on this repo. The workflow uses it for checkout, the branch push and the PR.
5. Turn on "Allow auto-merge" in Settings → General → Pull Requests.

Set `canonical_url` in each post's frontmatter so search engines credit the Astro/Cloudflare site (yours) as the original, not dev.to.

Hashnode cross-posting is not currently automated — their publish flow moved to a paid tier. If that changes (or you decide to pay), a parallel workflow can be added.

### Security hardening applied to the workflow

| Hardening | Why |
|---|---|
| `permissions: {}` at workflow level + `contents: write` only on the job | Default-deny; least privilege |
| All third-party and official actions pinned to **commit SHA**, not tags | Prevents tag-retargeting / upstream-repo-compromise attacks |
| [`.github/dependabot.yml`](.github/dependabot.yml) auto-PRs action and npm updates weekly | SHA-pinning doesn't strand us on stale, vulnerable versions |
| Dependabot alerts and security updates on (Settings → Advanced Security) | Known advisories in npm dependencies show on the Security tab, and fix PRs open without waiting for the weekly run. Actions pinned to a commit SHA get no alerts, so the weekly version updates cover them |
| `timeout-minutes: 10` on the job | Caps blast radius of any stuck or looping step |
| `concurrency:` group with `cancel-in-progress: false` | Two pushes can't race; in-flight publishes finish before the next runs |
| Secrets injected via `env:` and referenced as quoted shell vars, never inlined | Avoids shell-injection if a secret value ever contains special characters |
| Trigger restricted to `push` on `main` and manual `workflow_dispatch` (no `pull_request` from forks) | Untrusted PRs cannot access secrets |

## Branch protection

`main` is protected. Configured via `gh api .../branches/main/protection`; change at [Settings → Branches → main](https://github.com/MohammedEl-sayedAhmed/writeups/settings/branches).

| Rule | Effect |
|---|---|
| **Require a pull request before merging** | No direct pushes to `main`. Approvals required: **0** (single-maintainer; you can merge your own work). |
| **Require status checks: `unit`, `e2e`** | The Vitest and Playwright jobs from `.github/workflows/test.yml` must pass before merge. |
| **Require branches to be up to date** | A PR must be rebased on the latest `main` before its checks count. |
| **Require linear history** | Blocks merge commits for non-admins only: `enforce_admins` is off, and the repo allows merge commits. |
| **Block force pushes** | History cannot be rewritten. |
| **Block branch deletions** | `main` cannot be deleted. |
| **Admin bypass: enabled** | The maintainer can override in genuine emergencies (do not use casually). |

`.github/CODEOWNERS` maps every path to `@MohammedEl-sayedAhmed`. GitHub requests a review from the owner on PRs from other people. Branch protection does not require code-owner reviews.

## Notes

- `pubDate` is the original publication date; don't change it once a post is live or RSS readers will re-fetch.
- Add `updatedDate` to signal an edit.
- GitHub Actions on public repos are free with no monthly minute cap.
