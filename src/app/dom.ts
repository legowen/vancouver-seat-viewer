/** Accepts a handler for any event type without resorting to `any`. */
type Handler = (event: never) => void;
type AttrValue = string | number | boolean | null | undefined | Handler;

export type Attrs = Readonly<Record<string, AttrValue>>;
export type Child = Node | string | number | null | undefined | false | readonly Child[];

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function applyAttrs(element: Element, attrs?: Attrs | null): void {
  if (!attrs) return;
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (typeof value === 'function') {
      // "onclick" → "click"
      element.addEventListener(name.slice(2).toLowerCase(), value as unknown as EventListener);
    } else {
      element.setAttribute(name, value === true ? '' : String(value));
    }
  }
}

function appendChildren(element: Element, children: readonly Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) appendChildren(element, child as readonly Child[]);
    else if (child instanceof Node) element.appendChild(child);
    else element.appendChild(document.createTextNode(String(child)));
  }
}

/**
 * Creates an HTML element. Text is always inserted as text nodes, never parsed as HTML,
 * so data and user input cannot inject markup.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  applyAttrs(element, attrs);
  appendChildren(element, children);
  return element;
}

/** Creates an SVG element. */
export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NAMESPACE, tag);
  applyAttrs(element, attrs);
  appendChildren(element, children);
  return element;
}
