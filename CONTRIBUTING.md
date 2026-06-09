# Contributing

Thanks for your interest in improving WCAG Checker! This is a small, focused tool and contributions are welcome.

## Getting set up

```bash
git clone https://github.com/sammierosado/wcag-checker.git
cd wcag-checker
npm install      # downloads Chromium + veraPDF (one-time, ~150MB)
npm start        # http://localhost:5173
```

You'll need **Node 18+** and **Java 11+** (Java is only required for PDF scanning).

## Project layout

| Path | Purpose |
|------|---------|
| `server.js` | Express server + `/scan-url`, `/scan-html`, `/scan-pdf`, `/report` endpoints |
| `lib/scanWeb.js` | axe-core via Playwright (URL + HTML) |
| `lib/scanPdf.js` | veraPDF subprocess wrapper + PDF/UA → WCAG mapping |
| `lib/report.js` | self-contained HTML report generator |
| `public/` | single-page UI |
| `scripts/install-verapdf.js` | postinstall: downloads veraPDF |

Both scanners normalize their output to one shared JSON shape so the UI and report generator don't care which engine produced the result.

## Good first contributions

- **Tighter PDF/UA → WCAG mapping** — `lib/scanPdf.js` currently uses a coarse clause-prefix map. The [Matterhorn Protocol 1.1](https://pdfa.org/resource/the-matterhorn-protocol/) is the reference.
- **Extra report formats** — CSV issue list, formal PDF.
- **Better remediation guidance** per rule in the report output.
- **Batch scanning** — accept a list of URLs.

## Pull requests

1. Fork and create a branch (`git checkout -b my-change`).
2. Keep changes focused; match the existing code style (plain CommonJS, no build step).
3. Test all three scan types (URL, HTML, PDF) still work before opening the PR.
4. Describe what you changed and why.

## Reporting bugs

Open an [issue](https://github.com/sammierosado/wcag-checker/issues) with steps to reproduce, the input that triggered it (URL/snippet/PDF), and what you expected vs. what happened.

## Scope

This tool is an **automated first pass** — it catches roughly 30–50% of accessibility issues. It is not a replacement for manual keyboard and screen-reader testing, and PRs should not imply otherwise in user-facing copy.
