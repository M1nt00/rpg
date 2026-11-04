// 스토리 대사 연출
import { SCENES, CHARACTERS } from '../data';
import { $, h } from '../core/dom';
import { portraitSvg } from './art';
import { app } from './app';

const SPEAKER_CHAR: Record<string, string> = Object.fromEntries(CHARACTERS.map((c) => [c.name, c.id]));

export function playScene(id: string): Promise<void> {
  const lines = SCENES[id];
  if (!lines || !lines.length) return Promise.resolve();
  const hero = app.gs?.heroName ?? '이안';
  return new Promise((resolve) => {
    let i = 0;
    let typing: ReturnType<typeof setInterval> | null = null;
    let full = '';
    const nameEl = h('div', { class: 'dlg-name' });
    const textEl = h('div', { class: 'dlg-text' });
    const portrait = h('div', { class: 'dlg-portrait' });
    const hint = h('div', { class: 'dlg-hint' }, '▼');
    const box = h('div', { class: 'dlg-box' }, portrait, h('div', { class: 'dlg-main' }, nameEl, textEl, hint));
    const skip = h('button', { class: 'btn small dlg-skip', onclick: (e: Event) => { e.stopPropagation(); finish(); } }, '건너뛰기 ▶▶');
    const root = h('div', { class: 'dialog-layer', role: 'dialog', 'aria-live': 'polite' }, skip, box);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); if (e.key === 'Escape') finish(); else advance(); }
    };
    function show() {
      const ln = lines[i];
      const speaker = ln.speaker?.replace('{hero}', hero);
      full = ln.text.replace(/\{hero\}/g, hero);
      nameEl.textContent = speaker ?? '';
      nameEl.style.display = speaker ? '' : 'none';
      box.classList.toggle('narration', !speaker);
      const cid = ln.speaker === '{hero}' ? 'hero' : speaker ? SPEAKER_CHAR[speaker] : undefined;
      portrait.innerHTML = '';
      if (cid) {
        const c = CHARACTERS.find((x) => x.id === cid)!;
        portrait.innerHTML = portraitSvg(c.color, c.glyph, cid === 'hero' ? (app.gs?.chars.hero?.element ?? 'none') : c.element);
        portrait.style.display = '';
      } else portrait.style.display = 'none';
      textEl.textContent = '';
      let k = 0;
      if (typing) clearInterval(typing);
      typing = setInterval(() => {
        k += 2;
        textEl.textContent = full.slice(0, k);
        if (k >= full.length) { clearInterval(typing!); typing = null; }
      }, 18);
    }
    function advance() {
      if (typing) { clearInterval(typing); typing = null; textEl.textContent = full; return; }
      i++;
      if (i >= lines.length) finish(); else show();
    }
    function finish() {
      if (typing) clearInterval(typing);
      window.removeEventListener('keydown', onKey);
      root.remove();
      resolve();
    }
    root.addEventListener('click', advance);
    window.addEventListener('keydown', onKey);
    $('#modal-layer').appendChild(root);
    show();
  });
}
