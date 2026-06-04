const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');
const statusEl = document.getElementById('status');
const statusText = document.getElementById('status-text');
const resultsEl = document.getElementById('results');

let lastResult = null;

tabs.forEach(t => t.addEventListener('click', () => {
  tabs.forEach(x => { x.classList.remove('active'); x.setAttribute('aria-selected', 'false'); });
  panels.forEach(p => p.classList.remove('active'));
  t.classList.add('active');
  t.setAttribute('aria-selected', 'true');
  document.getElementById('panel-' + t.dataset.tab).classList.add('active');
}));

document.getElementById('scan-url-btn').addEventListener('click', () => {
  const url = document.getElementById('url-input').value.trim();
  if (!/^https?:\/\//.test(url)) {
    showError('Enter a full URL starting with http:// or https://');
    return;
  }
  scan('/scan-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) }, `Scanning ${url}…`);
});

document.getElementById('scan-html-btn').addEventListener('click', () => {
  const html = document.getElementById('html-input').value;
  if (!html.trim()) { showError('Paste some HTML first.'); return; }
  scan('/scan-html', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html }) }, 'Scanning HTML…');
});

const pdfInput = document.getElementById('pdf-input');
const pdfName = document.getElementById('pdf-name');
const dropZone = document.getElementById('drop-zone');
const scanPdfBtn = document.getElementById('scan-pdf-btn');

pdfInput.addEventListener('change', () => {
  const f = pdfInput.files[0];
  if (f) { pdfName.textContent = f.name; scanPdfBtn.disabled = false; }
});

['dragenter', 'dragover'].forEach(ev => dropZone.addEventListener(ev, e => {
  e.preventDefault(); dropZone.classList.add('dragover');
}));
['dragleave', 'drop'].forEach(ev => dropZone.addEventListener(ev, e => {
  e.preventDefault(); dropZone.classList.remove('dragover');
}));
dropZone.addEventListener('drop', e => {
  const f = e.dataTransfer.files[0];
  if (f && f.type === 'application/pdf') {
    const dt = new DataTransfer();
    dt.items.add(f);
    pdfInput.files = dt.files;
    pdfName.textContent = f.name;
    scanPdfBtn.disabled = false;
  }
});

scanPdfBtn.addEventListener('click', () => {
  const f = pdfInput.files[0];
  if (!f) return;
  const fd = new FormData();
  fd.append('pdf', f);
  scan('/scan-pdf', { method: 'POST', body: fd }, `Validating ${f.name} against PDF/UA-1…`);
});

async function scan(endpoint, init, statusMessage) {
  resultsEl.classList.add('hidden');
  statusEl.classList.remove('hidden');
  statusText.textContent = statusMessage;
  try {
    const res = await fetch(endpoint, init);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    lastResult = data;
    renderResult(data);
  } catch (e) {
    showError(e.message);
  } finally {
    statusEl.classList.add('hidden');
  }
}

function showError(msg) {
  resultsEl.innerHTML = `<div class="error-box"><strong>Error:</strong> ${escapeHtml(msg)}</div>`;
  resultsEl.classList.remove('hidden');
}

function escapeHtml(s) {
  if (s === undefined || s === null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const SEV_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 };

function renderResult(result) {
  const sorted = [...result.violations].sort(
    (a, b) => (SEV_ORDER[a.impact] ?? 9) - (SEV_ORDER[b.impact] ?? 9)
  );
  const counts = sorted.reduce(
    (acc, v) => { acc[v.impact || 'minor'] = (acc[v.impact || 'minor'] || 0) + 1; return acc; },
    { critical: 0, serious: 0, moderate: 0, minor: 0 }
  );
  const verdict = sorted.length === 0
    ? `<span class="verdict pass">No automated violations detected</span>`
    : `<span class="verdict fail">${sorted.length} violation${sorted.length === 1 ? '' : 's'} found</span>`;

  const source = result.source?.source || 'scan';
  const body = sorted.length === 0
    ? `<div class="empty-pass">
         <h3>No automated WCAG 2.1 AA violations detected</h3>
         <p>Manual keyboard and screen-reader testing still required for full conformance.</p>
       </div>`
    : sorted.map(renderViolation).join('');

  resultsEl.innerHTML = `
    <div class="results-head">
      <div>
        <h2>Scan results</h2>
        <div class="results-meta">
          <strong>${escapeHtml(source)}</strong> · ${escapeHtml(result.engine)} ${escapeHtml(result.engineVersion)} ·
          ${new Date(result.scannedAt).toLocaleString()}
        </div>
        <div style="margin-top: 10px;">${verdict}</div>
      </div>
      <div class="actions">
        <button class="btn-secondary" id="download-html">Download HTML report</button>
        <button class="btn-secondary" id="download-json">Download JSON</button>
      </div>
    </div>
    <div class="summary-grid">
      <div class="stat critical"><div class="num">${counts.critical}</div><div class="label">Critical</div></div>
      <div class="stat serious"><div class="num">${counts.serious}</div><div class="label">Serious</div></div>
      <div class="stat moderate"><div class="num">${counts.moderate}</div><div class="label">Moderate</div></div>
      <div class="stat minor"><div class="num">${counts.minor}</div><div class="label">Minor</div></div>
    </div>
    ${body}
  `;
  resultsEl.classList.remove('hidden');

  document.getElementById('download-html').addEventListener('click', downloadHtmlReport);
  document.getElementById('download-json').addEventListener('click', downloadJson);
}

function renderViolation(v) {
  const wcag = (v.wcag || []).map(w => `<code>${escapeHtml(w)}</code>`).join(' ');
  const nodes = (v.nodes || []).slice(0, 10).map(n => `
    <div class="node">
      <div class="node-target"><strong>Location:</strong> <code>${escapeHtml(n.target || '(document)')}</code></div>
      ${n.html ? `<pre class="node-html">${escapeHtml(n.html)}</pre>` : ''}
      ${n.failureSummary ? `<div class="node-summary">${escapeHtml(n.failureSummary)}</div>` : ''}
    </div>
  `).join('');
  const more = (v.nodes || []).length > 10 ? `<div class="node-summary">… and ${v.nodes.length - 10} more occurrence(s)</div>` : '';
  const impact = v.impact || 'minor';
  return `
    <article class="violation ${impact}">
      <div class="violation-head">
        <span class="badge badge-${impact}">${impact}</span>
        <h3>${escapeHtml(v.help || v.id)}</h3>
      </div>
      <div class="violation-meta">
        <span><strong>Rule:</strong> <code>${escapeHtml(v.id)}</code></span>
        ${wcag ? `<span><strong>WCAG:</strong> ${wcag}</span>` : ''}
        ${v.helpUrl ? `<span><a href="${escapeHtml(v.helpUrl)}" target="_blank" rel="noopener">Remediation guide ↗</a></span>` : ''}
      </div>
      ${v.description ? `<p class="violation-desc">${escapeHtml(v.description)}</p>` : ''}
      <details>
        <summary>${(v.nodes || []).length} occurrence${(v.nodes || []).length === 1 ? '' : 's'} — show details</summary>
        ${nodes}${more}
      </details>
    </article>
  `;
}

async function downloadHtmlReport() {
  if (!lastResult) return;
  const res = await fetch('/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lastResult)
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wcag-report-${(lastResult.source?.source || 'scan').replace(/[^a-z0-9\-_.]/gi, '_')}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadJson() {
  if (!lastResult) return;
  const blob = new Blob([JSON.stringify(lastResult, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wcag-report-${(lastResult.source?.source || 'scan').replace(/[^a-z0-9\-_.]/gi, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
