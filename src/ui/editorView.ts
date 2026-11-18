/**
 * Hidden dev page (#/editor): paste a seat map in the compact format, pick the theatre and type,
 * tune the dimensions, check a live 2D map and a live seated view, and download the JSON.
 * It uses the same importer as `npm run import:auditorium`.
 */
import { h, mount } from '../app/dom';
import { routes } from '../app/router';
import type { View } from '../app/view';
import {
  DIMENSION_LIMITS,
  defaultsFor,
  type AuditoriumType,
  type DimensionDefaults,
} from '../config/defaults';
import type { Catalog } from '../data/catalog';
import type { CompactErrorCode } from '../data/compact';
import { formatAuditoriumJson } from '../data/format';
import { auditoriumFromCompact, type DimensionOverrides } from '../data/importer';
import { resolveAuditorium } from '../data/resolve';
import { AUDITORIUM_TYPES, ENTRANCES, auditoriumSchema, type Entrance } from '../data/schema';
import { computeLayout } from '../geometry/layout';
import { formatMeters, formatNumber, t, type MessageKey } from '../i18n';
import { evaluateSeats } from '../metrics/seats';
import type { SeatScene, createSeatScene } from '../scene/seatScene';
import { backLink, theatreName } from './common';
import { seatName } from './seatInfo';
import { createSeatMap } from './seatMap';

const STORAGE_KEY = 'vsv.editor';

const EXAMPLE = `# Front row first. | is an aisle, _ is a missing seat.
A: 1-3 | 4-11 | 12-14
B: 1-4 | 5-14 | 15-18
C: 1-4 | 5-14 | 15-18
D: 1-4 | 5-14 | 15-18
E: 1-4 | 5-14 | 15-18
F: 1-4 | 5-7 _ _ 10-14 | 15-18
G: 1-4 | 5-14 | 15-18
H: 1-4 | 5-14 | 15-18
J: 1-20`;

const COMPACT_MESSAGES: Record<CompactErrorCode, MessageKey> = {
  missingColon: 'compact.missingColon',
  badLabel: 'compact.badLabel',
  badToken: 'compact.badToken',
  badRange: 'compact.badRange',
  emptyRow: 'compact.emptyRow',
  duplicateSeat: 'compact.duplicateSeat',
  duplicateRow: 'compact.duplicateRow',
  tooManySeats: 'compact.tooManySeats',
  tooWide: 'compact.tooWide',
  tooManyRows: 'compact.tooManyRows',
};

const DIMENSIONS: { key: keyof DimensionDefaults; label: MessageKey; ratio?: boolean }[] = [
  { key: 'screenWidth_m', label: 'editor.screenWidth' },
  { key: 'screenAspect', label: 'editor.aspect', ratio: true },
  { key: 'screenBottomHeight_m', label: 'editor.bottomHeight' },
  { key: 'firstRowDistance_m', label: 'editor.firstRow' },
  { key: 'rowSpacing_m', label: 'editor.rowSpacing' },
  { key: 'rowRise_m', label: 'editor.rowRise' },
  { key: 'seatWidth_m', label: 'editor.seatWidth' },
  { key: 'eyeHeight_m', label: 'editor.eyeHeight' },
];

const ENTRANCE_LABELS: Record<Entrance, MessageKey> = {
  'front-left': 'editor.entranceFrontLeft',
  'front-right': 'editor.entranceFrontRight',
  'back-left': 'editor.entranceBackLeft',
  'back-right': 'editor.entranceBackRight',
};

interface Draft {
  text: string;
  theatreId: string;
  id: string;
  name: string;
  type: AuditoriumType;
  entrance: Entrance;
  align: boolean;
  aisleCells: number;
  dimensions: DimensionOverrides;
  verified: boolean;
  source: string;
  notes: string;
  previewSeat: string | null;
}

function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function loadDraft(catalog: Catalog): Draft {
  const fallback: Draft = {
    text: '',
    theatreId: catalog.theatres[0]?.id ?? '',
    id: '',
    name: '',
    type: 'standard',
    entrance: 'front-left',
    align: true,
    aisleCells: 2,
    dimensions: {},
    verified: false,
    source: `seatmap screenshot ${today()}`,
    notes: '',
    previewSeat: null,
  };
  try {
    const saved = JSON.parse(
      globalThis.localStorage?.getItem(STORAGE_KEY) ?? 'null',
    ) as Partial<Draft> | null;
    return saved && typeof saved === 'object' ? { ...fallback, ...saved } : fallback;
  } catch {
    return fallback;
  }
}

function saveDraft(draft: Draft): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // The draft is a convenience; losing it on reload is acceptable.
  }
}

function field(label: string, control: HTMLElement, help?: string): HTMLElement {
  return h(
    'label',
    { class: 'editor-field' },
    h('span', { class: 'editor-field__label' }, label),
    control,
    help ? h('span', { class: 'editor-field__help' }, help) : null,
  );
}

export function createEditorView(catalog: Catalog): View {
  const draft = loadDraft(catalog);
  let scene: SeatScene | null = null;
  let sceneModule: { createSeatScene: typeof createSeatScene } | null = null;
  let sceneTimer = 0;
  let destroyed = false;
  let json = '';

  const textArea = h('textarea', {
    class: 'editor-text',
    rows: 10,
    spellcheck: 'false',
    autocapitalize: 'off',
    autocomplete: 'off',
  });
  textArea.value = draft.text;

  const errorsBox = h('div', { class: 'editor-errors', 'aria-live': 'polite' });
  const summary = h('p', { class: 'editor-summary' });
  const mapBox = h('div', { class: 'editor-map' });
  const stageBox = h('div', { class: 'editor-stage stage', tabindex: '0' });
  const stageNote = h('p', { class: 'editor-preview-note' });
  const output = h('pre', { class: 'editor-json' });
  const downloadNote = h('p', { class: 'field__error', 'aria-live': 'polite' });
  const sliders = h('div', { class: 'editor-sliders' });

  const theatreSelect = h(
    'select',
    { class: 'editor-input' },
    catalog.theatres.map((theatre) => h('option', { value: theatre.id }, theatreName(theatre))),
  );
  theatreSelect.value = draft.theatreId;
  const idInput = h('input', { class: 'editor-input', type: 'text', spellcheck: 'false' });
  idInput.value = draft.id;
  const nameInput = h('input', { class: 'editor-input', type: 'text' });
  nameInput.value = draft.name;
  const typeSelect = h(
    'select',
    { class: 'editor-input' },
    AUDITORIUM_TYPES.map((type) => h('option', { value: type }, t(`type.${type}`))),
  );
  typeSelect.value = draft.type;
  const entranceSelect = h(
    'select',
    { class: 'editor-input' },
    ENTRANCES.map((entrance) => h('option', { value: entrance }, t(ENTRANCE_LABELS[entrance]))),
  );
  entranceSelect.value = draft.entrance;
  const alignBox = h('input', { type: 'checkbox' });
  alignBox.checked = draft.align;
  const aisleInput = h('input', {
    class: 'editor-input editor-input--short',
    type: 'number',
    min: 1,
    max: 6,
    step: 1,
  });
  aisleInput.value = String(draft.aisleCells);
  const verifiedBox = h('input', { type: 'checkbox' });
  verifiedBox.checked = draft.verified;
  const sourceInput = h('input', { class: 'editor-input', type: 'text' });
  sourceInput.value = draft.source;
  const notesInput = h('textarea', { class: 'editor-input', rows: 2 });
  notesInput.value = draft.notes;

  function readForm(): void {
    draft.text = textArea.value;
    draft.theatreId = theatreSelect.value;
    draft.id = idInput.value.trim();
    draft.name = nameInput.value;
    draft.type = typeSelect.value as AuditoriumType;
    draft.entrance = entranceSelect.value as Entrance;
    draft.align = alignBox.checked;
    draft.aisleCells = Math.min(6, Math.max(1, Math.round(Number(aisleInput.value) || 2)));
    draft.verified = verifiedBox.checked;
    draft.source = sourceInput.value;
    draft.notes = notesInput.value;
  }

  function build() {
    return auditoriumFromCompact(draft.text, {
      id: draft.id || 'new-auditorium',
      theatreId: draft.theatreId || 'theatre',
      name: draft.name.trim() || 'New auditorium',
      type: draft.type,
      entrance: draft.entrance,
      align: draft.align,
      aisleCells: draft.aisleCells,
      dimensions: draft.dimensions,
      verified: draft.verified,
      source: draft.source,
      notes: draft.notes,
    });
  }

  function renderSliders(defaults: DimensionDefaults): void {
    mount(
      sliders,
      DIMENSIONS.map(({ key, label, ratio }) => {
        const limits = DIMENSION_LIMITS[key];
        const overridden = draft.dimensions[key] !== undefined;
        const value = draft.dimensions[key] ?? defaults[key];
        const shown = h(
          'output',
          { class: 'editor-slider__value' },
          ratio ? `${formatNumber(value, 2)}:1` : formatMeters(value, undefined, 2),
          overridden ? null : h('span', { class: 'room-details__default' }, t('editor.default')),
        );
        const input = h('input', {
          type: 'range',
          min: limits.min,
          max: limits.max,
          step: limits.step,
          'aria-label': t(label),
        });
        input.value = String(value);
        input.addEventListener('input', () => {
          draft.dimensions = { ...draft.dimensions, [key]: Number(input.value) };
          update({ sliders: false });
          shown.replaceChildren(
            ratio
              ? `${formatNumber(Number(input.value), 2)}:1`
              : formatMeters(Number(input.value), undefined, 2),
          );
        });
        return h(
          'div',
          { class: 'editor-slider' },
          h('span', { class: 'editor-slider__label' }, t(label)),
          shown,
          input,
        );
      }),
    );
  }

  function scheduleScene(): void {
    window.clearTimeout(sceneTimer);
    sceneTimer = window.setTimeout(() => void rebuildScene(), 350);
  }

  async function rebuildScene(): Promise<void> {
    const result = build();
    if (!result.auditorium || result.issues.length > 0) return;
    const auditorium = resolveAuditorium(auditoriumSchema.parse(result.auditorium));
    const layout = computeLayout(auditorium);
    const seatId =
      draft.previewSeat && layout.seatById.has(draft.previewSeat)
        ? draft.previewSeat
        : layout.seats[Math.floor(layout.seats.length / 2)]?.id;
    if (!seatId) return;
    try {
      sceneModule ??= await import('../scene/seatScene');
      if (destroyed) return;
      scene?.dispose();
      scene = sceneModule.createSeatScene({ container: stageBox, auditorium, layout, seatId });
      const seat = layout.seatById.get(seatId);
      stageNote.textContent = seat ? t('editor.previewSeat', { seat: seatName(seat) }) : '';
    } catch {
      scene = null;
      stageNote.textContent = t('view.webglError');
    }
  }

  function update(options: { sliders?: boolean } = {}): void {
    readForm();
    saveDraft(draft);
    const result = build();
    const lines: HTMLElement[] = result.errors.map((error) =>
      h(
        'li',
        null,
        t('editor.lineError', {
          line: error.line,
          message: t(COMPACT_MESSAGES[error.code], error.params),
        }),
      ),
    );
    for (const issue of result.issues) lines.push(h('li', null, issue));
    mount(
      errorsBox,
      lines.length > 0
        ? h(
            'div',
            { class: 'notice notice--error' },
            h('p', { class: 'notice__title' }, t('editor.errorsHeading')),
            h('ul', { class: 'notice__list' }, lines),
          )
        : null,
    );

    if (!result.auditorium) {
      json = '';
      summary.textContent = draft.text.trim() ? '' : t('editor.empty');
      mount(mapBox);
      output.textContent = '';
      if (options.sliders !== false) renderSliders(defaultsFor(draft.type, 0));
      scene?.dispose();
      scene = null;
      stageNote.textContent = '';
      return;
    }

    json = formatAuditoriumJson(result.auditorium);
    output.textContent = json;
    const parsed = auditoriumSchema.safeParse({
      ...result.auditorium,
      id: result.auditorium.id,
    });
    if (!parsed.success) return;
    const auditorium = resolveAuditorium(parsed.data);
    const layout = computeLayout(auditorium);
    summary.textContent = t('editor.summary', {
      rows: auditorium.rows.length,
      seats: auditorium.seatCount,
      size: t(`size.${auditorium.sizeClass}`),
    });
    if (options.sliders !== false)
      renderSliders(defaultsFor(auditorium.type, auditorium.seatCount));

    const evaluations = evaluateSeats(layout);
    const selected =
      draft.previewSeat && layout.seatById.has(draft.previewSeat)
        ? draft.previewSeat
        : (layout.seats[Math.floor(layout.seats.length / 2)]?.id ?? '');
    const map = createSeatMap({
      layout,
      evaluations,
      selectedId: selected,
      onSelect: (seatId) => {
        draft.previewSeat = seatId;
        saveDraft(draft);
        scheduleScene();
      },
      onActivate: () => undefined,
    });
    mount(mapBox, map.el);
    scheduleScene();
  }

  function download(): void {
    readForm();
    const result = build();
    if (!result.auditorium || !draft.id || result.issues.length > 0) {
      downloadNote.textContent = t('editor.idInvalid');
      return;
    }
    downloadNote.textContent = '';
    const blob = new Blob([formatAuditoriumJson(result.auditorium)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = h('a', { href: url, download: `${draft.id}.json` });
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const copyButton = h('button', { type: 'button', class: 'btn btn--ghost' }, t('editor.copy'));
  copyButton.addEventListener('click', async () => {
    if (!json) return;
    try {
      await navigator.clipboard.writeText(json);
      copyButton.textContent = t('editor.copied');
      window.setTimeout(() => (copyButton.textContent = t('editor.copy')), 1600);
    } catch {
      // Clipboard access can be refused; the JSON is still selectable below.
    }
  });

  for (const control of [textArea, idInput, nameInput, sourceInput, notesInput, aisleInput]) {
    control.addEventListener('input', () => update());
  }
  for (const control of [theatreSelect, typeSelect, entranceSelect, alignBox, verifiedBox]) {
    control.addEventListener('change', () => update());
  }

  const el = h(
    'section',
    { class: 'page page--editor' },
    backLink(routes.home(), t('app.theatreList')),
    h('h1', { class: 'page__title', tabindex: '-1' }, t('editor.heading')),
    h('p', { class: 'page__intro' }, t('editor.intro')),
    h(
      'div',
      { class: 'editor' },
      h(
        'div',
        { class: 'editor__form' },
        field(t('editor.text'), textArea, t('editor.textHelp')),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn--ghost',
            onclick: () => {
              textArea.value = EXAMPLE;
              update();
            },
          },
          t('editor.loadSample'),
        ),
        errorsBox,
        h(
          'div',
          { class: 'editor-grid' },
          field(t('editor.theatre'), theatreSelect),
          field(t('editor.type'), typeSelect),
          field(t('editor.id'), idInput, t('editor.idHelp')),
          field(t('editor.name'), nameInput),
          field(t('editor.entrance'), entranceSelect),
          field(t('editor.aisleCells'), aisleInput),
        ),
        h('label', { class: 'editor-check' }, alignBox, t('editor.align')),
        h(
          'fieldset',
          { class: 'editor-dimensions' },
          h('legend', null, t('editor.dimensions')),
          h('p', { class: 'field__help' }, t('editor.dimensionsHelp')),
          sliders,
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn--ghost',
              onclick: () => {
                draft.dimensions = {};
                update();
              },
            },
            t('editor.reset'),
          ),
        ),
        h('label', { class: 'editor-check' }, verifiedBox, t('editor.verified')),
        field(t('editor.source'), sourceInput),
        field(t('editor.notes'), notesInput),
      ),
      h(
        'div',
        { class: 'editor__preview' },
        summary,
        h('h2', { class: 'page__heading' }, t('editor.preview2d')),
        mapBox,
        h('h2', { class: 'page__heading' }, t('editor.preview3d')),
        stageBox,
        stageNote,
        h(
          'div',
          { class: 'editor-actions' },
          h('button', { type: 'button', class: 'btn', onclick: download }, t('editor.download')),
          copyButton,
        ),
        downloadNote,
        output,
      ),
    ),
  );

  update();

  return {
    el,
    title: () => t('editor.heading'),
    destroy() {
      destroyed = true;
      window.clearTimeout(sceneTimer);
      scene?.dispose();
      scene = null;
    },
  };
}
