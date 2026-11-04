// 작은 DOM 헬퍼 (프레임워크 없이)
type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, unknown> & { class?: string; style?: string };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      } else if (k === 'html') {
        el.innerHTML = String(v);
      } else if (k === 'dataset' && typeof v === 'object') {
        Object.assign(el.dataset, v);
      } else if (v === true) {
        el.setAttribute(k, '');
      } else {
        el.setAttribute(k, String(v));
      }
    }
  }
  append(el, children);
  return el;
}

/** null·배열을 허용하는 append */
export function add(el: Node, ...children: Child[]) {
  append(el, children);
}

function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function clear(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function $(sel: string): HTMLElement {
  const el = document.querySelector(sel);
  if (!el) throw new Error('no element ' + sel);
  return el as HTMLElement;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function svg(markup: string): HTMLElement {
  const d = document.createElement('div');
  d.className = 'svgwrap';
  d.innerHTML = markup;
  return d;
}

// ───────────── 모달 ─────────────
export interface ModalHandle { close: () => void; root: HTMLElement; body: HTMLElement }

export function modal(title: string, content: Child, opts: { wide?: boolean; onClose?: () => void; closable?: boolean } = {}): ModalHandle {
  const layer = $('#modal-layer');
  const body = h('div', { class: 'modal-body' }, content);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    root.remove();
    opts.onClose?.();
  };
  const root = h('div', { class: 'modal-backdrop' },
    h('div', { class: 'modal' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-label': title },
      h('div', { class: 'modal-head' },
        h('h2', null, title),
        opts.closable === false ? null : h('button', { class: 'icon-btn', 'aria-label': '닫기', onclick: close }, '✕'),
      ),
      body,
    ),
  );
  if (opts.closable !== false) root.addEventListener('click', (e) => { if (e.target === root) close(); });
  layer.appendChild(root);
  return { close, root, body };
}

export function alertBox(title: string, lines: Child, button = '확인'): Promise<void> {
  return new Promise((res) => {
    const m = modal(title, [
      h('div', { class: 'alert-lines' }, lines),
      h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: () => m.close() }, button)),
    ], { onClose: () => res() });
  });
}

export function confirmBox(title: string, text: Child, yes = '확인', no = '취소'): Promise<boolean> {
  return new Promise((res) => {
    let v = false;
    const m = modal(title, [
      h('div', { class: 'alert-lines' }, text),
      h('div', { class: 'row end' },
        h('button', { class: 'btn', onclick: () => m.close() }, no),
        h('button', { class: 'btn primary', onclick: () => { v = true; m.close(); } }, yes)),
    ], { onClose: () => res(v) });
  });
}

export function choiceBox<T>(title: string, text: Child, choices: { label: string; value: T; disabled?: boolean; primary?: boolean }[], closable = true): Promise<T | null> {
  return new Promise((res) => {
    let v: T | null = null;
    const m = modal(title, [
      h('div', { class: 'alert-lines' }, text),
      h('div', { class: 'choice-list' }, choices.map((c) =>
        h('button', { class: 'btn block' + (c.primary ? ' primary' : ''), disabled: c.disabled, onclick: () => { v = c.value; m.close(); } }, c.label))),
    ], { onClose: () => res(v), closable });
  });
}

export function toast(text: string, kind: 'info' | 'good' | 'warn' = 'info') {
  const layer = $('#toast-layer');
  const t = h('div', { class: 'toast ' + kind }, text);
  layer.appendChild(t);
  setTimeout(() => t.classList.add('out'), 2600);
  setTimeout(() => t.remove(), 3100);
}

export function fmtTime(sec: number): string {
  const h_ = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h_ > 0 ? `${h_}시간 ${m}분` : `${m}분`;
}
