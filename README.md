# Suzuki Service Manual PDF Printer

Downloads all pages of a Suzuki service manual from the [Suzuki Service Portal](https://serviceportal.suzuki.eu) as PDFs, organized into a browsable directory structure with HTML index files.

The vehicle and manual are determined by the `MANUAL_URL` in your `.env` file — works with any manual available on the portal.

## Prerequisites

- **Node.js** >= 18 (tested with 20+)
- **Google Chrome** installed at `/Applications/Google Chrome.app` (macOS)
- A valid account on [Suzuki Service Portal](https://serviceportal.suzuki.eu/isoportal/login)

> On Linux/Windows, update `executablePath` in `print-manual.js` to point to your Chrome binary.
> Common paths:
> - Linux: `/usr/bin/google-chrome` or `/usr/bin/chromium-browser`
> - Windows: `C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe`

## Setup

```bash
# Install dependencies
npm install

# Install Chrome for Puppeteer (if not already present)
npx puppeteer browsers install chrome

# Create your environment file
cp .env.example .env
```

Edit `.env` with your Suzuki Service Portal credentials:

```
MANUAL_URL=https://serviceportal.suzuki.eu/isoportal/files/manuals/SVG/AENER70A/index.html
USERNAME=your_email@example.com
PASSWORD=your_password
```

## Usage

### Print all pages (headless)

```bash
npm run print
```

Runs Chrome in headless mode. Progress is printed to the terminal. The browser closes automatically when done.

### Debug mode (visible browser)

```bash
npm run debug
```

Opens a real Chrome window so you can watch what the script does. The browser stays open after completion or on errors so you can inspect the state.

### Resume from a specific page

```bash
node print-manual.js --from=50
```

Skips pages 1–49. Useful if the script was interrupted. Pages that already exist on disk are also skipped automatically, so you can safely re-run without `--from` and it will pick up where it left off.

### Re-download everything

```bash
rm -rf pdfs
npm run print
```

## Output

PDFs are saved to `pdfs/` in a directory structure mirroring the manual's navigation tree:

```
pdfs/
├── index.html                        ← root browsable index
├── FOREWORD/
│   ├── index.html
│   ├── 0001_IMPORTANT.pdf
│   └── 0002_FOREWORD.pdf
├── 00___Precautions/
│   ├── index.html
│   └── 00___Precautions/
│       └── Precautions/
│           ├── index.html
│           └── 0007_Precautions_for_....pdf
├── 1___Engine/
│   ├── index.html
│   ├── 1A___Engine_General/
│   └── 1B___Emission_Control/
└── ...
```

Each directory has an `index.html` with links to sub-sections and PDFs. Host the whole `pdfs/` folder on S3 or any static file server for easy browsing.

A `manifest.json` is also generated with metadata for all pages (title, sieId, breadcrumb, file paths).

## How it works

1. **Login** — Navigates to the portal login page and submits credentials
2. **Load frameset** — Opens the service manual URL which contains a multi-frame layout (NAVI for navigation, MAIN for content)
3. **Expand navigation** — Clicks through all collapsed sections in the NAVI frame to reveal every page link (~330 expansion rounds)
4. **Collect pages** — Extracts all page entries with their sieId, title, and breadcrumb path
5. **Print loop** — For each page, clicks its navigation link, waits for content to load in MAIN, then prints to PDF:
   - **HTM pages** (like FOREWORD): MAIN frame navigates to a `.htm` URL → opened in a new tab and printed
   - **XSLT pages** (most manual sections): Content loaded via XML + XSLT transformation into MAIN frame without URL change → HTML extracted from MAIN, `<base>` tag injected, rendered in a new tab, and printed

## Troubleshooting

### Puppeteer can't find Chrome

The script uses your installed Chrome (not Puppeteer's bundled Chromium). If Chrome isn't found:

```bash
# Ensure Chrome is installed for Puppeteer
npx puppeteer browsers install chrome
```

If you still get errors, verify `executablePath` in `print-manual.js` points to your Chrome binary.

### Login fails / wrong credentials

- Double-check your `.env` file has the correct `USERNAME` and `PASSWORD`
- Run `npm run debug` to watch the login — you'll see if the form submission fails
- If the portal changed its login page, verify the form field IDs (`#user_name`, `#password`, `button[name="Submit"]`) match

### NAVI frame did not populate (timeout after 60s)

The navigation tree is loaded via XSLT into an iframe. If this times out:

- Your credentials may be wrong — run `npm run debug` to check
- The portal may be down or slow — try again later
- The portal may limit concurrent sessions — close other browser tabs on the portal

### Pages skipped / "content did not load"

Some pages may fail to load if:

- The portal rate-limits requests — increase `EXPAND_WAIT_MS` in `print-manual.js` (default: 600ms)
- The NAVI frame becomes stale — restart the script, existing PDFs will be skipped

Re-running the script is always safe; it picks up where it left off.

### PDFs are blank or have wrong content

Run with `npm run debug` and watch the MAIN frame. The script clicks nav links and waits for either:
- The MAIN frame URL to change (HTM pages), or
- A specific DOM element matching the page ID to appear (XSLT pages)

If content appears visually in the browser but isn't detected, the DOM structure may have changed. Check the element IDs in the MAIN frame match the sieId from the manifest.

### Script is slow

Each page takes ~2-4 seconds (navigate + render + print). For a typical manual with ~1200 pages, expect ~1–1.5 hours. The script prints progress so you can monitor it. If interrupted, re-run and it skips completed pages.
