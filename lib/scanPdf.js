const { spawn } = require('child_process');
const path = require('path');

const VERAPDF_HOME = path.join(__dirname, '..', 'vendor', 'verapdf');
const CLASSPATH = [
  path.join(VERAPDF_HOME, 'etc'),
  path.join(VERAPDF_HOME, 'bin') + path.sep + '*'
].join(path.delimiter);

function runVeraPdf(pdfPath) {
  return new Promise((resolve, reject) => {
    const javaArgs = [
      '-classpath', CLASSPATH,
      '-Dfile.encoding=UTF8',
      '-XX:+IgnoreUnrecognizedVMOptions',
      `-Dapp.home=${VERAPDF_HOME}`,
      `-Dapp.repo=${path.join(VERAPDF_HOME, 'bin')}`,
      '--add-exports=java.base/sun.security.pkcs=ALL-UNNAMED',
      'org.verapdf.apps.GreenfieldCliWrapper',
      '--format', 'json',
      '--flavour', 'ua1',
      '--nonpdfext',
      pdfPath
    ];
    const child = spawn('java', javaArgs, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (!stdout.trim()) {
        return reject(new Error(`veraPDF returned no output (exit ${code}): ${stderr.slice(0, 500)}`));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error(`Failed to parse veraPDF JSON: ${e.message}`));
      }
    });
  });
}

async function scanPdf(pdfPath, originalName) {
  const raw = await runVeraPdf(pdfPath);
  return normalize(raw, originalName);
}

function normalize(raw, fileName) {
  const report = raw.report || raw;
  const job = (report.jobs || [])[0] || {};
  const validationResults = Array.isArray(job.validationResult) ? job.validationResult : [];

  const violations = [];
  let totalPassed = 0;
  let totalFailed = 0;
  let compliant = true;

  for (const vr of validationResults) {
    if (vr.compliant === false) compliant = false;
    const details = vr.details || {};
    totalPassed += details.passedChecks || 0;
    totalFailed += details.failedChecks || 0;
    for (const r of (details.ruleSummaries || [])) {
      if (r.ruleStatus === 'PASSED') continue;
      const ruleId = `PDF/UA ${r.clause || ''}-${r.testNumber || ''}`.trim();
      violations.push({
        id: ruleId,
        impact: severityFromFailedCount(r.failedChecks),
        help: r.description || 'PDF/UA-1 rule violation',
        helpUrl: `https://docs.verapdf.org/validation/pdfua-part1/#rule-${(r.clause || '').replace(/\./g, '-')}-${r.testNumber || ''}`,
        description: r.description,
        wcag: mapPdfUaToWcag(r.clause),
        nodes: (r.checks || []).slice(0, 25).map(c => ({
          target: c.context || '(document)',
          html: '',
          failureSummary: c.errorMessage || r.description
        }))
      });
    }
  }

  const version = (report.buildInformation?.releaseDetails || [])
    .find(d => d.id === 'apps')?.version || 'unknown';

  return {
    engine: 'veraPDF',
    engineVersion: version,
    scannedAt: new Date().toISOString(),
    source: { kind: 'pdf', source: fileName },
    summary: {
      violations: violations.length,
      passes: totalPassed,
      incomplete: 0,
      inapplicable: 0,
      compliant
    },
    violations,
    incomplete: []
  };
}

function severityFromFailedCount(n) {
  if (!n || n < 1) return 'minor';
  if (n >= 10) return 'critical';
  if (n >= 3) return 'serious';
  return 'moderate';
}

// PDF/UA-1 clause → primary WCAG 2.2 SC mapping (Matterhorn-style condensed).
// Order matters: more specific prefixes must come first.
function mapPdfUaToWcag(clause) {
  if (!clause) return [];
  const c = String(clause);
  if (c.startsWith('6.2')) return ['1.3.1 Info and Relationships'];
  if (c.startsWith('7.21')) return ['1.4.5 Images of Text'];
  if (c.startsWith('7.18')) return ['4.1.2 Name, Role, Value'];
  if (c.startsWith('7.1')) return ['1.3.1 Info and Relationships', '1.3.2 Meaningful Sequence'];
  if (c.startsWith('7.2')) return ['3.1.1 Language of Page', '3.1.2 Language of Parts'];
  if (c.startsWith('7.3')) return ['1.1.1 Non-text Content'];
  if (c.startsWith('7.4')) return ['1.3.1 Info and Relationships', '2.4.6 Headings and Labels'];
  if (c.startsWith('7.5')) return ['1.3.1 Info and Relationships'];
  if (c.startsWith('7.6')) return ['1.3.1 Info and Relationships'];
  if (c.startsWith('7.7')) return ['1.1.1 Non-text Content', '1.3.1 Info and Relationships'];
  return [];
}

module.exports = { scanPdf };
