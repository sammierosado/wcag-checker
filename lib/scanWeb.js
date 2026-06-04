const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function runAxe(page) {
  return await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
}

async function scanUrl(url) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    if (!response || !response.ok()) {
      const status = response ? response.status() : 'no response';
      throw new Error(`Failed to load ${url} (HTTP ${status})`);
    }
    const result = await runAxe(page);
    return normalize(result, { kind: 'url', source: url });
  } finally {
    await browser.close();
  }
}

async function scanHtml(html) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const result = await runAxe(page);
    return normalize(result, { kind: 'html', source: 'pasted HTML' });
  } finally {
    await browser.close();
  }
}

function normalize(axeResult, source) {
  const violations = axeResult.violations.map(v => ({
    id: v.id,
    impact: v.impact || 'minor',
    help: v.help,
    helpUrl: v.helpUrl,
    description: v.description,
    wcag: extractWcagRefs(v.tags),
    nodes: v.nodes.map(n => ({
      target: n.target.join(' '),
      html: n.html,
      failureSummary: n.failureSummary
    }))
  }));
  return {
    engine: 'axe-core',
    engineVersion: axeResult.testEngine.version,
    scannedAt: new Date().toISOString(),
    source,
    summary: {
      violations: axeResult.violations.length,
      passes: axeResult.passes.length,
      incomplete: axeResult.incomplete.length,
      inapplicable: axeResult.inapplicable.length
    },
    violations,
    incomplete: axeResult.incomplete.map(v => ({
      id: v.id,
      impact: v.impact || 'minor',
      help: v.help,
      helpUrl: v.helpUrl,
      wcag: extractWcagRefs(v.tags),
      nodeCount: v.nodes.length
    }))
  };
}

function extractWcagRefs(tags) {
  const refs = [];
  for (const tag of tags) {
    const m = tag.match(/^wcag(\d)(\d{1,2})$/);
    if (m) refs.push(`${m[1]}.${m[2][0]}.${m[2].slice(1) || ''}`.replace(/\.$/, ''));
    if (/^wcag2(1|2)?a{1,2}$/.test(tag)) refs.push(tag.toUpperCase());
  }
  return [...new Set(refs)];
}

module.exports = { scanUrl, scanHtml };
