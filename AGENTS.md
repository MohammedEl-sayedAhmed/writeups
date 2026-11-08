# writeups — project context for AI coding agents

Personal technical blog. Astro static site on Cloudflare Pages, with automated cross-post
to dev.to, full-text search (Pagefind), OG images generated at build time, and outbound
webmentions.

## Quick orientation

- **Production site:** https://mammar.pages.dev/
- **GitHub repo:** https://github.com/MohammedEl-sayedAhmed/writeups
- **dev.to profile:** https://dev.to/mammar
- **Owner:** Mohammed Elsayed Ahmed (`@MohammedEl-sayedAhmed` on GitHub, `@mammar` on dev.to / Hashnode / Cloudflare project name)

## Architecture

See [README.md](README.md#architecture) for the architecture diagram (SVG, with a Mermaid fallback). Source of truth = markdown in `src/content/blog/`. Push to `main` fans out to:

- **Cloudflare Pages** → builds Astro → `mammar.pages.dev`. The build also runs **Pagefind** to index the site for client-side search.
- **GitHub Actions:**
  - `crosspost.yml` → publishes/updates the same post on dev.to via `sinedied/publish-devto`, then opens an auto-merge PR (`chore(crosspost): dev.to writeback + tag restore`) that writes the dev.to article `id` and `date` into the frontmatter. The PR merges after `unit` and `e2e` pass.
  - `send-webmentions.yml` → waits 90 seconds for the deploy, then runs `@remy/webmention` on every post. It fetches each live post and each link target, and posts to each target's own webmention endpoint. It does not check that a post is live. (webmention.io is only this site's receiving endpoint.)
  - `test.yml` → CI on PRs and on pushes to `main`: vitest unit tests + Playwright e2e (search, share buttons, comments, view transitions, content integrity).
  - `diagnose-devto.yml` → manual/diagnostic workflow for troubleshooting dev.to publishing.

Branches other than `main` get **preview deployments** at `<commit>.mammar.pages.dev`; the cross-post workflow does *not* fire on them.

## Toolchain / versions

- **Node 22** (`.nvmrc`).
- **Astro is pinned EXACTLY to `7.4.5`** (no caret). `@astrojs/mdx` is pinned exactly too (`7.0.3`), and so is `@astrojs/markdown-remark` (`7.3.6`). Bump them together and run unit, build, and e2e before you merge.
- **Node `>=22.23.4`** is required by Astro 7.4.x. `.nvmrc` says `22`, so CI takes the newest 22.x.
- **Markdown plugins:** `rehype-slug` and `rehype-autolink-headings` run on the `unified()` processor from `@astrojs/markdown-remark`, set in `astro.config.mjs`. Astro's default Markdown processor does not run rehype plugins.
- **`astro preview` and agents:** Astro 7.2 and later start `astro preview` as a background process when a coding agent runs it. That makes the Playwright `webServer` exit early. The `webServer` command uses `--ignore-lock` so the server stays in the foreground.
- **Search:** Pagefind (built into `npm run build`). **OG images:** generated at build time with `satori` + `@resvg/resvg-js`.

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
| `tags` | no | comma-separated string (e.g. `linux, python, debugging`). Drives tag chips, tag archives, OG images and related posts. If `devto_tags` is not set, these also go to dev.to, so then keep them to max 4 real dev.to tag slugs. |
| `devto_tags` | no | dev.to-safe subset of `tags` (max 4, lowercase alphanumeric). The cross-post swaps it in for `tags` before publishing. |
| `canonical_url` | no | `https://mammar.pages.dev/blog/<slug>/` |
| `published` | no | `false` = dev.to draft, `true` = dev.to live. Set it explicitly: the schema default (`true`) only reaches the site, which never reads the field; the cross-post reads the raw file. |
| `comments` | no | default `true`; `false` hides the Giscus comments on that post. |
| `id` | no | **Set by the action after first publish, do not edit by hand.** Identifies the dev.to article for updates. |
| `date` | no | **Written by the cross-post, do not edit by hand.** |

`.mdx` posts render on the site, but the cross-post, the tag swap and the webmentions read only `*.md` files.

## Local development

```bash
nvm use          # picks Node 22 from .nvmrc
npm install      # first time only
npm run dev      # http://localhost:4321
npm run build    # astro build + Pagefind index → ./dist; run before pushing to verify schema
npm run preview  # serves ./dist locally
npm test         # vitest unit tests
npm run test:e2e # Playwright e2e; run `npm run build` first, and `npx playwright install chromium` once — see the Toolchain notes above
```

## Testing

- **Unit:** vitest (`npm test`). **E2e:** Playwright (`npm run test:e2e`), also run in CI by `test.yml` on PRs and on pushes to `main`.
- Keep e2e green before merging. The `webServer` command in `playwright.config.ts` must keep `--ignore-lock` (see *Toolchain*).

## Security posture of the workflows

The workflows are hardened — keep them that way:

- Third-party actions pinned to commit SHAs (not tags), with inline version markers (`# vX.Y.Z`) that Dependabot reads. `publish-devto` is the exception: it is pinned to a commit on its `main` branch (`# main (PR 40, node24)`), because the Node 24 fix has no release tag. Dependabot can still open a PR that moves it to a newer `main` commit; review any new SHA by hand before you merge it, and update the marker comment.
- Default-deny workflow permissions; least-privilege per job (e.g. the cross-post job's `GITHUB_TOKEN` is read-only; its writes use `CROSSPOST_PAT`).
- Job timeouts + concurrency groups to prevent races.
- `.github/dependabot.yml` auto-PRs weekly action + npm updates. Dependabot alerts and security updates are also on in the repo settings.

Do not relax any of this. Pin every new third-party action to a SHA.

## Things deliberately *not* set up

- **Hashnode cross-posting.** Their publish flow moved to a paid tier; evaluated and skipped. Don't re-add unless the user explicitly changes their mind on cost.
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
- An auto-merge PR `chore(crosspost): dev.to writeback + tag restore` squash-merges into `main` and writes the dev.to `id` and `date` back. So far auto-merge has failed on this PR (#67), so check that it merged, then `git pull` before doing further work.
