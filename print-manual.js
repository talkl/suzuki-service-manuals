require('dotenv').config();
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// ======================== CONFIGURATION ========================
const LOGIN_URL = 'https://serviceportal.suzuki.eu/isoportal/login';
const MANUAL_URL = process.env.MANUAL_URL;
const USERNAME = process.env.USERNAME;
const PASSWORD = process.env.PASSWORD;

const OUTPUT_DIR = path.join(__dirname, 'pdfs');
const MANIFEST_PATH = path.join(__dirname, 'manifest.json');

const DEBUG = process.argv.includes('--debug');
const RESUME_FROM = parseInt(process.argv.find((a) => a.startsWith('--from='))?.split('=')[1] || '0', 10);
const EXPAND_WAIT_MS = 600;
const MANUAL_BASE = MANUAL_URL ? MANUAL_URL.replace(/\/[^/]*$/, '') : '';
// ===============================================================

function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function _safeName(str) {
  return str
    .replace(/[^a-zA-Z0-9\-_ ]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 80);
}

function _safeDirName(str) {
  return str
    .replace(/[^a-zA-Z0-9\-_ ]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 60);
}

function _buildTree(pages) {
  const root = { name: 'Jimny SN413 Service Manual', children: {}, pages: [] };
  for (const page of pages) {
    const parts = page.breadcrumb ? page.breadcrumb.split(' > ') : [];
    let node = root;
    for (const part of parts) {
      const key = _safeDirName(part);
      if (!node.children[key]) {
        node.children[key] = { name: part, children: {}, pages: [] };
      }
      node = node.children[key];
    }
    node.pages.push(page);
  }
  return root;
}

function _generateIndex(node, dirPath, relativePath) {
  const lines = [
    '<!DOCTYPE html>',
    '<html><head>',
    '<meta charset="utf-8">',
    `<title>${node.name}</title>`,
    '<style>',
    '  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; }',
    '  h1 { color: #003399; border-bottom: 2px solid #003399; padding-bottom: 10px; }',
    '  .breadcrumb { color: #666; margin-bottom: 20px; font-size: 14px; }',
    '  .breadcrumb a { color: #003399; text-decoration: none; }',
    '  .section { margin: 6px 0; padding: 8px 12px; background: #f0f4ff; border-radius: 4px; }',
    '  .section a { color: #003399; text-decoration: none; font-weight: 600; font-size: 15px; }',
    '  .page { margin: 4px 0; padding: 6px 12px 6px 24px; }',
    '  .page a { color: #1a1a1a; text-decoration: none; font-size: 14px; }',
    '  .page a:hover, .section a:hover { text-decoration: underline; }',
    '  .count { color: #888; font-size: 13px; }',
    '</style>',
    '</head><body>'
  ];

  // Breadcrumb navigation
  if (relativePath) {
    const crumbs = relativePath.split('/').filter(Boolean);
    lines.push('<div class="breadcrumb"><a href="' + '../'.repeat(crumbs.length) + 'index.html">Home</a>');
    for (let i = 0; i < crumbs.length - 1; i++) {
      lines.push(' / <a href="' + '../'.repeat(crumbs.length - i - 1) + 'index.html">' + crumbs[i] + '</a>');
    }
    lines.push('</div>');
  }

  lines.push(`<h1>${node.name}</h1>`);

  // Sub-sections
  const childKeys = Object.keys(node.children);
  if (childKeys.length > 0) {
    for (const key of childKeys) {
      const child = node.children[key];
      const totalPages = _countPages(child);
      lines.push(
        `<div class="section"><a href="${key}/index.html">${child.name}</a> <span class="count">(${totalPages} pages)</span></div>`
      );
    }
  }

  // Pages in this directory
  if (node.pages.length > 0) {
    for (const page of node.pages) {
      lines.push(`<div class="page"><a href="${page.filename}">${page.title}</a></div>`);
    }
  }

  lines.push('</body></html>');

  fs.writeFileSync(path.join(dirPath, 'index.html'), lines.join('\n'));
}

function _countPages(node) {
  let count = node.pages.length;
  for (const key of Object.keys(node.children)) {
    count += _countPages(node.children[key]);
  }
  return count;
}

function _generateAllIndexes(node, dirPath, relativePath) {
  fs.mkdirSync(dirPath, { recursive: true });
  _generateIndex(node, dirPath, relativePath);
  for (const key of Object.keys(node.children)) {
    _generateAllIndexes(node.children[key], path.join(dirPath, key), relativePath ? `${relativePath}/${key}` : key);
  }
}

function _log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

async function _expandAllSections(naviFrame) {
  let round = 0;
  const maxRounds = 2000;
  // All section classes in the tree: sct (top), sc (sub), sit (sub-sub)
  const SECTION_SELECTOR = 'div.sct img.mark[src*="closed"], div.sc img.mark[src*="closed"], div.sit img.mark[src*="closed"]';

  while (round < maxRounds) {
    round++;

    const closedCount = await naviFrame.evaluate((sel) => {
      let visible = 0;
      document.querySelectorAll(sel).forEach((icon) => {
        if (icon.offsetParent !== null) visible++;
      });
      return visible;
    }, SECTION_SELECTOR);

    if (closedCount === 0) break;

    if (round % 20 === 1) {
      const totalSie = await naviFrame.evaluate(() => document.querySelectorAll('div.sie').length).catch(() => 0);
      _log(`  Round ${round}: ${closedCount} collapsed, ${totalSie} pages found so far`);
    }

    await naviFrame.evaluate((sel) => {
      const icons = document.querySelectorAll(sel);
      for (const icon of icons) {
        if (icon.offsetParent !== null) {
          const section = icon.closest('div.sct') || icon.closest('div.sc') || icon.closest('div.sit');
          if (section) {
            const parentLink = section.closest('a');
            if (parentLink) parentLink.click();
            else section.click();
            return;
          }
        }
      }
    }, SECTION_SELECTOR);

    // Sub-sections lazy-load ("Loading...") - need time for XHR + XSLT
    await _sleep(EXPAND_WAIT_MS);
  }

  const totalSie = await naviFrame.evaluate(() => document.querySelectorAll('div.sie').length).catch(() => 0);
  _log(`  Expansion complete after ${round} rounds, ${totalSie} pages found`);
}

async function _waitForMainContent(page, urlBefore, sieId, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await _sleep(500);
    const mainFrame = page.frames().find((f) => f.name() === 'MAIN');
    if (!mainFrame) continue;

    // Check 1: URL changed (HTM pages like FOREWORD)
    const url = mainFrame.url();
    if (url && url !== urlBefore && url !== 'about:blank') {
      const ready = await mainFrame
        .evaluate(() => document.readyState === 'complete' && document.body && document.body.innerHTML.length > 100)
        .catch(() => false);
      if (ready) return { type: 'url', url };
    }

    // Check 2: Target element appeared via XSLT (URL stays the same)
    const hasTarget = await mainFrame
      .evaluate((id) => {
        const el = document.getElementById(id);
        return el && el.innerHTML.length > 50;
      }, sieId)
      .catch(() => false);
    if (hasTarget) {
      await _sleep(2000);
      return { type: 'xslt' };
    }
  }
  return null;
}

async function _waitForImages(pageOrFrame) {
  await pageOrFrame
    .evaluate(async () => {
      const imgs = Array.from(document.querySelectorAll('img'));
      await Promise.all(
        imgs.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = resolve;
              })
        )
      );
    })
    .catch(() => {});
}

async function _printToPdf(cdpSession, outputPath) {
  const { data } = await cdpSession.send('Page.printToPDF', {
    printBackground: true,
    paperWidth: 8.27,
    paperHeight: 11.69,
    marginTop: 0.4,
    marginBottom: 0.4,
    marginLeft: 0.4,
    marginRight: 0.4,
    preferCSSPageSize: true
  });
  fs.writeFileSync(outputPath, Buffer.from(data, 'base64'));
}

async function _printViaUrl(browser, contentUrl, outputPath) {
  const printPage = await browser.newPage();
  try {
    await printPage.goto(contentUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await _waitForImages(printPage);
    const cdp = await printPage.createCDPSession();
    await _printToPdf(cdp, outputPath);
  } finally {
    await printPage.close();
  }
}

async function _printViaHtmlExtract(browser, page, sieId, outputPath) {
  const mainFrame = page.frames().find((f) => f.name() === 'MAIN');
  if (!mainFrame) throw new Error('MAIN frame not found');

  const html = await mainFrame.content();
  const baseHref = `${MANUAL_BASE}/${sieId}/`;
  const htmlWithBase = html.replace(/<head([^>]*)>/i, `<head$1><base href="${baseHref}">`);

  const printPage = await browser.newPage();
  try {
    // Navigate to an HTML page on the same origin so document.open() works and images load.
    // The XML URL won't work (XML docs don't support document.open).
    await printPage.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});

    // Replace the document content. document.write inherits the page's origin.
    await printPage.evaluate((content) => {
      document.open();
      document.write(content);
      document.close();
    }, htmlWithBase);

    // Wait for images and SVGs to load
    await _sleep(3000);
    await _waitForImages(printPage);

    const cdp = await printPage.createCDPSession();
    await _printToPdf(cdp, outputPath);
  } finally {
    await printPage.close();
  }
}

async function _main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  _log('Suzuki Jimny Service Manual PDF Printer');
  _log(`Debug: ${DEBUG} | Output: ${OUTPUT_DIR}`);
  if (RESUME_FROM > 0) _log(`Resuming from page ${RESUME_FROM}`);

  if (!USERNAME || !PASSWORD || !MANUAL_URL) {
    console.error('\nMissing environment variables. Copy .env.example to .env and fill in your credentials:');
    console.error('  cp .env.example .env\n');
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: DEBUG ? false : 'new',
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    defaultViewport: { width: 1400, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    slowMo: DEBUG ? 50 : 0
  });

  const page = await browser.newPage();

  // Capture browser console and errors so we can see what JS is doing
  page.on('console', (msg) => _log(`[BROWSER] ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', (err) => _log(`[BROWSER ERROR] ${err.message}`));
  page.on('requestfailed', (req) => _log(`[REQUEST FAILED] ${req.url()} - ${req.failure()?.errorText}`));
  page.on('framenavigated', (frame) => _log(`[FRAME NAV] ${frame.name() || '(top)'} -> ${frame.url().slice(0, 100)}`));

  // Step 0: Log in
  _log('Logging in...');
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.type('#user_name', USERNAME);
  await page.type('#password', PASSWORD);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }), page.click('button[name="Submit"]')]);
  _log(`Logged in, redirected to: ${page.url()}`);

  // Navigate to the service manual
  _log('Navigating to service manual...');
  await page.goto(MANUAL_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Log all frame URLs right after load
  const initialFrames = page.frames();
  _log(`Frames after load:`);
  for (const f of initialFrames) {
    _log(`  ${f.name() || '(top)'} -> ${f.url()}`);
  }

  // The NAVI frame stays at about:blank but gets content via document.write()
  // from the XSLT processor. Check for actual DOM content, not URL change.
  _log('Waiting for NAVI frame to be populated by JS...');
  let naviFrame = null;
  let mainFrame = null;

  for (let attempt = 0; attempt < 60; attempt++) {
    await _sleep(1000);

    const allFrames = page.frames();
    const navi = allFrames.find((f) => f.name() === 'NAVI');
    const main = allFrames.find((f) => f.name() === 'MAIN');

    if (!navi || !main) continue;

    const sectionCount = await navi
      .evaluate(() => {
        return document.querySelectorAll('div.sct, div.sc, div.sie').length;
      })
      .catch(() => 0);

    if (sectionCount > 0) {
      _log(`  NAVI has content: ${sectionCount} elements found`);
      naviFrame = navi;
      mainFrame = main;
      break;
    }

    if (attempt % 5 === 0) _log(`  Still waiting... (${attempt}s)`);
  }

  if (!naviFrame || !mainFrame) {
    const allFrames = page.frames();
    _log(`Frames found: ${allFrames.map((f) => `${f.name()}(${f.url().slice(0, 60)})`).join(', ')}`);
    console.error('NAVI frame did not populate within 60 seconds.');
    if (DEBUG) {
      _log('Browser left open for debugging. Press Ctrl+C to exit.');
      await new Promise(() => {});
    } else {
      await browser.close();
      process.exit(1);
    }
  }

  _log('Navigation tree loaded');
  await _sleep(2000);

  // Step 2: Expand all sections
  _log('Expanding all sections...');
  await _expandAllSections(naviFrame);

  // Step 3: Collect all page links
  _log('Collecting page links...');
  const pages = await naviFrame.evaluate(() => {
    const items = [];
    document.querySelectorAll('div.sie').forEach((el) => {
      if (el.id && el.offsetParent !== null) {
        const sieId = el.id.replace(/^sie/, '');
        const parentLink = el.closest('a');
        const hrefMatch = parentLink?.href?.match(/loadSIE\(['"]([^'"]+)['"]\)/);
        const loadId = hrefMatch ? hrefMatch[1] : sieId;

        const breadcrumb = [];
        let container = el.closest('a')?.parentElement;
        while (container && container.tagName !== 'BODY') {
          const prev = container.previousElementSibling;
          if (prev) {
            const sectionDiv = prev.querySelector('div.sct, div.sc, div.sit');
            if (sectionDiv) {
              const img = sectionDiv.querySelector('img.mark');
              const text = img ? img.nextSibling?.textContent?.trim() : sectionDiv.textContent.trim();
              if (text) breadcrumb.unshift(text);
            }
          }
          container = container.parentElement;
        }

        items.push({
          id: el.id,
          sieId: loadId,
          title: el.textContent.trim(),
          breadcrumb: breadcrumb.join(' > ')
        });
      }
    });
    return items;
  });

  // Compute directory path and filename for each page
  for (let i = 0; i < pages.length; i++) {
    const entry = pages[i];
    const parts = entry.breadcrumb ? entry.breadcrumb.split(' > ').map(_safeDirName) : [];
    const filename = `${String(i + 1).padStart(4, '0')}_${_safeName(entry.title)}.pdf`;
    entry.dirParts = parts;
    entry.filename = filename;
    entry.dirPath = path.join(OUTPUT_DIR, ...parts);
    entry.outputPath = path.join(OUTPUT_DIR, ...parts, filename);
  }

  _log(`Found ${pages.length} pages to print`);
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(pages, null, 2));
  _log(`Manifest saved to ${MANIFEST_PATH}`);

  if (pages.length === 0) {
    console.error('No pages found. Navigation tree may not have loaded.');
    if (DEBUG) {
      _log('Browser left open for debugging. Press Ctrl+C to exit.');
      await new Promise(() => {});
    } else {
      await browser.close();
      process.exit(1);
    }
  }

  // Create directory structure and index files
  const tree = _buildTree(pages);
  _generateAllIndexes(tree, OUTPUT_DIR, '');
  _log('Index files generated');

  // Step 4: Print each page to PDF via loadSIE
  const errors = [];

  for (let i = 0; i < pages.length; i++) {
    const entry = pages[i];
    const pageNum = i + 1;
    const progress = `[${pageNum}/${pages.length}]`;

    if (pageNum < RESUME_FROM) continue;

    fs.mkdirSync(entry.dirPath, { recursive: true });

    if (fs.existsSync(entry.outputPath)) {
      _log(`${progress} SKIP (exists): ${entry.title}`);
      continue;
    }

    _log(`${progress} ${entry.breadcrumb ? entry.breadcrumb + ' > ' : ''}${entry.title}`);

    try {
      // Re-acquire frames each iteration to avoid stale references
      const currentNavi = page.frames().find((f) => f.name() === 'NAVI');
      if (!currentNavi) throw new Error('NAVI frame lost');
      const currentMain = page.frames().find((f) => f.name() === 'MAIN');
      const urlBefore = currentMain?.url() || '';

      // Click the link element to trigger loadSIE in the frame's native JS context
      await currentNavi.evaluate((elId) => {
        const el = document.getElementById(elId);
        if (el) {
          el.scrollIntoView({ block: 'center' });
          const link = el.closest('a');
          if (link) link.click();
          else el.click();
        }
      }, entry.id);

      // Wait for content: either URL change (HTM) or DOM element (XSLT)
      const result = await _waitForMainContent(page, urlBefore, entry.sieId);

      if (!result) {
        _log('  -> Skip: content did not load');
        continue;
      }

      if (result.type === 'url') {
        if (DEBUG) _log(`  -> HTM: ${result.url}`);
        await _printViaUrl(browser, result.url, entry.outputPath);
      } else {
        if (DEBUG) _log(`  -> XSLT: extracted from MAIN frame`);
        await _printViaHtmlExtract(browser, page, entry.sieId, entry.outputPath);
      }
      _log(`  -> Saved: ${entry.dirParts.join('/')}/${entry.filename}`);
    } catch (err) {
      _log(`  -> Error: ${err.message}`);
      errors.push({ pageNum, title: entry.title, error: err.message });
    }
  }

  // Regenerate indexes now that PDFs exist (same structure, no change needed)
  console.log('\n' + '='.repeat(60));
  _log(`Done! ${pages.length - errors.length}/${pages.length} pages saved to ${OUTPUT_DIR}`);
  if (errors.length > 0) {
    _log(`${errors.length} errors:`);
    errors.forEach((e) => _log(`  #${e.pageNum} "${e.title}": ${e.error}`));
  }

  if (DEBUG) {
    _log('Browser left open for debugging. Press Ctrl+C to exit.');
    await new Promise(() => {});
  } else {
    await browser.close();
  }
}

_main().catch(async (err) => {
  console.error('Fatal error:', err.message);
  if (DEBUG) {
    _log('Browser left open for debugging. Press Ctrl+C to exit.');
    await new Promise(() => {});
  } else {
    process.exit(1);
  }
});
