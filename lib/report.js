function escapeHtml(s) {
  if (s === undefined || s === null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SEVERITY_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 };

function severityBadge(impact) {
  const i = (impact || 'minor').toLowerCase();
  return `<span class="badge badge-${i}">${i}</span>`;
}

function renderViolation(v) {
  const wcag = (v.wcag || []).map(w => `<code>${escapeHtml(w)}</code>`).join(' ');
  const nodes = (v.nodes || []).slice(0, 10).map(n => `
    <div class="node">
      <div class="node-target"><strong>Selector / location:</strong> <code>${escapeHtml(n.target)}</code></div>
      ${n.html ? `<pre class="node-html">${escapeHtml(n.html)}</pre>` : ''}
      ${n.failureSummary ? `<div class="node-summary">${escapeHtml(n.failureSummary)}</div>` : ''}
    </div>
  `).join('');
  const moreCount = (v.nodes || []).length - 10;
  const more = moreCount > 0 ? `<div class="node-more">… and ${moreCount} more occurrence(s)</div>` : '';

  return `
    <article class="violation">
      <header class="violation-head">
        ${severityBadge(v.impact)}
        <h3>${escapeHtml(v.help || v.id)}</h3>
      </header>
      <div class="violation-meta">
        <span><strong>Rule:</strong> <code>${escapeHtml(v.id)}</code></span>
        ${wcag ? `<span><strong>WCAG:</strong> ${wcag}</span>` : ''}
        ${v.helpUrl ? `<span><a href="${escapeHtml(v.helpUrl)}" target="_blank" rel="noopener">Remediation guide ↗</a></span>` : ''}
      </div>
      ${v.description ? `<p class="violation-desc">${escapeHtml(v.description)}</p>` : ''}
      ${nodes}
      ${more}
    </article>
  `;
}

function renderReport(result, opts = {}) {
  const sortedViolations = [...(result.violations || [])].sort(
    (a, b) => (SEVERITY_ORDER[a.impact] ?? 9) - (SEVERITY_ORDER[b.impact] ?? 9)
  );
  const counts = sortedViolations.reduce(
    (acc, v) => { acc[v.impact || 'minor'] = (acc[v.impact || 'minor'] || 0) + 1; return acc; },
    { critical: 0, serious: 0, moderate: 0, minor: 0 }
  );

  const sourceLabel = result.source?.source || 'unknown';
  const sourceKind = result.source?.kind || 'web';
  const title = `WCAG 2.2 AA Report — ${sourceLabel}`;
  const verdict = sortedViolations.length === 0
    ? '<span class="verdict pass">No automated violations detected</span>'
    : `<span class="verdict fail">${sortedViolations.length} violation(s) found</span>`;

  const css = `
    :root { --bg:#0f1419; --panel:#1a2029; --text:#e4e7eb; --muted:#8b95a3; --accent:#4a9eff;
            --critical:#dc2626; --serious:#ea580c; --moderate:#ca8a04; --minor:#0891b2;
            --pass:#16a34a; --border:#2a3340; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
           background:var(--bg); color:var(--text); margin:0; line-height:1.55; }
    .container { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }
    header.report-head { border-bottom:1px solid var(--border); padding-bottom:24px; margin-bottom:24px; }
    header.report-head h1 { margin:0 0 8px; font-size:24px; }
    .meta { color:var(--muted); font-size:14px; display:flex; flex-wrap:wrap; gap:16px; }
    .verdict { display:inline-block; padding:6px 14px; border-radius:999px; font-weight:600; font-size:14px; }
    .verdict.pass { background:rgba(22,163,74,.15); color:#22c55e; border:1px solid var(--pass); }
    .verdict.fail { background:rgba(220,38,38,.12); color:#f87171; border:1px solid var(--critical); }
    .summary-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));
                    gap:12px; margin:24px 0; }
    .stat { background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:16px; }
    .stat .num { font-size:28px; font-weight:700; }
    .stat .label { color:var(--muted); font-size:13px; text-transform:uppercase; letter-spacing:.5px; }
    .stat.critical .num { color:var(--critical); }
    .stat.serious .num { color:var(--serious); }
    .stat.moderate .num { color:var(--moderate); }
    .stat.minor .num { color:var(--minor); }
    .violation { background:var(--panel); border:1px solid var(--border); border-left:4px solid var(--minor);
                 border-radius:8px; padding:20px; margin-bottom:16px; }
    .violation:has(.badge-critical) { border-left-color:var(--critical); }
    .violation:has(.badge-serious) { border-left-color:var(--serious); }
    .violation:has(.badge-moderate) { border-left-color:var(--moderate); }
    .violation-head { display:flex; align-items:center; gap:12px; margin-bottom:8px; }
    .violation-head h3 { margin:0; font-size:17px; }
    .badge { font-size:11px; text-transform:uppercase; letter-spacing:.5px; font-weight:700;
             padding:3px 8px; border-radius:4px; color:#fff; }
    .badge-critical { background:var(--critical); }
    .badge-serious { background:var(--serious); }
    .badge-moderate { background:var(--moderate); }
    .badge-minor { background:var(--minor); }
    .violation-meta { color:var(--muted); font-size:13px; display:flex; flex-wrap:wrap; gap:18px; margin-bottom:10px; }
    .violation-meta code { background:rgba(255,255,255,.05); padding:1px 6px; border-radius:3px; font-size:12px; }
    .violation-meta a { color:var(--accent); text-decoration:none; }
    .violation-meta a:hover { text-decoration:underline; }
    .violation-desc { color:#cbd5e1; margin:8px 0 12px; }
    .node { background:rgba(0,0,0,.25); border-radius:6px; padding:12px; margin-top:8px; font-size:13px; }
    .node-target code { background:rgba(255,255,255,.05); padding:1px 6px; border-radius:3px; }
    .node-html { background:#0a0e13; border:1px solid var(--border); border-radius:4px;
                 padding:8px 10px; font-size:12px; overflow-x:auto; white-space:pre-wrap;
                 word-break:break-all; color:#94a3b8; max-height:120px; }
    .node-summary { color:#cbd5e1; margin-top:6px; font-style:italic; }
    .node-more { color:var(--muted); font-size:12px; margin-top:8px; }
    .empty-pass { text-align:center; padding:48px 24px; background:var(--panel);
                  border:1px solid var(--pass); border-radius:8px; }
    .empty-pass h2 { color:#22c55e; margin:0 0 8px; }
    footer.report-foot { margin-top:32px; padding-top:16px; border-top:1px solid var(--border);
                         color:var(--muted); font-size:12px; }
  `;

  const summaryHtml = `
    <div class="summary-grid">
      <div class="stat critical"><div class="num">${counts.critical}</div><div class="label">Critical</div></div>
      <div class="stat serious"><div class="num">${counts.serious}</div><div class="label">Serious</div></div>
      <div class="stat moderate"><div class="num">${counts.moderate}</div><div class="label">Moderate</div></div>
      <div class="stat minor"><div class="num">${counts.minor}</div><div class="label">Minor</div></div>
    </div>
  `;

  const body = sortedViolations.length === 0
    ? `<div class="empty-pass">
         <h2>No automated WCAG 2.2 AA violations detected</h2>
         <p>Automated tools catch roughly 30–50% of accessibility issues. Manual testing with keyboard navigation and a screen reader is still required for full conformance.</p>
       </div>`
    : sortedViolations.map(renderViolation).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${css}</style>
</head>
<body>
<div class="container">
  <header class="report-head">
    <h1>WCAG 2.2 AA Accessibility Report</h1>
    <div class="meta">
      <span><strong>Source:</strong> ${escapeHtml(sourceLabel)}</span>
      <span><strong>Scanned:</strong> ${escapeHtml(result.scannedAt)}</span>
      <span><strong>Engine:</strong> ${escapeHtml(result.engine)} ${escapeHtml(result.engineVersion)}</span>
    </div>
    <div style="margin-top:14px;">${verdict}</div>
  </header>
  ${summaryHtml}
  ${body}
  <footer class="report-foot">
    Generated by WCAG Checker · ${escapeHtml(sourceKind.toUpperCase())} scan ·
    Automated checks cover a subset of WCAG 2.2 AA — manual review still required for full conformance.
  </footer>
</div>
</body>
</html>`;
}

module.exports = { renderReport };
