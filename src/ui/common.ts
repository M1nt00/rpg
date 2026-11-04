// 공용 UI 조각
import type { ElementOrNone, Equipment } from '../types';
import { ELEMENT_COLOR, ELEMENT_ICON, ELEMENT_NAME, RARITY_COLOR, RARITY_NAME, STAT_NAME, character } from '../data';
import { h, svg } from '../core/dom';
import { portraitSvg } from './art';
import { equipStats, WEAPON_TYPE_NAME } from '../game/items';
import type { GameState } from '../game/state';

export function elBadge(el: ElementOrNone, opts: { label?: boolean; small?: boolean } = {}) {
  return h('span', {
    class: 'el-badge' + (opts.small ? ' small' : ''), style: `--c:${ELEMENT_COLOR[el]}`, title: ELEMENT_NAME[el],
  }, ELEMENT_ICON[el], opts.label ? h('span', { class: 'el-label' }, ELEMENT_NAME[el]) : null);
}

export function bar(cur: number, max: number, kind: 'hp' | 'mp' | 'exp' | 'shield', label = true) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  return h('div', { class: `bar ${kind}` },
    h('div', { class: 'bar-fill', style: `width:${pct}%` }),
    label ? h('span', { class: 'bar-text' }, `${Math.round(cur)} / ${Math.round(max)}`) : null);
}

export function setBar(el: Element | null, cur: number, max: number) {
  if (!el) return;
  const fill = el.querySelector('.bar-fill') as HTMLElement | null;
  const text = el.querySelector('.bar-text');
  const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  if (fill) fill.style.width = pct + '%';
  if (text) text.textContent = `${Math.round(cur)} / ${Math.round(max)}`;
}

export function charPortrait(gs: GameState, id: string, size = 56) {
  const d = character(id);
  const el: ElementOrNone = id === 'hero' ? (gs.chars.hero?.element ?? 'none') : d.element;
  const w = svg(portraitSvg(d.color, d.glyph, el));
  w.classList.add('portrait');
  w.style.width = w.style.height = size + 'px';
  return w;
}

export function charName(gs: GameState, id: string) {
  return id === 'hero' ? gs.heroName : character(id).name;
}

export function rarityTag(e: Equipment) {
  return h('span', { class: 'rarity', style: `--c:${RARITY_COLOR[e.rarity]}` }, RARITY_NAME[e.rarity]);
}

export function equipTitle(e: Equipment) {
  return h('span', { class: 'equip-title', style: `color:${RARITY_COLOR[e.rarity]}` },
    e.name, e.plus ? ` +${e.plus}` : '');
}

export function equipSlotName(e: Equipment) {
  if (e.slot === 'weapon') return `무기 · ${WEAPON_TYPE_NAME[e.weaponType!]}`;
  return e.slot === 'armor' ? '방어구' : '장신구';
}

export function equipDetail(e: Equipment) {
  const st = equipStats(e);
  return h('div', { class: 'equip-detail' },
    h('div', { class: 'equip-head' }, equipTitle(e), rarityTag(e), e.element ? elBadge(e.element, { small: true }) : null),
    h('div', { class: 'muted small' }, `${equipSlotName(e)} · ${e.tier}단계`),
    h('div', { class: 'stat-chips' },
      Object.entries(st).map(([k, v]) => h('span', { class: 'chip' }, `${STAT_NAME[k]} ${(v as number) > 0 ? '+' : ''}${v}`)),
      e.options.map((o) => h('span', { class: 'chip opt' }, `${STAT_NAME[o.stat]} +${o.value}${o.stat.endsWith('Pct') ? '%' : ''}`)),
    ),
    e.unique ? h('div', { class: 'unique' }, '★ ', e.unique.desc) : null,
  );
}

export function goldText(n: number) {
  return h('span', { class: 'gold' }, '◆ ', n.toLocaleString());
}

export function tabs(names: string[], active: number, onPick: (i: number) => void) {
  return h('div', { class: 'tabs', role: 'tablist' }, names.map((n, i) =>
    h('button', { class: 'tab' + (i === active ? ' active' : ''), role: 'tab', 'aria-selected': i === active, onclick: () => onPick(i) }, n)));
}
