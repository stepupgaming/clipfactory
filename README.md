# ClipFactory — public site

The public face of **ClipFactory**: local-first vertical video clipping
(transcript-first selection, multi-beat FFmpeg rendering, deterministic QA
gates) plus Editing DNA style transfer.

- **Live site:** https://stepupgaming.github.io/clipfactory/
- **What's here:** a dependency-free static page (`index.html`, `styles.css`,
  `app.js`) with an in-browser transcript-to-clips demo. No build step, no
  backend, no data leaves the visitor's browser.
- **Source of truth:** the page source lives in the private engine repo
  (`site/`) and is mirrored here for publishing.
- **Engine access:** the clipping engine is in private beta. To request
  access, [open an issue](../../issues/new).

## Preview locally

```sh
python -m http.server -d . 8000
# open http://127.0.0.1:8000/
```

## Deploy

Pushing to `main` redeploys via `.github/workflows/pages.yml` (GitHub Pages,
`github-pages` environment).

**Safety clause:** ClipFactory never joins a campaign, posts, submits, spends
money, or mutates an account. Everything stops at local render; publishing is
a human act.
