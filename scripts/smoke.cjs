/**
 * Browser smoke test: builds nothing, mocks nothing in the app. It serves `dist/` with Vite's
 * preview server, clicks through the main flow in headless Chromium at phone width, and fails
 * on any console error, page error or horizontal overflow.
 *
 *   npm run build && npm run smoke
 *
 * Needs Playwright with a Chromium build (`npm i -D playwright && npx playwright install chromium`).
 * Without it the script says so and exits successfully, so it never blocks a machine that has no
 * browser. YouTube is stubbed out, so the test also works offline.
 *
 * Options: --keep (leave screenshots from earlier runs), --only=<step name>
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'smoke-output');
const args = process.argv.slice(2);
const only = args.find((arg) => arg.startsWith('--only='))?.slice('--only='.length);

function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    return null;
  }
}

/** 1×1 grey JPEG, served instead of YouTube thumbnails. */
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);

const FAKE_EMBED = `<!doctype html><html><body style="margin:0;background:#123;color:#fff;font:700 40px sans-serif;display:grid;place-items:center;height:100vh">
<div id="label">TRAILER (stub)</div>
<script>
  // Minimal stand-in for the YouTube player's postMessage protocol.
  let muted = true;
  const send = (data) => parent.postMessage(JSON.stringify(data), '*');
  addEventListener('message', (event) => {
    let message; try { message = JSON.parse(event.data); } catch { return; }
    if (message.event === 'listening') {
      send({ event: 'initialDelivery', info: { playerState: 1, muted }, id: message.id });
      send({ event: 'onReady', info: null, id: message.id });
    }
    if (message.event === 'command') {
      if (message.func === 'unMute') muted = false;
      if (message.func === 'mute') muted = true;
      document.getElementById('label').textContent = muted ? 'TRAILER (stub, muted)' : 'TRAILER (stub, sound on)';
      send({ event: 'infoDelivery', info: { muted, playerState: 1 }, id: message.id });
    }
  });
</script></body></html>`;

async function main() {
  const playwright = loadPlaywright();
  if (!playwright) {
    console.log('SKIPPED: Playwright is not installed, so the browser smoke test did not run.');
    return 0;
  }
  if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
    console.error('FAILED: dist/ is missing. Run `npm run build` first.');
    return 1;
  }
  if (!args.includes('--keep')) fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const { preview } = await import('vite');
  const server = await preview({ root: ROOT, logLevel: 'error', preview: { port: 4317 } });
  const baseUrl = server.resolvedUrls.local[0];

  const browser = await playwright.chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  const problems = [];
  let failed = 0;

  /** Opens a fresh phone-sized page with error collection and the YouTube stubs installed. */
  async function openPage(options = {}) {
    const context = await browser.newContext({
      viewport: options.viewport ?? { width: 360, height: 740 },
      deviceScaleFactor: 1,
      locale: options.locale ?? 'en-CA',
      reducedMotion: options.reducedMotion ?? 'no-preference',
      hasTouch: true,
    });
    await context.route(/^https:\/\/i\.ytimg\.com\//, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/jpeg',
        headers: { 'access-control-allow-origin': '*' },
        body: TINY_JPEG,
      }),
    );
    await context.route(/^https:\/\/www\.youtube(-nocookie)?\.com\/embed\//, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: FAKE_EMBED }),
    );
    await context.route(/^https:\/\/www\.youtube\.com\/iframe_api/, (route) =>
      route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* stub */' }),
    );
    const page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
    });
    page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
    return { context, page };
  }

  async function shot(page, name) {
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  }

  async function expectNoOverflow(page, label) {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    if (overflow > 1) throw new Error(`${label}: page is ${overflow}px wider than the screen`);
  }

  const steps = require('./smoke-steps.cjs');
  const helpers = { baseUrl, openPage, shot, expectNoOverflow, OUT };

  for (const step of steps) {
    if (only && step.name !== only) continue;
    const before = problems.length;
    const started = Date.now();
    try {
      await step.run(helpers);
      if (problems.length > before) {
        throw new Error(problems.slice(before).join('\n         '));
      }
      console.log(`  ok    ${step.name} (${Date.now() - started} ms)`);
    } catch (error) {
      failed += 1;
      console.log(`  FAIL  ${step.name}\n         ${error.message}`);
    }
  }

  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));

  console.log(
    failed === 0
      ? `PASSED: all smoke steps ok. Screenshots: ${path.relative(ROOT, OUT)}/`
      : `FAILED: ${failed} smoke step(s) failed. Screenshots: ${path.relative(ROOT, OUT)}/`,
  );
  return failed === 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`FAILED: ${error.stack ?? error}`);
    process.exit(1);
  });
