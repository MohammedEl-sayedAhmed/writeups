---
title: 'Hello, world'
description: 'First post — placeholder while the blog gets wired up.'
pubDate: 'May 16 2026'

# Cross-post fields read by .github/workflows/crosspost.yml.
# published: false keeps the dev.to copy as a DRAFT for now — flip to true to publish.
tags: 'meta'
canonical_url: 'https://mammar.pages.dev/blog/hello-world/'
published: false
---

This is a placeholder post.

Replace it with real content once Cloudflare Pages is connected and the site is live. To delete this post entirely, remove `src/content/blog/hello-world.md`.

## How posts work here

- One markdown file per post under `src/content/blog/`.
- Filename (without `.md`) becomes the URL slug.
- Frontmatter fields are validated by `src/content.config.ts`:
  - `title` (required, string)
  - `description` (required, string — used for SEO and post listings)
  - `pubDate` (required, date)
  - `updatedDate` (optional, date)
  - `heroImage` (optional, image path)
  - `tags`, `canonical_url`, `published` — cross-post fields (see README)

Push to `main` and Cloudflare Pages rebuilds; the cross-post Action mirrors the post to dev.to as a draft (or live, if `published: true`).
