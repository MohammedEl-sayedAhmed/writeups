# Architecture

writeups is a static blog. Posts are Markdown files in the repo. Astro turns them into plain HTML, and Cloudflare Pages serves that HTML. GitHub Actions run the tests, copy each post to dev.to, and send webmentions. Pushes to `main` start all of this. Nothing runs on a server of its own.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/overview-dark.svg">
  <img src="diagrams/overview.svg" alt="System context: the repository, Cloudflare Pages, GitHub Actions, and the outside services" width="100%">
</picture>

## 1. System context

The repo on GitHub is the center. Cloudflare Pages builds and hosts the site. GitHub Actions talk to dev.to and to other sites. Two outside services are called while the site builds. Giscus runs in the reader's browser.

```mermaid
flowchart LR
    author([Author])
    reader([Reader])

    subgraph GitHub
        repo["Repository<br/>posts in src/content/blog/"]
        actions["GitHub Actions<br/>test, crosspost, send-webmentions"]
    end

    cf["Cloudflare Pages<br/>build and host"]
    devto["dev.to"]
    wmio["webmention.io"]
    targets["Linked sites<br/>webmention endpoints"]
    giscus["Giscus<br/>comments"]

    author -->|PR, merge| repo
    repo -->|Git integration| cf
    repo -->|push, PR| actions
    cf -->|"mammar.pages.dev"| reader
    cf -.->|"build: article URL"| devto
    cf -.->|"build: mentions"| wmio
    actions -->|publish, update| devto
    actions -->|send webmentions| targets
    reader -.->|"browser: comments"| giscus
```

- Cloudflare Pages builds every branch. `main` goes to production at <https://mammar.pages.dev>. Other branches get a preview. The "Cloudflare Pages" check on a PR shows that the integration works.
- Both build-time calls (dev.to and webmention.io) fall back to a default when they fail. A failed call never fails the build.

## 2. Publishing a post

Every change goes through a PR. The workflows start after the merge.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/publish-flow-dark.svg">
  <img src="diagrams/publish-flow.svg" alt="Publishing flow: pull request, merge, then Cloudflare Pages, dev.to and webmentions" width="100%">
</picture>

The same flow, step by step:

```mermaid
sequenceDiagram
    autonumber
    actor Author
    participant GH as GitHub
    participant CI as test.yml
    participant CF as Cloudflare Pages
    participant XP as crosspost.yml
    participant DT as dev.to
    participant WM as send-<br/>webmentions.yml

    Author->>GH: Open PR with the post
    GH->>CI: Run unit and e2e
    GH->>CF: Build a preview
    CI-->>GH: Required checks pass
    Author->>GH: Merge to main
    GH->>CF: Build and deploy production
    GH->>XP: Push touches a post
    Note over XP: Work branch crosspost/devto-RUN_ID,<br/>swap tags
    XP->>DT: Publish or update the article
    DT-->>XP: Article id
    Note over XP: Restore tags and date
    XP->>GH: Open write-back PR with auto-merge
    GH->>CI: Run unit and e2e on the write-back PR
    Note over GH: Auto-merge when checks pass
    GH->>WM: Push touches a post
    Note over WM: Wait 90 seconds for the deploy,<br/>send a webmention for each outgoing link
```

- The write-back commit message starts with `chore(crosspost):`. `crosspost.yml` skips pushes with that prefix, so it does not loop.
- The write-back PR carries the dev.to `id` and the `date` back to `main`. The next run then updates the same article.
- `send-webmentions.yml` also starts on the write-back merge, because that merge touches a post.

## 3. The build

`npm run build` runs `astro build` and then Pagefind.

```mermaid
flowchart LR
    subgraph Inputs
        md["Posts<br/>src/content/blog/*.md"]
        schema["Zod schema<br/>src/content.config.ts"]
        pages["Pages, layouts, components<br/>src/pages, src/layouts, src/components"]
    end

    subgraph Build["npm run build"]
        astro["astro build"]
        og["satori + resvg-js<br/>og/slug.png"]
        pf["pagefind"]
    end

    subgraph Outputs["dist/"]
        html["Static HTML"]
        ogimg["OG images"]
        feeds["rss.xml<br/>sitemap-index.xml"]
        idx["pagefind/<br/>search index"]
    end

    devto["dev.to API"]
    wmio["webmention.io API"]

    md --> astro
    schema -->|validates frontmatter| astro
    pages --> astro
    astro --> html
    astro --> feeds
    astro --> og --> ogimg
    html --> pf --> idx
    devto -.->|"article URL<br/>fallback: dev.to/mammar"| astro
    wmio -.->|"mentions<br/>token optional"| astro
```

- Astro checks each post's frontmatter against the Zod schema. A bad field fails the build.
- `src/lib/devto.ts` looks up the article URL from the `id` in the frontmatter. It times out after 5 seconds and falls back to `https://dev.to/mammar`.
- `src/lib/webmentions.ts` reads mentions from webmention.io. `WEBMENTION_IO_TOKEN` is optional. A failed call gives an empty list.

## 4. In the browser

The site ships as static files. A few scripts add behavior on top.

```mermaid
flowchart LR
    page["Static page"]
    page --> theme["Theme<br/>dark default, header toggle,<br/>saved in localStorage"]
    page --> search["Search<br/>Pagefind modal, Cmd/Ctrl-K"]
    page --> nav["View transitions<br/>ClientRouter"]
    page --> post["Post page"]
    post --> comments["Comments<br/>Giscus"]
    post --> reading["TOC, reading progress,<br/>copy-code, scroll-to-top"]
    post --> social["Share sheet,<br/>related posts"]
```

- Search loads the Pagefind index from `/pagefind/` on first use.
- Giscus loads its script from giscus.app when the comments area is near the viewport. It takes the theme from the page. When the page has no saved theme, it uses the OS setting. See the weak spots below.

## 5. Workflows

All workflows are in `.github/workflows/`. Each workflow sets `permissions: {}` at the top. The jobs add only what they need.

| Workflow | Trigger | What it does | Secrets | Job permissions |
|---|---|---|---|---|
| `test.yml` | PR to `main`, push to `main` | `unit` runs Vitest. `e2e` builds the site and runs Playwright. | none | none |
| `crosspost.yml` | Push to `main` that touches `src/content/blog/**`, or manual | Publishes or updates the post on dev.to. Opens a write-back PR with auto-merge. | `DEVTO_TOKEN`, `CROSSPOST_PAT` | `contents: write` |
| `send-webmentions.yml` | Push to `main` that touches `src/content/blog/**` | Sends outgoing webmentions for each post. | none | none |
| `diagnose-devto.yml` | Manual | Repeats one dev.to publish call and prints the response. | `DEVTO_TOKEN` | `contents: read` |

Other settings:

- Dependabot checks npm and GitHub Actions weekly. Dependabot alerts and security updates are on.
- `main` needs a PR. The required checks are `unit` and `e2e`, and the branch must be up to date. History is linear. Admins can bypass these rules.
- `crosspost.yml` opens its PR with `CROSSPOST_PAT`, not `GITHUB_TOKEN`. A PR opened by `GITHUB_TOKEN` does not start `test.yml`, so the required checks would never run.

## 6. Known weak spots

These are tracked in the issues below.

- Cross-post: the auto-merge step fails. Tracked in [#67](https://github.com/MohammedEl-sayedAhmed/writeups/issues/67).
- Cross-post: `sinedied/publish-devto` is pinned to a tag that runs on Node 16. Tracked in [#68](https://github.com/MohammedEl-sayedAhmed/writeups/issues/68).
- Astro is pinned at 7.1.1, which has a critical advisory. Tracked in [#70](https://github.com/MohammedEl-sayedAhmed/writeups/issues/70).
- CI has no type check, no lint and no coverage report. Tracked in [#71](https://github.com/MohammedEl-sayedAhmed/writeups/issues/71).
- The Giscus theme can follow the OS setting, so comments can show in the light theme on the dark site. Tracked in [#73](https://github.com/MohammedEl-sayedAhmed/writeups/issues/73).
