import { h } from '../app/dom';
import type { AppContext, Screen } from '../app/types';
import {
  AUDITORIUM_TYPES,
  AuditoriumSchema,
  ENTRANCES,
  ROW_ALIGNMENTS,
  type Auditorium,
  type AuditoriumType,
  type Entrance,
  type RowAlignment,
} from '../data/schema';
import { formatCompact, parseCompact, type CompactError } from '../editor/compact';
import { formatAuditoriumJson } from '../editor/json';
import { fmt, t, type MessageKey } from '../i18n';
import { pickDefaultSeat, rateLayout } from '../metrics';
import {
  resolveAuditorium,
  type AuditoriumLayout,
  type ResolvedDimensions,
} from '../metrics/layout';
import { SeatViewer } from '../three/viewer';
import { auditoriumName, theatreName } from './common';
import { createSeatMap } from './seatMap';
import { bandPill, seatName, seatStats, verdictText } from './seatInfo';

type DimKey = keyof ResolvedDimensions;

interface DimSpec {
  key: DimKey;
  min: number;
  max: number;
  step: number;
  unit: 'm' | 'ratio';
}

/** Slider ranges, kept inside what the schema accepts. */
const DIMS: DimSpec[] = [
  { key: 'screenWidth', min: 4, max: 30, step: 0.1, unit: 'm' },
  { key: 'screenAspect', min: 1.33, max: 2.4, step: 0.01, unit: 'ratio' },
  { key: 'screenBottom', min: 0, max: 3, step: 0.05, unit: 'm' },
  { key: 'firstRowDistance', min: 2, max: 15, step: 0.1, unit: 'm' },
  { key: 'rowSpacing', min: 0.8, max: 2.2, step: 0.01, unit: 'm' },
  { key: 'rowRise', min: 0, max: 0.8, step: 0.01, unit: 'm' },
  { key: 'seatWidth', min: 0.45, max: 1, step: 0.01, unit: 'm' },
  { key: 'eyeHeight', min: 1, max: 1.4, step: 0.01, unit: 'm' },
];

interface EditorState {
  theatreId: string;
  id: string;
  name: string;
  type: AuditoriumType;
  entrance: Entrance;
  rowAlign: RowAlignment;
  text: string;
  /** null = use the default for this type and size. */
  dims: Record<DimKey, number | null>;
  verified: boolean;
  source: string;
  notes: string;
}

const EXAMPLE_ROWS = [
  'A: _ 1-3 | 4-13 | 14-16 _',
  ...['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].map((row) => `${row}: 1-4 | 5-14 | 15-18`),
  'L: 1-20',
].join('\n');

const emptyDims = (): Record<DimKey, number | null> => ({
  screenWidth: null,
  screenAspect: null,
  screenBottom: null,
  firstRowDistance: null,
  rowSpacing: null,
  rowRise: null,
  seatWidth: null,
  eyeHeight: null,
});

/** Survives the screen being rebuilt (on a language switch), so nothing typed is lost. */
let draft: EditorState | null = null;

function stateFromAuditorium(auditorium: Auditorium): EditorState {
  return {
    theatreId: auditorium.theatreId,
    id: auditorium.id,
    name: auditorium.name,
    type: auditorium.type,
    entrance: auditorium.entrance ?? 'front-left',
    rowAlign: auditorium.rowAlign ?? 'center',
    text: formatCompact(auditorium.rows),
    dims: {
      screenWidth: auditorium.screen?.width_m ?? null,
      screenAspect: auditorium.screen?.aspect ?? null,
      screenBottom: auditorium.screen?.bottomHeight_m ?? null,
      firstRowDistance: auditorium.firstRowDistance_m ?? null,
      rowSpacing: auditorium.rowSpacing_m ?? null,
      rowRise: auditorium.rowRise_m ?? null,
      seatWidth: auditorium.seatWidth_m ?? null,
      eyeHeight: auditorium.eyeHeight_m ?? null,
    },
    verified: auditorium.verified ?? false,
    source: auditorium.source ?? '',
    notes: auditorium.notes ?? '',
  };
}

/** Builds the auditorium file from the form. Fields left on "default" are left out. */
function buildAuditorium(state: EditorState, rows: Auditorium['rows']): Record<string, unknown> {
  const { dims } = state;
  const screen: Record<string, number> = {};
  if (dims.screenWidth !== null) screen.width_m = dims.screenWidth;
  if (dims.screenAspect !== null) screen.aspect = dims.screenAspect;
  if (dims.screenBottom !== null) screen.bottomHeight_m = dims.screenBottom;
  const optional = (value: number | null) => (value === null ? undefined : value);
  return {
    id: state.id.trim(),
    theatreId: state.theatreId,
    name: state.name.trim(),
    type: state.type,
    screen: Object.keys(screen).length > 0 ? screen : undefined,
    firstRowDistance_m: optional(dims.firstRowDistance),
    rowSpacing_m: optional(dims.rowSpacing),
    rowRise_m: optional(dims.rowRise),
    seatWidth_m: optional(dims.seatWidth),
    eyeHeight_m: optional(dims.eyeHeight),
    rowAlign: state.rowAlign === 'center' ? undefined : state.rowAlign,
    entrance: state.entrance,
    rows,
    verified: state.verified,
    source: state.source.trim() || undefined,
    notes: state.notes.trim() || undefined,
  };
}

function compactErrorText(error: CompactError): string {
  return t(`editor.error.${error.code}` as MessageKey, {
    line: error.line,
    label: error.label ?? '',
    token: error.token ?? '',
    seat: error.seat ?? '',
  });
}

let idCounter = 0;

/** The hidden #/editor page for turning a seat-map screenshot into an auditorium file. */
export function editorScreen(context: AppContext): Screen {
  const { theatres } = context.data;
  const firstTheatre = theatres[0]?.theatre.id ?? 'my-theatre';
  const state: EditorState = draft ?? {
    theatreId: firstTheatre,
    id: `${firstTheatre}-01`,
    name: 'Auditorium 1',
    type: 'standard',
    entrance: 'front-left',
    rowAlign: 'center',
    text: EXAMPLE_ROWS,
    dims: emptyDims(),
    verified: false,
    source: '',
    notes: '',
  };
  draft = state;
  const uid = ++idCounter;
  const fieldId = (name: string) => `editor-${name}-${uid}`;

  // ---------- Form controls ----------
  const select = <T extends string>(
    name: string,
    options: readonly { value: T; label: string }[],
    value: T,
    onChange: (value: T) => void,
  ): HTMLSelectElement => {
    const element = h(
      'select',
      { id: fieldId(name), class: 'field__control' },
      options.map((option) =>
        h('option', { value: option.value, selected: option.value === value }, option.label),
      ),
    );
    element.addEventListener('change', () => onChange(element.value as T));
    return element;
  };
  const field = (name: string, labelKey: MessageKey, control: HTMLElement, hint?: string) =>
    h(
      'div',
      { class: 'field' },
      h('label', { class: 'field__label', for: fieldId(name) }, t(labelKey)),
      control,
      hint ? h('p', { class: 'field__hint' }, hint) : null,
    );
  const textInput = (name: string, value: string, onInput: (value: string) => void) => {
    const input = h('input', {
      id: fieldId(name),
      class: 'field__control',
      type: 'text',
      value,
      autocomplete: 'off',
      spellcheck: 'false',
    });
    input.addEventListener('input', () => onInput(input.value));
    return input;
  };

  const allAuditoriums = theatres.flatMap((entry) =>
    entry.auditoriums.map((auditorium) => ({ entry, auditorium })),
  );
  const loadSelect = select(
    'load',
    [
      { value: '', label: t('editor.loadNew') },
      ...allAuditoriums.map(({ entry, auditorium }) => ({
        value: `${entry.theatre.id}/${auditorium.id}`,
        label: `${theatreName(entry.theatre)} · ${auditoriumName(auditorium)}`,
      })),
    ],
    '',
    (value) => {
      const found = allAuditoriums.find(
        ({ entry, auditorium }) => `${entry.theatre.id}/${auditorium.id}` === value,
      );
      if (!found) return;
      Object.assign(state, stateFromAuditorium(found.auditorium));
      syncControls();
      update(true);
    },
  );

  const theatreSelect = select(
    'theatre',
    theatres.map(({ theatre }) => ({ value: theatre.id, label: theatreName(theatre) })),
    state.theatreId,
    (value) => {
      state.theatreId = value;
      update();
    },
  );
  const idInput = textInput('id', state.id, (value) => {
    state.id = value;
    update();
  });
  const nameInput = textInput('name', state.name, (value) => {
    state.name = value;
    update();
  });
  const typeSelect = select(
    'type',
    AUDITORIUM_TYPES.map((value) => ({ value, label: t(`type.${value}`) })),
    state.type,
    (value) => {
      state.type = value;
      update(true);
    },
  );
  const entranceSelect = select(
    'entrance',
    ENTRANCES.map((value) => ({ value, label: t(`editor.entrance.${value}`) })),
    state.entrance,
    (value) => {
      state.entrance = value;
      update(true);
    },
  );
  const alignSelect = select(
    'align',
    ROW_ALIGNMENTS.map((value) => ({ value, label: t(`editor.align.${value}`) })),
    state.rowAlign,
    (value) => {
      state.rowAlign = value;
      update(true);
    },
  );
  const seatText = h('textarea', {
    id: fieldId('seats'),
    class: 'field__control editor__seats',
    rows: 12,
    spellcheck: 'false',
    autocapitalize: 'off',
    'aria-describedby': fieldId('seats-help'),
  });
  seatText.value = state.text;
  seatText.addEventListener('input', () => {
    state.text = seatText.value;
    update(true);
  });
  const problems = h('ul', { class: 'editor__problems', role: 'alert' });

  // ---------- Dimension sliders ----------
  const sliders = DIMS.map((spec) => {
    const range = h('input', {
      id: fieldId(spec.key),
      type: 'range',
      class: 'dim__range',
      min: spec.min,
      max: spec.max,
      step: spec.step,
    });
    const output = h('output', { class: 'dim__value', for: fieldId(spec.key) });
    const auto = h('input', { type: 'checkbox', id: fieldId(`${spec.key}-auto`) });
    range.addEventListener('input', () => {
      state.dims[spec.key] = Number(range.value);
      update(true);
    });
    auto.addEventListener('change', () => {
      state.dims[spec.key] = auto.checked ? null : Number(range.value);
      update(true);
    });
    const row = h(
      'div',
      { class: 'dim' },
      h('label', { class: 'dim__label', for: fieldId(spec.key) }, t(`editor.dim.${spec.key}`)),
      output,
      range,
      h(
        'label',
        { class: 'dim__auto', for: fieldId(`${spec.key}-auto`) },
        auto,
        h('span', null, t('editor.auto')),
      ),
    );
    return { spec, range, output, auto, row };
  });

  const verifiedBox = h('input', { type: 'checkbox', id: fieldId('verified') });
  verifiedBox.addEventListener('change', () => {
    state.verified = verifiedBox.checked;
    update(true);
  });
  const sourceInput = textInput('source', state.source, (value) => {
    state.source = value;
    update();
  });
  sourceInput.placeholder = t('editor.sourcePlaceholder');
  const notesInput = h('textarea', { id: fieldId('notes'), class: 'field__control', rows: 3 });
  notesInput.value = state.notes;
  notesInput.addEventListener('input', () => {
    state.notes = notesInput.value;
    update();
  });

  /** Puts the state back into the controls after loading an auditorium. */
  const syncControls = (): void => {
    theatreSelect.value = state.theatreId;
    idInput.value = state.id;
    nameInput.value = state.name;
    typeSelect.value = state.type;
    entranceSelect.value = state.entrance;
    alignSelect.value = state.rowAlign;
    seatText.value = state.text;
    verifiedBox.checked = state.verified;
    sourceInput.value = state.source;
    notesInput.value = state.notes;
  };
  syncControls();

  // ---------- Previews and output ----------
  const counts = h('p', { class: 'editor__counts' });
  const mapHolder = h('div', { class: 'editor__map' });
  const stage = h('div', {
    class: 'view__stage editor__stage',
    tabindex: 0,
    role: 'application',
  });
  const seatSummary = h('div', { class: 'editor__seat' });
  const jsonOutput = h('pre', { class: 'editor__json' });
  const savePath = h('p', { class: 'field__hint' });
  const copyButton = h('button', { type: 'button', class: 'button button--ghost button--small' });
  const downloadButton = h('button', { type: 'button', class: 'button button--small' });

  let viewer: SeatViewer | null = null;
  let viewerFailed = false;
  let selectedKey: string | null = null;
  let current: { layout: AuditoriumLayout; json: string; id: string } | null = null;
  let timer = 0;

  const showSeat = (layout: AuditoriumLayout, key: string): void => {
    const rated = rateLayout(layout);
    const entry = rated.get(key);
    selectedKey = key;
    seatSummary.replaceChildren(
      ...(entry
        ? [
            bandPill(entry.rating.band),
            h('strong', null, seatName(entry.seat)),
            h('span', null, verdictText(entry)),
            h('span', { class: 'editor__stats' }, seatStats(entry)),
          ]
        : []),
    );
    const seat = layout.seatIndex.get(key);
    if (!seat) return;
    if (viewer) {
      viewer.setSeat(seat);
      return;
    }
    if (viewerFailed) return;
    try {
      viewer = new SeatViewer({
        stage,
        layout,
        seat,
        videoId: null,
        walkIn: false,
        reducedMotion: true,
      });
    } catch (cause) {
      viewerFailed = true;
      console.error('Could not start the 3D preview', cause);
      stage.append(h('p', { class: 'view__error' }, t('view.noWebgl')));
    }
  };

  const render = (rebuild3d: boolean): void => {
    const parsed = parseCompact(state.text);
    const candidate = buildAuditorium(state, parsed.rows);
    const validation = AuditoriumSchema.safeParse(candidate);
    const messages = [
      ...parsed.errors.map(compactErrorText),
      ...(parsed.errors.length > 0 || validation.success
        ? []
        : validation.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)),
    ];
    problems.replaceChildren(
      ...(messages.length > 0
        ? [h('li', { class: 'editor__problems-title' }, t('editor.problems'))]
        : []),
      ...messages.map((message) => h('li', null, message)),
    );

    // Preview whatever rows parsed, even while some other field still needs fixing.
    const previewSource = AuditoriumSchema.safeParse({
      ...candidate,
      id: 'preview',
      theatreId: 'preview',
      name: 'Preview',
    });
    if (!previewSource.success) {
      current = null;
      counts.textContent = '';
      mapHolder.replaceChildren();
    } else {
      const layout = resolveAuditorium(previewSource.data);
      const rated = rateLayout(layout);
      counts.textContent = t('editor.seatCount', {
        rows: fmt.count(layout.rows.length),
        seats: fmt.count(layout.seatCount),
      });
      // Defaults depend on type and size, so the sliders show what will actually be used.
      for (const { spec, range, output, auto } of sliders) {
        const value = state.dims[spec.key] ?? layout.dims[spec.key];
        range.value = String(value);
        range.disabled = state.dims[spec.key] === null;
        auto.checked = state.dims[spec.key] === null;
        output.textContent = spec.unit === 'm' ? fmt.meters(value) : value.toFixed(2);
      }
      const key =
        selectedKey && layout.seatIndex.has(selectedKey)
          ? selectedKey
          : (pickDefaultSeat(rated) ?? layout.seats[0]?.key ?? '');
      const map = createSeatMap({
        layout,
        rated,
        selected: key,
        onSelect: (next) => showSeat(layout, next),
        onActivate: () => stage.focus(),
      });
      mapHolder.replaceChildren(map.el);
      if (rebuild3d && viewer) {
        const seat = layout.seatIndex.get(key);
        if (seat) viewer.setLayout(layout, seat);
      }
      showSeat(layout, key);
      current = validation.success
        ? { layout, json: formatAuditoriumJson(validation.data), id: validation.data.id }
        : null;
    }

    jsonOutput.textContent = current?.json ?? '';
    downloadButton.disabled = !current;
    copyButton.disabled = !current;
    savePath.textContent = current
      ? t('editor.saveTo', {
          path: `data/theatres/${state.theatreId}/auditoriums/${current.id}.json`,
        })
      : '';
  };

  /** Re-renders shortly after typing stops. A pending 3D rebuild is never dropped. */
  let pendingRebuild = false;
  const update = (rebuild3d = false): void => {
    pendingRebuild ||= rebuild3d;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const rebuild = pendingRebuild;
      pendingRebuild = false;
      render(rebuild);
    }, 180);
  };

  downloadButton.addEventListener('click', () => {
    if (!current) return;
    const blob = new Blob([current.json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = h('a', { href: url, download: `${current.id}.json` });
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  copyButton.addEventListener('click', () => {
    if (!current) return;
    const text = current.json;
    void navigator.clipboard
      ?.writeText(text)
      .then(() => {
        copyButton.textContent = t('editor.copied');
        window.setTimeout(() => (copyButton.textContent = t('editor.copy')), 1500);
      })
      .catch(() => undefined);
  });
  copyButton.textContent = t('editor.copy');
  downloadButton.textContent = t('editor.download');

  const el = h(
    'div',
    { class: 'page page--wide page--editor' },
    h(
      'header',
      { class: 'page__header' },
      h('h1', { class: 'page__title' }, t('editor.title')),
      h('p', { class: 'lead' }, t('editor.intro')),
    ),
    h(
      'div',
      { class: 'editor' },
      h(
        'form',
        { class: 'editor__form', onsubmit: (event: SubmitEvent) => event.preventDefault() },
        field('load', 'editor.load', loadSelect),
        h(
          'div',
          { class: 'field-grid' },
          field('theatre', 'editor.theatre', theatreSelect),
          field('type', 'editor.type', typeSelect),
          field('id', 'editor.id', idInput, t('editor.idHint')),
          field('name', 'editor.name', nameInput),
          field('entrance', 'editor.entrance', entranceSelect),
          field('align', 'editor.align', alignSelect),
        ),
        h(
          'div',
          { class: 'field' },
          h('label', { class: 'field__label', for: fieldId('seats') }, t('editor.seats')),
          seatText,
          h('p', { class: 'field__hint', id: fieldId('seats-help') }, t('editor.seatsHelp')),
          problems,
        ),
        h(
          'fieldset',
          { class: 'dims' },
          h('legend', { class: 'field__label' }, t('editor.dimensions')),
          sliders.map((slider) => slider.row),
        ),
        h(
          'label',
          { class: 'checkbox', for: fieldId('verified') },
          verifiedBox,
          h('span', null, t('editor.verified')),
        ),
        field('source', 'editor.source', sourceInput),
        field('notes', 'editor.notes', notesInput),
      ),
      h(
        'div',
        { class: 'editor__preview' },
        h(
          'section',
          { class: 'editor__panel' },
          h('h2', { class: 'section-title' }, t('editor.preview2d')),
          counts,
          mapHolder,
        ),
        h(
          'section',
          { class: 'editor__panel' },
          h('h2', { class: 'section-title' }, t('editor.preview3d')),
          stage,
          seatSummary,
        ),
        h(
          'section',
          { class: 'editor__panel' },
          h('h2', { class: 'section-title' }, 'JSON'),
          h('div', { class: 'seat-card__actions' }, downloadButton, copyButton),
          savePath,
          jsonOutput,
        ),
      ),
    ),
  );

  render(true);

  return {
    el,
    title: t('editor.title'),
    destroy: () => {
      window.clearTimeout(timer);
      viewer?.dispose();
    },
  };
}
