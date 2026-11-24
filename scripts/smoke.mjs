/**
 * Browser smoke test. It serves the built site (`dist/`) with Vite's preview server, clicks
 * through the main flow in a headless browser, and fails on any console error, page error or
 * horizontal overflow. YouTube is replaced by local stand-ins, so it also runs offline.
 *
 *   npm run build && npm run smoke
 *
 * Needs the `playwright` package (`npm i -D playwright`). It uses Playwright's own Chromium
 * when installed (`npx playwright install chromium`), otherwise the installed Chrome or Edge.
 * Without Playwright it says so and exits successfully, so it never blocks a machine without a
 * browser. Screenshots go to `smoke-output/`.
 *
 * Options: --keep (keep earlier screenshots), --only=<part of a step name>
 */
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'smoke-output');
const args = process.argv.slice(2);
const only = args.find((arg) => arg.startsWith('--only='))?.slice('--only='.length);

const THEATRE = 'silvercity-riverport';
const AUDITORIUM = 'riverport-sample';
const VIDEO = '3_9vCamtuPY';

/** Stand-in for https://www.youtube.com/iframe_api: wraps the app's own iframe. */
const FAKE_API = `
window.YT = {
  Player: function (iframe, options) {
    var post = function (func) {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: func, args: [] }), '*');
      }
    };
    setTimeout(function () {
      if (options && options.events && options.events.onReady) options.events.onReady({});
    }, 50);
    return {
      unMute: function () { post('unMute'); },
      playVideo: function () { post('playVideo'); },
      destroy: function () {},
    };
  },
};
setTimeout(function () { if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady(); }, 0);
`;

/** Stand-in for the embedded player page. */
const FAKE_EMBED = `<!doctype html><html><body style="margin:0;height:100vh;display:grid;place-items:center;background:#123;color:#fff;font:700 48px sans-serif">
<div id="label">TRAILER (stub, muted)</div>
<script>
  addEventListener('message', (event) => {
    let message; try { message = JSON.parse(event.data); } catch { return; }
    if (message.event === 'command' && message.func === 'unMute') {
      document.getElementById('label').textContent = 'TRAILER (stub, sound on)';
    }
  });
</script></body></html>`;

/** 1×1 grey JPEG, served instead of YouTube thumbnails. */
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return null;
  }
}

/** Playwright's Chromium if it was downloaded, otherwise the installed Chrome, then Edge. */
async function launchBrowser(playwright) {
  const options = {
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  };
  let lastError;
  for (const channel of [undefined, 'chrome', 'msedge']) {
    try {
      return await playwright.chromium.launch(channel ? { ...options, channel } : options);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function main() {
  const playwright = await loadPlaywright();
  if (!playwright) {
    console.log('SKIPPED: Playwright is not installed (npm i -D playwright), so nothing ran.');
    return 0;
  }
  if (!existsSync(join(ROOT, 'dist', 'index.html'))) {
    console.error('FAILED: dist/ is missing. Run `npm run build` first.');
    return 1;
  }
  if (!args.includes('--keep')) rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const { preview } = await import('vite');
  const server = await preview({ root: ROOT, logLevel: 'error', preview: { port: 4317 } });
  const baseUrl = server.resolvedUrls.local[0];
  const browser = await launchBrowser(playwright);
  const problems = [];

  /** A fresh page with error collection and the YouTube stand-ins. */
  async function openPage(options = {}) {
    const context = await browser.newContext({
      viewport: options.viewport ?? { width: 360, height: 740 },
      deviceScaleFactor: 1,
      locale: options.locale ?? 'en-CA',
      reducedMotion: options.reducedMotion ?? 'no-preference',
      acceptDownloads: true,
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
      options.blockYouTubeApi
        ? route.abort()
        : route.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_API }),
    );
    const page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      if (options.allowConsole?.test(message.text())) return;
      problems.push(`console error: ${message.text()}`);
    });
    page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
    return { context, page };
  }

  const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`) });
  const textOf = async (page, selector) =>
    ((await page.locator(selector).first().textContent()) ?? '').trim();
  const waitForData = (page, name, values, timeout = 20_000) =>
    page.waitForFunction(
      ([key, wanted]) => wanted.includes(document.querySelector('.view')?.dataset[key] ?? ''),
      [name, values],
      { timeout },
    );
  async function expectNoOverflow(page, label) {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 1) throw new Error(`${label}: the page is ${overflow}px wider than the screen`);
  }
  function check(condition, message) {
    if (!condition) throw new Error(message);
  }
  const at = (hash, query = '') => `${baseUrl}${query}#${hash}`;

  const steps = [
    {
      name: 'home lists the theatres with the disclaimer',
      async run() {
        const { context, page } = await openPage();
        await page.goto(at('/', '?lang=en'));
        await page.waitForSelector('.card-list');
        const count = await page.locator('.card-list .card').count();
        check(count === 7, `expected 7 theatres, found ${count}`);
        check((await textOf(page, 'h1')) === 'Pick a theatre', 'wrong heading');
        const footer = await textOf(page, '.app-footer__text');
        check(footer.includes('not affiliated with Cineplex Entertainment'), 'no disclaimer');
        await expectNoOverflow(page, 'home');
        await shot(page, '01-home');
        await context.close();
      },
    },
    {
      name: 'language switch, <html lang>, saved choice and ?lang=',
      async run() {
        const { context, page } = await openPage();
        await page.goto(at('/', '?lang=en'));
        await page.getByRole('button', { name: '한국어' }).click();
        check((await page.getAttribute('html', 'lang')) === 'ko', 'lang is not ko');
        check((await textOf(page, 'h1')) !== 'Pick a theatre', 'heading not translated');
        check(!page.url().includes('lang='), '?lang= stays after choosing a language');
        await page.reload();
        await page.waitForSelector('.card-list');
        check((await page.getAttribute('html', 'lang')) === 'ko', 'the choice was not saved');
        await page.goto(at('/', '?lang=zh-Hans'));
        await page.waitForSelector('.card-list');
        check((await page.getAttribute('html', 'lang')) === 'zh-Hans', '?lang= was ignored');
        await shot(page, '02-home-zh');
        await context.close();
      },
    },
    {
      name: 'theatre page shows seat-map thumbnails',
      async run() {
        const { context, page } = await openPage();
        await page.goto(at(`/t/${THEATRE}`, '?lang=en'));
        await page.waitForSelector('.card--auditorium');
        check((await page.locator('.card--auditorium .card__thumb').count()) > 0, 'no thumbnail');
        await page.locator('.card--auditorium').first().click();
        await page.waitForSelector('.paste-form');
        check(
          page.url().includes(`/t/${THEATRE}/${AUDITORIUM}/trailer`),
          'not on the trailer step',
        );
        await context.close();
      },
    },
    {
      name: 'trailer step: official list, link errors, pasted link',
      async run() {
        const { context, page } = await openPage();
        await page.goto(at(`/t/${THEATRE}/${AUDITORIUM}/trailer`, '?lang=en'));
        await page.waitForSelector('.movie');
        check((await page.locator('.movie').count()) >= 3, 'fewer than 3 movies listed');
        check((await textOf(page, '.movie__channel')).length > 0, 'channel name missing');
        const input = page.locator('.paste-form__input');
        await input.fill('https://vimeo.com/123');
        await input.press('Enter');
        check((await textOf(page, '.paste-form__error')).includes('YouTube'), 'no error shown');
        await input.fill(`https://youtu.be/${VIDEO}?si=abc`);
        await input.press('Enter');
        await page.waitForSelector('.seat-map');
        check(page.url().includes(`v=${VIDEO}`), 'pasted link was not used');
        await shot(page, '03-trailer-then-seats');
        await context.close();
      },
    },
    {
      name: 'seat map: arrow keys, nudges and Take this seat',
      async run() {
        const { context, page } = await openPage();
        await page.goto(at(`/t/${THEATRE}/${AUDITORIUM}/seats`, `?lang=en`) + `?v=${VIDEO}`);
        await page.waitForSelector('.seat[aria-pressed="true"]');
        check((await page.locator('.legend__item').count()) === 5, 'legend is incomplete');
        const start = await page.locator('.seat[aria-pressed="true"]').getAttribute('data-key');
        await page.locator('.seat[aria-pressed="true"]').focus();
        await page.keyboard.press('ArrowRight');
        const moved = await page.evaluate(() => document.activeElement?.getAttribute('data-key'));
        check(moved && moved !== start, 'arrow key did not move the selection');
        const nudge = page.getByRole('button', { name: 'Row further back' });
        await nudge.click();
        const focus = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
        check(focus === 'Row further back', 'nudge button lost focus');
        check(page.url().includes('seat='), 'selection not kept in the address');
        await expectNoOverflow(page, 'seat map');
        await shot(page, '04-seat-map');
        await page.getByRole('button', { name: 'Take this seat' }).click();
        await page.waitForSelector('.view__canvas');
        await context.close();
      },
    },
    {
      name: 'walk-in: skip, trailer plays muted, tap for sound',
      async run() {
        const { context, page } = await openPage({ viewport: { width: 390, height: 844 } });
        await page.goto(at(`/t/${THEATRE}/${AUDITORIUM}/view/K-13`, '?lang=en') + `?v=${VIDEO}`);
        await waitForData(page, 'mode', ['walking']);
        await shot(page, '05-walking');
        await page.getByRole('button', { name: 'Skip', exact: true }).click();
        await waitForData(page, 'mode', ['seated'], 2000);
        await waitForData(page, 'video', ['muted']);
        check(
          (await page.locator('.view__video').count()) === 1,
          'the player is not on the screen',
        );
        await page.getByRole('button', { name: 'Tap for sound' }).click();
        await waitForData(page, 'video', ['playing'], 2000);
        await expectNoOverflow(page, '3D view');
        await shot(page, '06-seated');
        await page.getByRole('button', { name: 'Replay walk' }).click();
        await waitForData(page, 'mode', ['walking'], 2000);
        check((await page.locator('.view__video').count()) === 0, 'player kept during the walk');
        await context.close();
      },
    },
    {
      name: 'reduced motion starts seated without a replay button',
      async run() {
        const { context, page } = await openPage({ reducedMotion: 'reduce' });
        await page.goto(at(`/t/${THEATRE}/${AUDITORIUM}/view/K-13`, '?lang=en'));
        await waitForData(page, 'mode', ['seated'], 5000);
        const replay = page.getByRole('button', { name: 'Replay walk' });
        check(!(await replay.isVisible()), 'Replay walk is visible with reduced motion');
        await context.close();
      },
    },
    {
      name: 'fill screen, video not showing, and folding the card',
      async run() {
        const { context, page } = await openPage({ reducedMotion: 'reduce' });
        await page.goto(at(`/t/${THEATRE}/${AUDITORIUM}/view/K-13`, '?lang=en') + `?v=${VIDEO}`);
        await waitForData(page, 'video', ['muted']);
        await page.getByRole('button', { name: 'Fill screen' }).click();
        check(await page.getByRole('button', { name: 'Fit video' }).isVisible(), 'no Fit video');
        await page.getByRole('button', { name: 'Hide details' }).click();
        check(!(await page.locator('.seat-card__verdict').isVisible()), 'card did not fold');
        await page.getByRole('button', { name: 'Show details' }).click();
        await page.getByRole('button', { name: 'Video not showing?' }).click();
        await waitForData(page, 'video', ['failed'], 2000);
        check(await page.getByRole('link', { name: 'Open trailer' }).isVisible(), 'no fallback');
        await shot(page, '07-gave-up');
        await context.close();
      },
    },
    {
      name: 'forced fallback with ?fallback=1',
      async run() {
        const { context, page } = await openPage({ reducedMotion: 'reduce' });
        await page.goto(
          at(`/t/${THEATRE}/${AUDITORIUM}/view/K-13`, '?lang=en') + `?v=${VIDEO}&fallback=1`,
        );
        await waitForData(page, 'mode', ['seated'], 5000);
        check(await page.getByRole('link', { name: 'Open trailer' }).isVisible(), 'no fallback');
        check((await page.locator('.view__video').count()) === 0, 'player mounted anyway');
        await context.close();
      },
    },
    {
      name: 'YouTube API blocked: the player still plays and unmutes',
      async run() {
        const { context, page } = await openPage({
          reducedMotion: 'reduce',
          blockYouTubeApi: true,
          allowConsole: /Failed to load resource|ERR_FAILED/,
        });
        await page.goto(at(`/t/${THEATRE}/${AUDITORIUM}/view/K-13`, '?lang=en') + `?v=${VIDEO}`);
        await waitForData(page, 'video', ['muted']);
        await page.getByRole('button', { name: 'Tap for sound' }).click();
        await waitForData(page, 'video', ['playing'], 2000);
        await context.close();
      },
    },
    {
      name: 'editor: compact errors and Download JSON',
      async run() {
        const { context, page } = await openPage({ viewport: { width: 1280, height: 900 } });
        await page.goto(at('/editor', '?lang=en'));
        await page.waitForSelector('.editor__stage canvas');
        // The editor re-renders shortly after typing stops, so wait for the result itself.
        await page.locator('.editor__seats').fill('A: 1-4 | 5-8\nB 1-4');
        await page
          .waitForFunction(
            () => document.querySelector('.editor__problems')?.textContent?.includes('Line 2'),
            null,
            { timeout: 10_000 },
          )
          .catch(() => {});
        check((await textOf(page, '.editor__problems')).includes('Line 2'), 'error not shown');
        await page.locator('.editor__seats').fill('A: 1-4 | 5-8\nＢ：１－４｜５－８');
        await page.waitForFunction(() => !document.querySelector('.editor__problems li'), null, {
          timeout: 10_000,
        });
        await page.waitForFunction(
          () => !document.querySelector('.editor__panel button.button')?.disabled,
          null,
          { timeout: 10_000 },
        );
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          page.getByRole('button', { name: 'Download JSON' }).click(),
        ]);
        check(download.suggestedFilename().endsWith('.json'), 'download is not JSON');
        await shot(page, '08-editor');
        await context.close();
      },
    },
    {
      name: 'Korean and Chinese fit a 360 px screen',
      async run() {
        const { context, page } = await openPage({ reducedMotion: 'reduce' });
        for (const lang of ['ko', 'zh-Hans']) {
          for (const hash of [
            '/',
            `/t/${THEATRE}/${AUDITORIUM}/trailer`,
            `/t/${THEATRE}/${AUDITORIUM}/seats`,
            `/t/${THEATRE}/${AUDITORIUM}/view/K-13`,
          ]) {
            await page.goto('about:blank');
            await page.goto(at(hash, `?lang=${lang}`));
            await page.waitForTimeout(400);
            await expectNoOverflow(page, `${lang} ${hash}`);
          }
          await shot(page, `09-view-${lang}`);
        }
        await context.close();
      },
    },
    {
      name: 'unknown pages show "Page not found"',
      async run() {
        const { context, page } = await openPage();
        await page.goto(at('/nowhere', '?lang=en'));
        await page.waitForSelector('h1');
        check((await textOf(page, 'h1')) === 'Page not found', 'no not-found page');
        await context.close();
      },
    },
  ];

  let failed = 0;
  for (const step of steps) {
    if (only && !step.name.includes(only)) continue;
    const before = problems.length;
    const started = Date.now();
    try {
      await step.run();
      if (problems.length > before) throw new Error(problems.slice(before).join('\n         '));
      console.log(`  ok    ${step.name} (${Date.now() - started} ms)`);
    } catch (error) {
      failed += 1;
      console.log(`  FAIL  ${step.name}\n         ${error.message.split('\n')[0]}`);
    }
  }

  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
  const where = relative(ROOT, OUT);
  console.log(
    failed === 0
      ? `PASSED: all smoke steps ok. Screenshots in ${where}/`
      : `FAILED: ${failed} step(s). Screenshots in ${where}/`,
  );
  return failed === 0 ? 0 : 1;
}

process.exitCode = await main().catch((error) => {
  console.error(`FAILED: ${error.stack ?? error}`);
  return 1;
});
