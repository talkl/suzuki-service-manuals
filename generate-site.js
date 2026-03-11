#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const MANIFEST_PATH = path.join(__dirname, 'manifest.json');
const PDFS_DIR = path.join(__dirname, 'pdfs');
const OUTPUT_HTML = path.join(PDFS_DIR, 'index.html');

if (!fs.existsSync(MANIFEST_PATH)) {
  console.error('manifest.json not found. Run `npm run print` first.');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

// Strip absolute paths — make relative to pdfs/
const PDFS_PREFIX = PDFS_DIR + path.sep;
const entries = manifest.map(e => ({
  id: e.id,
  title: e.title,
  dirParts: e.dirParts,
  path: e.outputPath.replace(PDFS_PREFIX, '').replace(/\\/g, '/'),
}));

const entriesJSON = JSON.stringify(entries);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Suzuki Jimny SN413 – Service Manual</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --sidebar-w: 300px;
  --header-h: 50px;
  --bg-app:     #12151c;
  --bg-sidebar: #181c27;
  --bg-item:    #1f2435;
  --bg-hover:   #282e42;
  --border:     #252b3b;
  --red:        #c0392b;
  --red-dim:    #7a201a;
  --txt:        #dde2f0;
  --txt-dim:    #7882a0;
  --txt-xs:     #50596e;
}
html, body { height: 100%; overflow: hidden; }
body {
  display: flex; flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--bg-app); color: var(--txt);
}

/* ── HEADER ─────────────────────────────────── */
#header {
  height: var(--header-h);
  background: var(--bg-app);
  border-bottom: 2px solid var(--red);
  display: flex; align-items: center;
  padding: 0 16px; gap: 10px; flex-shrink: 0; z-index: 10;
}
.logo-mark {
  display: flex; align-items: center; gap: 8px; flex-shrink: 0;
}
.logo-s {
  background: var(--red); color: white;
  font-size: 13px; font-weight: 900;
  width: 26px; height: 26px; border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  letter-spacing: -1px;
}
.logo-text { font-size: 14px; font-weight: 600; color: var(--txt); white-space: nowrap; }
.logo-text span { color: var(--txt-dim); font-weight: 400; }
#header-path {
  flex: 1; font-size: 11px; color: var(--txt-xs);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 0 8px;
}
#result-count { font-size: 11px; color: var(--txt-xs); white-space: nowrap; flex-shrink: 0; }

/* ── LAYOUT ──────────────────────────────────── */
#layout { display: flex; flex: 1; overflow: hidden; }

/* ── SIDEBAR ─────────────────────────────────── */
#sidebar {
  width: var(--sidebar-w);
  background: var(--bg-sidebar);
  display: flex; flex-direction: column;
  border-right: 1px solid var(--border);
  flex-shrink: 0;
}
#search-wrap { padding: 10px 10px 8px; border-bottom: 1px solid var(--border); }
#search {
  width: 100%;
  background: var(--bg-item);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 7px 10px 7px 30px;
  color: var(--txt); font-size: 12.5px; outline: none;
  transition: border-color .15s;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='%237882a0' stroke-width='2.5'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.35-4.35'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: 9px center;
}
#search:focus { border-color: var(--red); }
#search::placeholder { color: var(--txt-xs); }

#tree {
  flex: 1; overflow-y: auto; padding: 6px 0;
  scrollbar-width: thin; scrollbar-color: var(--border) transparent;
}
#tree::-webkit-scrollbar { width: 4px; }
#tree::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

/* tree groups */
.tree-group { }
.tree-header {
  display: flex; align-items: center;
  padding: 6px 10px 6px 6px;
  cursor: pointer; user-select: none; gap: 5px;
  border-radius: 5px; margin: 1px 5px;
  transition: background .1s;
}
.tree-header:hover { background: var(--bg-hover); }
.tree-header.root-hdr {
  font-size: 11px; font-weight: 700;
  color: var(--txt-dim); letter-spacing: .05em; text-transform: uppercase;
}
.tree-header.sub-hdr {
  font-size: 12px; font-weight: 500; color: var(--txt-dim);
}
.tree-header.open { color: var(--txt); }
.chevron {
  width: 13px; height: 13px; flex-shrink: 0; opacity: .55;
  transition: transform .15s;
}
.tree-header.open > .chevron { transform: rotate(90deg); }

.tree-children { display: none; padding-left: 14px; }
.tree-group.open > .tree-children { display: block; }

.cnt { color: var(--txt-xs); font-size: 10px; margin-left: auto; }

/* leaf items */
.tree-item {
  display: block; padding: 5px 10px 5px 18px;
  font-size: 12px; color: var(--txt-dim);
  cursor: pointer; border-radius: 5px; margin: 1px 5px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  line-height: 1.45; transition: background .1s, color .1s;
}
.tree-item:hover { background: var(--bg-hover); color: var(--txt); }
.tree-item.active { background: var(--red); color: #fff; }

/* search results */
.search-result {
  display: block; padding: 8px 10px;
  font-size: 12px; cursor: pointer;
  border-radius: 5px; margin: 2px 5px;
  transition: background .1s;
}
.search-result:hover { background: var(--bg-hover); }
.search-result.active { background: var(--red); }
.sr-title { color: var(--txt); font-weight: 500; line-height: 1.4; }
.sr-path  { color: var(--txt-xs); font-size: 10.5px; margin-top: 2px; }
.search-result.active .sr-path { color: rgba(255,255,255,.6); }
mark { background: rgba(255,220,0,.22); color: inherit; border-radius: 2px; padding: 0 1px; }
.no-results { padding: 30px 16px; text-align: center; color: var(--txt-xs); font-size: 12.5px; }

/* ── RESIZE ──────────────────────────────────── */
#resize-handle {
  width: 4px; background: var(--border); cursor: col-resize; flex-shrink: 0;
  transition: background .15s;
}
#resize-handle:hover, #resize-handle.dragging { background: var(--red); }

/* ── VIEWER ──────────────────────────────────── */
#viewer { flex: 1; display: flex; flex-direction: column; background: #505356; overflow: hidden; }
#viewer-toolbar {
  height: 38px; background: #36393b;
  display: flex; align-items: center; padding: 0 12px; gap: 8px;
  flex-shrink: 0; border-bottom: 1px solid #222;
}
#viewer-title { font-size: 12px; color: #c5c8d0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vbtn {
  background: none; border: 1px solid #555; color: #bbb;
  border-radius: 4px; padding: 3px 8px; font-size: 11px;
  cursor: pointer; text-decoration: none;
  display: inline-flex; align-items: center; gap: 4px;
  transition: background .1s, color .1s;
}
.vbtn:hover { background: #555; color: #fff; }
#prev-btn, #next-btn { font-size: 13px; padding: 2px 7px; }
#nav-indicator { font-size: 11px; color: #666; min-width: 60px; text-align: center; }
#pdf-frame { flex: 1; width: 100%; border: none; }
#welcome {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 14px; color: #777;
}
#welcome-title { font-size: 22px; color: #999; font-weight: 300; letter-spacing: -0.5px; }
#welcome p { font-size: 13px; }
</style>
</head>
<body>

<div id="header">
  <div class="logo-mark">
    <div class="logo-s">S</div>
    <div class="logo-text">Jimny SN413 <span>Service Manual</span></div>
  </div>
  <div id="header-path"></div>
  <div id="result-count"></div>
</div>

<div id="layout">
  <div id="sidebar">
    <div id="search-wrap">
      <input id="search" type="search" placeholder="Search ${entries.length} pages…" autocomplete="off" spellcheck="false">
    </div>
    <div id="tree"></div>
  </div>
  <div id="resize-handle"></div>
  <div id="viewer">
    <div id="viewer-toolbar">
      <span id="viewer-title">Select a page from the index</span>
      <button id="prev-btn" class="vbtn" style="display:none" title="Previous page">‹</button>
      <span id="nav-indicator" style="display:none"></span>
      <button id="next-btn" class="vbtn" style="display:none" title="Next page">›</button>
      <a id="open-btn" class="vbtn" target="_blank" rel="noopener" style="display:none">↗ Open</a>
    </div>
    <iframe id="pdf-frame" style="display:none" title="PDF viewer"></iframe>
    <div id="welcome">
      <div id="welcome-title">Jimny SN413 Service Manual</div>
      <p>Select a page from the navigation on the left.</p>
      <p style="font-size:11px;color:#555">${entries.length} pages &nbsp;·&nbsp; 13 sections</p>
    </div>
  </div>
</div>

<script>
const ENTRIES = ${entriesJSON};

// ── Helpers ────────────────────────────────────────────────────────────────
function label(s) {
  return s.replace(/___/g, ' \u2013 ').replace(/_/g, ' ');
}

const SVG_CHEVRON = \`<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>\`;

// ── Tree build ────────────────────────────────────────────────────────────
function buildTree(entries) {
  const root = { _c: {}, _items: [] };
  for (const e of entries) {
    let node = root;
    for (const part of e.dirParts) {
      if (!node._c[part]) node._c[part] = { _c: {}, _items: [], _label: label(part) };
      node = node._c[part];
    }
    node._items.push(e);
  }
  return root;
}

const TREE = buildTree(ENTRIES);

// ── State ─────────────────────────────────────────────────────────────────
let currentIdx = -1;   // index into ENTRIES

// ── Render tree ───────────────────────────────────────────────────────────
function renderNode(node, depth) {
  const frag = document.createDocumentFragment();
  for (const [key, child] of Object.entries(node._c)) {
    const hasChildren = Object.keys(child._c).length > 0;
    const hasItems = child._items.length > 0;
    const group = document.createElement('div');
    group.className = 'tree-group';

    const hdr = document.createElement('div');
    hdr.className = 'tree-header ' + (depth === 0 ? 'root-hdr' : 'sub-hdr');
    hdr.innerHTML = SVG_CHEVRON + label(key);
    if (!hasChildren && hasItems) {
      hdr.innerHTML += \`<span class="cnt">(\${child._items.length})</span>\`;
    }
    hdr.addEventListener('click', () => {
      group.classList.toggle('open');
      hdr.classList.toggle('open');
    });
    group.appendChild(hdr);

    const children = document.createElement('div');
    children.className = 'tree-children';

    if (hasChildren) children.appendChild(renderNode(child, depth + 1));

    for (const entry of child._items) {
      const item = document.createElement('div');
      item.className = 'tree-item';
      item.textContent = entry.title;
      item.dataset.id = entry.id;
      const idx = ENTRIES.indexOf(entry);
      item.dataset.idx = idx;
      item.addEventListener('click', () => loadPDF(idx));
      children.appendChild(item);
    }

    group.appendChild(children);
    frag.appendChild(group);
  }
  return frag;
}

const treeEl = document.getElementById('tree');
function rebuildTree() {
  treeEl.innerHTML = '';
  treeEl.appendChild(renderNode(TREE, 0));
  // open first section
  const first = treeEl.querySelector('.tree-group');
  if (first) { first.classList.add('open'); first.querySelector('.tree-header').classList.add('open'); }
}
rebuildTree();

// ── PDF loader ────────────────────────────────────────────────────────────
const frame      = document.getElementById('pdf-frame');
const welcome    = document.getElementById('welcome');
const vTitle     = document.getElementById('viewer-title');
const openBtn    = document.getElementById('open-btn');
const headerPath = document.getElementById('header-path');
const prevBtn    = document.getElementById('prev-btn');
const nextBtn    = document.getElementById('next-btn');
const navInd     = document.getElementById('nav-indicator');

function loadPDF(idx) {
  if (idx < 0 || idx >= ENTRIES.length) return;
  const entry = ENTRIES[idx];
  currentIdx = idx;

  // clear active
  document.querySelectorAll('.active').forEach(el => el.classList.remove('active'));

  // find & activate item
  const el = document.querySelector(\`[data-id="\${entry.id}"]\`);
  if (el) { el.classList.add('active'); expandToItem(entry.id); }

  frame.src = entry.path;
  frame.style.display = 'block';
  welcome.style.display = 'none';
  vTitle.textContent = entry.title;
  openBtn.href = entry.path;
  openBtn.style.display = 'inline-flex';
  prevBtn.style.display = nextBtn.style.display = navInd.style.display = 'inline-flex';
  prevBtn.disabled = idx === 0;
  nextBtn.disabled = idx === ENTRIES.length - 1;
  navInd.textContent = (idx + 1) + ' / ' + ENTRIES.length;
  headerPath.textContent = entry.dirParts.map(label).join(' › ');

  history.replaceState(null, '', '#' + encodeURIComponent(entry.path));

  // scroll into view
  setTimeout(() => {
    const active = document.querySelector('.tree-item.active');
    if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, 50);
}

prevBtn.addEventListener('click', () => loadPDF(currentIdx - 1));
nextBtn.addEventListener('click', () => loadPDF(currentIdx + 1));

function expandToItem(id) {
  const item = treeEl.querySelector(\`[data-id="\${id}"]\`);
  if (!item) return;
  let el = item.parentElement;
  while (el && el !== treeEl) {
    if (el.classList.contains('tree-children')) {
      const grp = el.parentElement;
      grp.classList.add('open');
      grp.querySelector('.tree-header')?.classList.add('open');
    }
    el = el.parentElement;
  }
}

// ── Search ────────────────────────────────────────────────────────────────
const searchEl  = document.getElementById('search');
const countEl   = document.getElementById('result-count');
let searchTimer;

searchEl.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => doSearch(searchEl.value.trim()), 120);
});

function esc(s) { return s.replace(/[.*+?^$()|{}[\\]\\\\]/g, '\\\\$&'); }
function hi(text, q) {
  if (!q) return text;
  return text.replace(new RegExp('(' + esc(q) + ')', 'gi'), '<mark>$1</mark>');
}

function doSearch(q) {
  if (!q) {
    countEl.textContent = '';
    rebuildTree();
    if (currentIdx >= 0) {
      const entry = ENTRIES[currentIdx];
      const el = treeEl.querySelector(\`[data-id="\${entry.id}"]\`);
      if (el) { el.classList.add('active'); expandToItem(entry.id); }
    }
    return;
  }

  const ql = q.toLowerCase();
  const results = ENTRIES
    .map((e, i) => ({ e, i }))
    .filter(({ e }) =>
      e.title.toLowerCase().includes(ql) ||
      e.dirParts.some(p => label(p).toLowerCase().includes(ql))
    );

  countEl.textContent = results.length + ' result' + (results.length !== 1 ? 's' : '');
  treeEl.innerHTML = '';

  if (!results.length) {
    treeEl.innerHTML = '<div class="no-results">No results for "' + q.replace(/"/g, '&quot;') + '"</div>';
    return;
  }

  for (const { e, i } of results) {
    const el = document.createElement('div');
    el.className = 'search-result' + (i === currentIdx ? ' active' : '');
    el.dataset.id = e.id;
    el.innerHTML =
      '<div class="sr-title">' + hi(e.title, q) + '</div>' +
      '<div class="sr-path">' + hi(e.dirParts.map(label).join(' › '), q) + '</div>';
    el.addEventListener('click', () => loadPDF(i));
    treeEl.appendChild(el);
  }
}

// ── Resize handle ─────────────────────────────────────────────────────────
const handle  = document.getElementById('resize-handle');
const sidebar = document.getElementById('sidebar');
let dragging = false, startX = 0, startW = 0;

handle.addEventListener('mousedown', e => {
  dragging = true; startX = e.clientX; startW = sidebar.offsetWidth;
  handle.classList.add('dragging'); e.preventDefault();
});
document.addEventListener('mousemove', e => {
  if (!dragging) return;
  sidebar.style.width = Math.max(180, Math.min(620, startW + e.clientX - startX)) + 'px';
});
document.addEventListener('mouseup', () => { dragging = false; handle.classList.remove('dragging'); });

// ── Keyboard navigation ───────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (document.activeElement === searchEl) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); loadPDF(currentIdx + 1); }
  if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); loadPDF(currentIdx - 1); }
  if (e.key === '/') { e.preventDefault(); searchEl.focus(); searchEl.select(); }
});

// ── Hash routing ──────────────────────────────────────────────────────────
const hash = decodeURIComponent(location.hash.slice(1));
if (hash) {
  const idx = ENTRIES.findIndex(e => e.path === hash);
  if (idx >= 0) loadPDF(idx);
}
</script>
</body>
</html>`;

fs.writeFileSync(OUTPUT_HTML, html, 'utf8');
const stats = fs.statSync(OUTPUT_HTML);
console.log(`✓ Generated  pdfs/index.html  (${(stats.size / 1024).toFixed(0)} KB)`);
console.log(`  ${entries.length} pages indexed across ${[...new Set(entries.map(e => e.dirParts[0]))].length} sections`);
