#!/usr/bin/env node
// Smoke test: exercises all three scan paths (HTML, URL, PDF) end-to-end.
// Calls the scanner libs directly — no running server required. The URL test
// serves a fixture from a throwaway localhost server so it never depends on
// external network access.

const assert = require('assert');
const http = require('http');
const path = require('path');
const { scanHtml, scanUrl } = require('../lib/scanWeb');
const { scanPdf } = require('../lib/scanPdf');

async function testHtml() {
  // Deliberately broken markup: missing alt text + missing lang.
  const bad = '<!doctype html><html><head><title>x</title></head>'
            + '<body><img src="a.png"></body></html>';
  const r = await scanHtml(bad);
  assert.strictEqual(r.engine, 'axe-core', 'expected axe-core engine');
  assert.ok(r.violations.some(v => v.id === 'image-alt'), 'expected image-alt violation');
  assert.ok(r.violations.some(v => v.id === 'html-has-lang'), 'expected html-has-lang violation');
  console.log(`  ✓ HTML scan — ${r.violations.length} violations (axe-core ${r.engineVersion})`);
}

async function testUrl() {
  const page = '<!doctype html><html lang="en"><head><meta charset="utf-8">'
             + '<title>Fixture</title></head><body><h1>Hello</h1>'
             + '<p>An accessible test page.</p></body></html>';
  const server = http.createServer((_req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(page);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const r = await scanUrl(`http://127.0.0.1:${port}/`);
    assert.strictEqual(r.source.kind, 'url', 'expected url source kind');
    assert.strictEqual(typeof r.summary.violations, 'number', 'expected numeric violation count');
    console.log(`  ✓ URL scan — ${r.summary.violations} violations on local fixture`);
  } finally {
    server.close();
  }
}

async function testPdf() {
  const fixture = path.join(__dirname, 'fixtures', 'sample.pdf');
  const r = await scanPdf(fixture, 'sample.pdf');
  assert.strictEqual(r.engine, 'veraPDF', 'expected veraPDF engine');
  assert.ok(Array.isArray(r.violations), 'expected violations array');
  assert.strictEqual(typeof r.summary.passes, 'number', 'expected numeric pass count');
  console.log(`  ✓ PDF scan — ${r.summary.violations} violations, ${r.summary.passes} passes (veraPDF ${r.engineVersion})`);
}

(async () => {
  console.log('Running smoke tests…');
  await testHtml();
  await testUrl();
  await testPdf();
  console.log('\nAll smoke tests passed ✓');
})().catch(err => {
  console.error('\n✗ SMOKE TEST FAILED:', err.message);
  process.exit(1);
});
