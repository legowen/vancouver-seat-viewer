/** Small pieces shared by several screens. */
import { h, s } from '../app/dom';
import type { AuditoriumEntry, DataIssue, TheatreEntry } from '../data/catalog';
import type { Auditorium } from '../data/resolve';
import { localizedName, t, tPlural, type MessageKey } from '../i18n';

export function theatreName(theatre: TheatreEntry): string {
  return localizedName(theatre.name, theatre.localizedNames);
}

/** A chevron drawn as SVG, so it mirrors and scales cleanly and is never read out. */
export function chevron(direction: 'left' | 'right' = 'right'): SVGSVGElement {
  return s(
    'svg',
    {
      class: `chevron chevron--${direction}`,
      viewBox: '0 0 8 14',
      width: 8,
      height: 14,
      'aria-hidden': 'true',
    },
    s('path', {
      d: direction === 'right' ? 'M1 1l6 6-6 6' : 'M7 1L1 7l6 6',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }),
  );
}

export function backLink(href: string, label: string): HTMLAnchorElement {
  return h('a', { class: 'back-link', href }, chevron('left'), h('span', null, label));
}

function badge(labelKey: MessageKey, hintKey: MessageKey, modifier: string): HTMLElement {
  return h('span', { class: `badge badge--${modifier}`, title: t(hintKey) }, t(labelKey));
}

/** "Sample layout" and "Estimated dimensions", whichever apply. */
export function auditoriumBadges(auditorium: Auditorium): HTMLElement | null {
  const badges: HTMLElement[] = [];
  if (auditorium.placeholder) badges.push(badge('badge.sample', 'badge.sampleHint', 'sample'));
  if (!auditorium.verified) {
    badges.push(badge('badge.estimated', 'badge.estimatedHint', 'estimated'));
  }
  return badges.length > 0 ? h('span', { class: 'badges' }, badges) : null;
}

/** The badges' explanations as visible text, for touch and keyboard users who never see a tooltip. */
export function auditoriumNotes(auditorium: Auditorium): HTMLElement | null {
  const notes: HTMLElement[] = [];
  if (auditorium.placeholder) {
    notes.push(
      h(
        'p',
        { class: 'aud-note' },
        h('span', { class: 'badge badge--sample' }, t('badge.sample')),
        h('span', null, t('badge.sampleHint')),
      ),
    );
  }
  if (!auditorium.verified) {
    notes.push(
      h(
        'p',
        { class: 'aud-note' },
        h('span', { class: 'badge badge--estimated' }, t('badge.estimated')),
        h('span', null, t('badge.estimatedHint')),
      ),
    );
  }
  return notes.length > 0 ? h('div', { class: 'aud-notes' }, notes) : null;
}

/** "Standard", "12 rows", "214 seats" as separate facts (no separator characters to translate). */
export function auditoriumFacts(auditorium: Auditorium): HTMLElement {
  return h(
    'span',
    { class: 'facts' },
    h('span', { class: `tag tag--${auditorium.type}` }, t(`type.${auditorium.type}`)),
    h('span', null, tPlural('theatre.rows', auditorium.rows.length)),
    h('span', null, tPlural('theatre.seats', auditorium.seatCount)),
  );
}

/** Readable list of what is wrong with one or more data files. */
export function issueNotice(issues: readonly DataIssue[]): HTMLElement {
  return h(
    'div',
    { class: 'notice notice--error', role: 'alert' },
    issues.map((issue) =>
      h(
        'div',
        { class: 'notice__block' },
        h('p', { class: 'notice__title' }, t('error.fileInvalid', { file: issue.file })),
        h(
          'ul',
          { class: 'notice__list' },
          issue.messages.map((message) => h('li', null, message)),
        ),
      ),
    ),
  );
}

export function brokenAuditoriumNotice(
  entry: Extract<AuditoriumEntry, { ok: false }>,
): HTMLElement {
  return h(
    'div',
    { class: 'notice notice--error', role: 'alert' },
    h('p', { class: 'notice__title' }, t('error.auditoriumInvalid')),
    h('p', { class: 'notice__file' }, t('error.fileInvalid', { file: entry.issue.file })),
    h(
      'ul',
      { class: 'notice__list' },
      entry.issue.messages.map((message) => h('li', null, message)),
    ),
  );
}

/** A full-page message with a way out, for missing theatres, auditoriums and pages. */
export function messagePage(messageKey: MessageKey, linkHref: string, linkKey: MessageKey) {
  return h(
    'section',
    { class: 'page' },
    h('h1', { class: 'page__title', tabindex: '-1' }, t(messageKey)),
    h('p', null, h('a', { class: 'btn btn--ghost', href: linkHref }, t(linkKey))),
  );
}
