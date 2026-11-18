/**
 * The steps of the browser smoke test (see smoke.cjs). Each step opens its own page, so one
 * failure does not hide the others. Add a step whenever a milestone adds a screen.
 */

const THEATRE = 'cineplex-coquitlam';
const AUDITORIUM = 'coquitlam-sample';

async function text(page, selector) {
  return (await page.locator(selector).first().textContent())?.trim();
}

module.exports = [
  {
    name: 'home lists the theatres',
    async run({ baseUrl, openPage, shot, expectNoOverflow }) {
      const { context, page } = await openPage();
      await page.goto(baseUrl);
      await page.waitForSelector('.listing__row');
      const count = await page.locator('.listing__row').count();
      if (count !== 7) throw new Error(`expected 7 theatres, found ${count}`);
      if ((await text(page, 'h1')) !== 'Pick a theatre') throw new Error('wrong heading');
      const footer = await text(page, '.footer__disclaimer');
      if (!footer.includes('not affiliated with Cineplex Entertainment')) {
        throw new Error('disclaimer missing from the footer');
      }
      await expectNoOverflow(page, 'home');
      await shot(page, '01-home-en');
      await context.close();
    },
  },
  {
    name: 'language: switcher, <html lang>, saved choice, ?lang=',
    async run({ baseUrl, openPage, shot, expectNoOverflow }) {
      const { context, page } = await openPage();
      await page.goto(baseUrl);
      await page.getByRole('button', { name: '한국어' }).click();
      if ((await page.getAttribute('html', 'lang')) !== 'ko') throw new Error('lang is not ko');
      const korean = await text(page, 'h1');
      if (korean === 'Pick a theatre') throw new Error('heading was not translated');
      await expectNoOverflow(page, 'home (ko)');
      await shot(page, '02-home-ko');

      // The choice survives a reload.
      await page.reload();
      await page.waitForSelector('.listing__row');
      if ((await page.getAttribute('html', 'lang')) !== 'ko') {
        throw new Error('saved language was not restored');
      }

      // ?lang= wins over the saved choice.
      await page.goto(`${baseUrl}?lang=zh-Hans`);
      await page.waitForSelector('.listing__row');
      if ((await page.getAttribute('html', 'lang')) !== 'zh-Hans') {
        throw new Error('?lang=zh-Hans was ignored');
      }
      await expectNoOverflow(page, 'home (zh-Hans)');
      await shot(page, '03-home-zh');

      // Choosing a language by hand removes ?lang= so it cannot override the choice later.
      await page.getByRole('button', { name: 'EN', exact: true }).click();
      if (new URL(page.url()).searchParams.has('lang')) throw new Error('?lang= was not removed');
      if ((await page.getAttribute('html', 'lang')) !== 'en') throw new Error('lang is not en');
      await context.close();
    },
  },
  {
    name: 'browser language picks the initial language',
    async run({ baseUrl, openPage }) {
      const { context, page } = await openPage({ locale: 'zh-CN' });
      await page.goto(baseUrl);
      await page.waitForSelector('.listing__row');
      if ((await page.getAttribute('html', 'lang')) !== 'zh-Hans') {
        throw new Error('zh-CN browser did not get zh-Hans');
      }
      await context.close();
    },
  },
  {
    name: 'theatre page shows auditoriums with seat-map thumbnails',
    async run({ baseUrl, openPage, shot, expectNoOverflow }) {
      const { context, page } = await openPage();
      await page.goto(baseUrl);
      await page.locator('.listing__row').first().click();
      await page.waitForSelector('.aud-card');
      const seats = await page.locator('.aud-card .mini-map__seat').count();
      if (seats !== 214) throw new Error(`expected 214 thumbnail seats, found ${seats}`);
      if ((await page.locator('.badge--estimated').count()) < 1) {
        throw new Error('estimated-dimensions badge missing');
      }
      await expectNoOverflow(page, 'theatre');
      await shot(page, '04-theatre-en');

      await page.getByRole('button', { name: '한국어' }).click();
      await page.waitForSelector('.aud-card');
      await expectNoOverflow(page, 'theatre (ko)');
      await shot(page, '05-theatre-ko');
      await context.close();
    },
  },
  {
    name: 'auditorium screens fit 360 px in every language',
    async run({ baseUrl, openPage, shot, expectNoOverflow }) {
      const { context, page } = await openPage();
      const rooms = [
        [THEATRE, AUDITORIUM],
        ['cineplex-vip-brentwood', 'brentwood-vip-sample'],
      ];
      for (const lang of ['en', 'ko', 'zh-Hans']) {
        for (const [theatre, auditorium] of rooms) {
          await page.goto(`${baseUrl}?lang=${lang}#/t/${theatre}/${auditorium}`);
          await page.waitForSelector('.room-details');
          await page.locator('.room-details__summary').click();
          await page.waitForSelector('.room-details[open] .room-details__row');
          await expectNoOverflow(page, `${auditorium} (${lang})`);
        }
        await shot(page, `06-auditorium-${lang}`);
      }
      await context.close();
    },
  },
  {
    name: 'trailer picker: paste a link, errors, continue without',
    async run({ baseUrl, openPage, shot, expectNoOverflow }) {
      const { context, page } = await openPage();
      await page.goto(`${baseUrl}#/t/${THEATRE}/${AUDITORIUM}`);
      await page.waitForSelector('form.paste');
      if ((await text(page, 'h1')) !== 'Pick a trailer') throw new Error('wrong heading');
      // No verified trailers ship yet, so the paste form is the main path.
      if ((await page.locator('.trailer-section__note').count()) !== 1) {
        throw new Error('the empty-list note is missing');
      }
      await page.click('form.paste button[type=submit]');
      await page
        .locator('.field__error', { hasText: 'Paste a YouTube link first.' })
        .waitFor({ timeout: 2000 });
      await page.fill('#trailer-url', 'https://vimeo.com/12345');
      await page.press('#trailer-url', 'Enter');
      await page
        .locator('.field__error', { hasText: "That isn't a YouTube video link" })
        .waitFor({ timeout: 2000 });
      if ((await page.getAttribute('#trailer-url', 'aria-invalid')) !== 'true') {
        throw new Error('the field is not marked invalid');
      }
      await expectNoOverflow(page, 'trailer picker');
      await shot(page, '09-trailer-en');
      await page.fill('#trailer-url', 'youtu.be/dQw4w9WgXcQ?t=5');
      await page.press('#trailer-url', 'Enter');
      await page.waitForSelector('.seatmap');
      if (!page.url().includes('v=dQw4w9WgXcQ')) throw new Error('video id not carried over');
      if ((await text(page, '.seatmap-context__trailer')) !== 'Trailer: your YouTube link') {
        throw new Error('the chosen trailer is not shown');
      }
      await page.goBack();
      await page.waitForSelector('form.paste');
      await page.click('.trailer-skip a');
      await page.waitForSelector('.seatmap');
      if ((await text(page, '.seatmap-context__trailer')) !== 'No trailer') {
        throw new Error('"No trailer" is not shown');
      }
      await context.close();
    },
  },
  {
    name: 'seat map: bands, best seat, keyboard, tap, nudge, take seat, back',
    async run({ baseUrl, openPage, shot, expectNoOverflow }) {
      const { context, page } = await openPage();
      await page.goto(`${baseUrl}#/t/${THEATRE}/${AUDITORIUM}/seats?v=dQw4w9WgXcQ`);
      await page.waitForSelector('.seatmap');
      const seats = await page.locator('.seatmap [role=gridcell]').count();
      if (seats !== 214) throw new Error(`expected 214 seats, found ${seats}`);
      for (const band of ['prime', 'recommended', 'avoid']) {
        if ((await page.locator(`.seatmap .seat--${band}`).count()) === 0) {
          throw new Error(`no ${band} seats`);
        }
      }
      if ((await page.locator('.legend__item').count()) !== 5) throw new Error('legend incomplete');
      const selected = page.locator('.seatmap [aria-selected=true]');
      if ((await selected.count()) !== 1) throw new Error('not exactly one selected seat');
      if (!(await selected.getAttribute('class')).includes('seat--prime')) {
        throw new Error('the map does not start on a prime seat');
      }
      if ((await page.locator('.seatmap-hint').count()) !== 1) throw new Error('hint missing');
      await expectNoOverflow(page, 'seat map');
      await shot(page, '10-seatmap-en');

      // Keyboard: the selected seat is the tab stop; arrows move the selection and the URL.
      const start = await selected.getAttribute('data-seat');
      await selected.focus();
      await page.keyboard.press('ArrowRight');
      const afterRight = await page
        .locator('.seatmap [aria-selected=true]')
        .getAttribute('data-seat');
      if (afterRight === start) throw new Error('ArrowRight did not move');
      // The address follows the selection (written a moment later, not on every key press).
      await page.waitForFunction(
        (seat) => decodeURIComponent(location.href).includes(`seat=${seat}`),
        afterRight,
      );
      await page.keyboard.press('ArrowUp');
      const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-seat'));
      const now = await page.locator('.seatmap [aria-selected=true]').getAttribute('data-seat');
      if (focused !== now) throw new Error('focus does not follow the selection');
      if ((await page.locator('.seatmap [tabindex="0"]').count()) !== 1) {
        throw new Error('more than one tab stop in the grid');
      }

      // Tap: a seat in the front row becomes the selection and the card says why to avoid it.
      await page.locator('.seatmap [data-seat="A-7"]').click();
      if ((await text(page, '.seat-card__seat')) !== 'Row A, Seat 7') throw new Error('tap missed');
      if ((await text(page, '.seat-card .band-chip')) !== 'Avoid') throw new Error('A-7 not avoid');
      if ((await page.locator('.seat-card .metric').count()) !== 4)
        throw new Error('metrics missing');

      // Nudge buttons move by one seat or row, and keep keyboard focus for the next press.
      await page.getByRole('button', { name: 'Row further back' }).click();
      const inRowB = await text(page, '.seat-card__seat');
      if (!inRowB.startsWith('Row B,')) throw new Error('nudge failed');
      await page.getByRole('button', { name: 'Seat to the right' }).focus();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      const nudgeFocus = await page.evaluate(() =>
        document.activeElement?.getAttribute('aria-label'),
      );
      if (nudgeFocus !== 'Seat to the right') throw new Error('a nudge lost keyboard focus');
      const seatNumber = (name) => Number(name.replace(/^.*Seat /, ''));
      if (seatNumber(await text(page, '.seat-card__seat')) !== seatNumber(inRowB) + 2) {
        throw new Error('two nudges to the right did not move two seats');
      }
      // The selected seat carries the verdict as its description.
      const described = await page
        .locator('.seatmap [aria-selected=true]')
        .getAttribute('aria-describedby');
      if (described !== 'seat-card-verdict') throw new Error('seat not described by the verdict');

      // Take this seat opens the 3D view of that seat, with the trailer; Back returns to it.
      const chosen = await page.locator('.seatmap [aria-selected=true]').getAttribute('data-seat');
      await page.click('.seat-card__take');
      await page.waitForSelector('.seat-view');
      if (!decodeURIComponent(page.url()).includes(`/view/${chosen}?v=dQw4w9WgXcQ`)) {
        throw new Error(`wrong view URL: ${page.url()}`);
      }
      await page.goBack();
      await page.waitForSelector('.seatmap');
      const back = await page.locator('.seatmap [aria-selected=true]').getAttribute('data-seat');
      if (back !== chosen) throw new Error('the seat was not remembered');

      for (const lang of ['ko', 'zh-Hans']) {
        await page.goto(
          `${baseUrl}?lang=${lang}#/t/cineplex-vip-brentwood/brentwood-vip-sample/seats`,
        );
        await page.waitForSelector('.seatmap');
        await expectNoOverflow(page, `seat map (${lang})`);
        await shot(page, `11-seatmap-${lang}`);
      }
      await context.close();
    },
  },
  {
    name: 'seated view: 3D room, drag to look, recentre, language, back',
    async run({ baseUrl, openPage, shot, expectNoOverflow }) {
      const { context, page } = await openPage();
      await page.goto(`${baseUrl}#/t/${THEATRE}/${AUDITORIUM}/seats`);
      await page.locator('.seat-card__take').click();
      await page.waitForSelector('.seat-view.is-ready', { timeout: 30000 });
      const canvas = await page.locator('.stage__canvas').boundingBox();
      if (!canvas || canvas.width < 300 || canvas.height < 600) {
        throw new Error('the 3D canvas does not fill the screen');
      }
      const seat = await text(page, '.view-card__seat');
      if (!/^Row [A-Z]+, Seat \d+$/.test(seat)) throw new Error(`odd seat name: ${seat}`);
      if (!(await text(page, '.view-card__numbers')).includes('Viewing angle')) {
        throw new Error('metrics missing from the card');
      }
      await expectNoOverflow(page, 'seated view');
      await shot(page, '07-seated-en');

      // Drag to look turns the view; Recentre brings it back.
      await page.mouse.move(canvas.x + 120, canvas.y + 200);
      await page.mouse.down();
      await page.mouse.move(canvas.x + 300, canvas.y + 230, { steps: 6 });
      await page.mouse.up();
      await page.waitForSelector('.view-recentre:not([hidden])');
      await page.click('.view-recentre');
      await page.waitForSelector('.view-recentre[hidden]', { state: 'attached' });

      // Arrow keys look around too.
      await page.focus('.stage');
      await page.keyboard.press('ArrowLeft');
      await page.waitForSelector('.view-recentre:not([hidden])');

      // The language switcher works inside the full-screen view without rebuilding the scene.
      await page.getByRole('button', { name: '한국어' }).click();
      if ((await page.getAttribute('html', 'lang')) !== 'ko') throw new Error('lang is not ko');
      if ((await text(page, '.view-card__seat')) === seat) throw new Error('card not translated');
      if ((await page.locator('.stage__canvas').count()) !== 1)
        throw new Error('scene was rebuilt');
      await expectNoOverflow(page, 'seated view (ko)');
      await shot(page, '08-seated-ko');

      // The card folds away and comes back, and keyboard focus stays on the toggle.
      await page.focus('.view-card__toggle');
      await page.keyboard.press('Enter');
      await page.waitForSelector('.view-card.is-collapsed');
      await page.keyboard.press('Enter');
      await page.waitForSelector('.view-card:not(.is-collapsed) .view-card__verdict');
      const toggleFocused = await page.evaluate(() =>
        document.activeElement?.classList.contains('view-card__toggle'),
      );
      if (!toggleFocused) throw new Error('focus lost after toggling the card');

      // Keyboard focus also survives a language change.
      await page.getByRole('button', { name: 'EN', exact: true }).focus();
      await page.keyboard.press('Enter');
      const langFocused = await page.evaluate(() => document.activeElement?.textContent);
      if (langFocused !== 'EN') throw new Error('focus lost after switching language');

      // A landscape phone starts with the card folded so the screen stays visible.
      await page.setViewportSize({ width: 740, height: 360 });
      await page.reload();
      await page.waitForSelector('.seat-view.is-ready', { timeout: 30000 });
      if ((await page.locator('.view-card.is-collapsed').count()) !== 1) {
        throw new Error('card not folded on a landscape phone');
      }
      await shot(page, '08b-seated-landscape');
      await page.setViewportSize({ width: 360, height: 740 });

      // Escape leaves for the seat map.
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => location.hash.includes('/seats'));
      // The hash changes before the app handles hashchange, so wait for the view to unmount.
      await page.waitForSelector('.seat-view', { state: 'detached' });
      if ((await page.locator('.stage__canvas').count()) !== 0) {
        throw new Error('canvas left behind');
      }
      await context.close();
    },
  },
  {
    name: 'seated view handles an unknown seat',
    async run({ baseUrl, openPage }) {
      const { context, page } = await openPage();
      await page.goto(`${baseUrl}#/t/${THEATRE}/${AUDITORIUM}/view/Z-99`);
      await page.waitForSelector('.view-card__error');
      if ((await page.locator('.view-card a.btn').count()) !== 1) throw new Error('no way back');
      await context.close();
    },
  },
  {
    name: 'unknown routes and ids show a way back',
    async run({ baseUrl, openPage }) {
      const { context, page } = await openPage();
      for (const hash of ['#/nope', '#/t/not-a-theatre', `#/t/${THEATRE}/not-an-auditorium`]) {
        await page.goto(`${baseUrl}${hash}`);
        await page.waitForSelector('h1');
        if ((await page.locator('main a.btn').count()) !== 1) {
          throw new Error(`${hash}: no link back`);
        }
      }
      await context.close();
    },
  },
];

module.exports.THEATRE = THEATRE;
module.exports.AUDITORIUM = AUDITORIUM;
