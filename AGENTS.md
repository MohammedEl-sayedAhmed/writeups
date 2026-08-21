# writeups — project context for AI coding agents

Personal technical blog. Astro static site on Cloudflare Pages, with automated cross-post
to dev.to, full-text search (Pagefind), dynamically generated OG images, and outbound
webmentions.

## Quick orientation

- **Production site:** https://mammar.pages.dev/
- **GitHub repo:** https://github.com/MohammedEl-sayedAhmed/writeups
- **dev.to profile:** https://dev.to/mammar
- **Owner:** Mohammed Elsayed Ahmed (`@MohammedEl-sayedAhmed` on GitHub, `@mammar` on dev.to / Hashnode / Cloudflare project name)

## Architecture

See [README.md](README.md#architecture) for the Mermaid diagram. Source of truth = markdown in `src/content/blog/`. Push to `main` fans out to:

- **Cloudflare Pages** → builds Astro → `mammar.pages.dev`. The build also runs **Pagefind** to index the site for client-side search.
- **GitHub Actions:**
  - `crosspost.yml` → publishes/updates the same post on dev.to via `sinedied/publish-devto`, then commits the dev.to article `id` back to the markdown frontmatter.
  - `send-webmentions.yml` → after a post is live, discovers link targets and sends outbound webmentions (webmention.io); only makes outbound HTTPS POSTs.
  - `test.yml` → CI on PRs: vitest unit tests + Playwright e2e (content integrity).
  - `diagnose-devto.yml` → manual/diagnostic workflow for troubleshooting dev.to publishing.

Branches other than `main` get **preview deployments** at `<commit>.mammar.pages.dev`; the cross-post workflow does *not* fire on them.

## Toolchain / versions

- **Node 22** (`.nvmrc`).
- **Astro is pinned EXACTLY to `7.1.1`** (no caret). Do **not** bump to 7.2.x casually: astro 7.2.x daemonises `astro preview`, which breaks the Playwright e2e `webServer` — fix the e2e harness before unpinning.
- **Search:** Pagefind (built into `npm run build`). **OG images:** generated dynamically with `satori` + `@resvg/resvg-js`.

## Workflow rules

1. **PR-based publishing.** Create a branch (`post/<slug>` for posts, `chore/<topic>` for housekeeping), commit, push, open PR. Cloudflare creates a preview deployment; review it on the preview URL, then merge to `main` to go live + cross-post.
2. **Atomic commits.** One logical change per commit. Same for PRs.
3. **Identity hygiene.**
   - Git author/committer in this repo is locked to `Mohammed Elsayed Ahmed <57391064+MohammedEl-sayedAhmed@users.noreply.github.com>` via per-repo config — verify with `git -C . config user.email`.
   - **Never** use the work email (`mohammed@witco.sa`) for commits here.
   - Zero AI / Claude attribution in any committed artifact (commit messages, PRs, code comments, posts). No `Co-Authored-By`, no `🤖 Generated with…` trailer.

## Frontmatter schema (`src/content.config.ts`)

| Field | Required | Notes |
|---|---|---|
| `title` | yes | string |
| `description` | yes | string — used for SEO and post-list summary |
| `pubDate` | yes | parsable date string |
| `updatedDate` | no | parsable date string |
| `heroImage` | no | path to an image in `src/assets/` |
| `tags` | no | comma-separated string, max 4, real dev.to tag slugs (e.g. `linux, python, debugging`) |
| `canonical_url` | no | `https://mammar.pages.dev/blog/<slug>/` |
| `published` | no (default true via schema) | `false` = dev.to draft, `true` = dev.to live. Site (Cloudflare) doesn't care about this. |
| `id` | no | **Set by the action after first publish, do not edit by hand.** Identifies the dev.to article for updates. |

## Local development

```bash
nvm use          # picks Node 22 from .nvmrc
npm install      # first time only
npm run dev      # http://localhost:4321
npm run build    # astro build + Pagefind index → ./dist; run before pushing to verify schema
npm run preview  # serves ./dist locally
npm test         # vitest unit tests
npm run test:e2e # Playwright e2e (content integrity) — see the astro 7.1.1 note above
```

## Testing

- **Unit:** vitest (`npm test`). **E2e:** Playwright (`npm run test:e2e`), also run in CI by `test.yml` on PRs.
- Keep e2e green before merging. The astro-preview daemon caveat (see *Toolchain*) will break the e2e `webServer` if astro is unpinned to 7.2.x.

## Security posture of the workflows

The workflows are hardened — keep them that way:

- Third-party actions pinned to commit SHAs (not tags), with inline `# vX.Y.Z` markers Dependabot reads.
- Default-deny workflow permissions; least-privilege per job (e.g. `contents: write` only where needed).
- Job timeouts + concurrency groups to prevent races.
- `.github/dependabot.yml` auto-PRs weekly action + npm updates.

Do not relax any of this. Pin every new third-party action to a SHA.

## Things deliberately *not* set up

- **Hashnode cross-posting.** Their publish-from-GitHub flow moved to a paid tier in 2025/2026; evaluated and skipped. Don't re-add unless the user explicitly changes their mind on cost.
- **Custom domain.** Currently `mammar.pages.dev`. No domain purchased.
- **Newsletter / analytics.** None.

## Conventions for adding a new post

```bash
git checkout main && git pull
git checkout -b post/<slug>
# create src/content/blog/<slug>.md with full frontmatter
npm run build              # verify schema before pushing
git add src/content/blog/<slug>.md
git commit -m "Add post: <short title>"
git push -u origin post/<slug>
gh pr create --base main --head post/<slug> --title "..." --body "..."
```

After merge:
- Cloudflare deploys the post to `https://mammar.pages.dev/blog/<slug>/`.
- Cross-post action creates/updates the dev.to article (draft if `published: false`, live if `true`).
- A bot commit `chore: update published articles [skip ci]` lands on `main` writing the dev.to `id` back. `git pull` before doing further work.
