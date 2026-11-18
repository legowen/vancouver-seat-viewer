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
    name: 'seated view: 3D room, drag to look, recentre, language, back',
    async run({ baseUrl, openPage, shot, expectNoOverflow }) {
      const { context, page } = await openPage();
      await page.goto(`${baseUrl}#/t/${THEATRE}/${AUDITORIUM}`);
      await page.locator('.best-seat a.btn').click();
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
