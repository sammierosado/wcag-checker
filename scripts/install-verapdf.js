#!/usr/bin/env node
// Downloads veraPDF and installs it headlessly into vendor/verapdf.
// Idempotent: skips work if already installed.

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const VENDOR = path.join(ROOT, 'vendor');
const VERAPDF_DIR = path.join(VENDOR, 'verapdf');
const INSTALLER_URL = 'https://software.verapdf.org/rel/verapdf-installer.zip';
const ZIP_PATH = path.join(VENDOR, 'verapdf-installer.zip');

function log(msg) {
  process.stdout.write(`[install-verapdf] ${msg}\n`);
}

function isInstalled() {
  const marker = process.platform === 'win32'
    ? path.join(VERAPDF_DIR, 'verapdf.bat')
    : path.join(VERAPDF_DIR, 'verapdf');
  return fs.existsSync(marker);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function download(url, dest, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error('Too many redirects'));
    const file = fs.createWriteStream(dest);
    https.get(url, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        file.close();
        fs.unlinkSync(dest);
        return download(res.headers.location, dest, redirectCount + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let received = 0;
      let lastPct = -1;
      res.on('data', chunk => {
        received += chunk.length;
        if (total) {
          const pct = Math.floor((received / total) * 100);
          if (pct >= lastPct + 10) {
            process.stdout.write(`[install-verapdf] downloading… ${pct}%\r`);
            lastPct = pct;
          }
        }
      });
      res.pipe(file);
      file.on('finish', () => file.close(() => {
        process.stdout.write('\n');
        resolve();
      }));
    }).on('error', err => {
      file.close();
      try { fs.unlinkSync(dest); } catch {}
      reject(err);
    });
  });
}

function findInstallerJar() {
  const entries = fs.readdirSync(VENDOR, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (!e.name.startsWith('verapdf-greenfield')) continue;
    const dir = path.join(VENDOR, e.name);
    const files = fs.readdirSync(dir);
    const jar = files.find(f => /^verapdf-izpack-installer-.*\.jar$/.test(f));
    if (jar) return { dir, jar: path.join(dir, jar) };
  }
  throw new Error('Could not find veraPDF izpack installer jar after extracting zip');
}

function unzip(zipPath, destDir) {
  // Cross-platform unzip without adding dependencies:
  //  - Windows: PowerShell Expand-Archive
  //  - Linux/macOS: /usr/bin/unzip (standard on both)
  if (process.platform === 'win32') {
    const r = spawnSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`
    ], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('Expand-Archive failed');
  } else {
    const r = spawnSync('unzip', ['-o', '-q', zipPath, '-d', destDir], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('unzip failed (install the `unzip` package)');
  }
}

function writeAutoInstallXml(targetPath) {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<AutomatedInstallation langpack="eng">
    <com.izforge.izpack.panels.htmlhello.HTMLHelloPanel id="welcome"/>
    <com.izforge.izpack.panels.target.TargetPanel id="install_dir">
        <installpath>${targetPath}</installpath>
    </com.izforge.izpack.panels.target.TargetPanel>
    <com.izforge.izpack.panels.packs.PacksPanel id="sdk_pack_select">
        <pack index="0" name="veraPDF GUI" selected="true"/>
        <pack index="1" name="veraPDF Mac Startup" selected="${process.platform === 'darwin'}"/>
        <pack index="2" name="veraPDF Validation model" selected="true"/>
        <pack index="3" name="veraPDF Documentation" selected="false"/>
        <pack index="4" name="veraPDF Sample Plugins" selected="false"/>
    </com.izforge.izpack.panels.packs.PacksPanel>
    <com.izforge.izpack.panels.install.InstallPanel id="install"/>
    <com.izforge.izpack.panels.finish.FinishPanel id="finish"/>
</AutomatedInstallation>
`;
  const file = path.join(VENDOR, 'auto-install.xml');
  fs.writeFileSync(file, xml, 'utf8');
  return file;
}

function runInstaller(jarPath, autoInstallXml) {
  const r = spawnSync('java', ['-jar', jarPath, autoInstallXml], { stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error(`veraPDF installer exited with ${r.status}. Make sure Java 11+ is on PATH.`);
  }
}

async function main() {
  if (isInstalled()) {
    log('veraPDF already installed at ' + VERAPDF_DIR + ' — skipping.');
    return;
  }
  ensureDir(VENDOR);

  const javaCheck = spawnSync('java', ['-version'], { stdio: 'pipe' });
  if (javaCheck.status !== 0) {
    log('WARNING: `java` was not found on PATH.');
    log('veraPDF requires Java 11+. Install Eclipse Temurin or any other JDK, then re-run `npm install`.');
    log('Skipping veraPDF setup — PDF scans will fail until Java is installed.');
    return;
  }

  log('Downloading veraPDF installer (~30MB)…');
  await download(INSTALLER_URL, ZIP_PATH);

  log('Extracting installer…');
  unzip(ZIP_PATH, VENDOR);

  const { dir: greenfieldDir, jar } = findInstallerJar();
  log('Running headless installer → ' + VERAPDF_DIR);
  const autoXml = writeAutoInstallXml(VERAPDF_DIR);
  runInstaller(jar, autoXml);

  // Cleanup
  try { fs.unlinkSync(ZIP_PATH); } catch {}
  try { fs.unlinkSync(autoXml); } catch {}
  try { fs.rmSync(greenfieldDir, { recursive: true, force: true }); } catch {}

  if (!isInstalled()) {
    throw new Error('veraPDF install completed but expected launcher script is missing.');
  }
  log('veraPDF installed successfully.');
}

main().catch(err => {
  log('ERROR: ' + err.message);
  process.exitCode = 1;
});
