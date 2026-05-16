---
title: 'Hello, world'
description: 'First post — placeholder while the blog gets wired up.'
pubDate: 'May 16 2026'
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

Push to `main` and Cloudflare Pages rebuilds automatically.
