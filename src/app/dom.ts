/** A very small hyperscript helper, so the UI can stay in plain TypeScript without a framework. */

export type Child = Node | string | number | null | undefined | false;
export type Attrs = Record<string, unknown>;

const SVG_NS = 'http://www.w3.org/2000/svg';

function applyAttrs(element: Element, attrs: Attrs | null | undefined): void {
  if (!attrs) return;
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') {
      element.setAttribute('class', String(value));
    } else if (key === 'dataset' && typeof value === 'object') {
      for (const [name, data] of Object.entries(value as Record<string, string>)) {
        (element as HTMLElement).dataset[name] = data;
      }
    } else if (key === 'style' && typeof value === 'object') {
      const style = (element as HTMLElement | SVGElement).style;
      for (const [name, css] of Object.entries(value as Record<string, string>)) {
        if (name.startsWith('--')) style.setProperty(name, css);
        else (style as unknown as Record<string, string>)[name] = css;
      }
    } else if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (value === true) {
      element.setAttribute(key, '');
    } else {
      element.setAttribute(key, String(value));
    }
  }
}

function appendChildren(parent: Node, children: (Child | Child[])[]): void {
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Creates an HTML element: `h('button', { class: 'btn', onclick: fn }, 'Label')`. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  applyAttrs(element, attrs);
  appendChildren(element, children);
  return element;
}

/** Creates an SVG element (SVG needs its own namespace). */
export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: (Child | Child[])[]
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  applyAttrs(element, attrs);
  appendChildren(element, children);
  return element;
}

/** Removes every child of `element`. */
export function clear(element: Element): void {
  element.replaceChildren();
}

/** Replaces the children of `element`. */
export function mount(element: Element, ...children: (Child | Child[])[]): void {
  clear(element);
  appendChildren(element, children);
}
