// 인벤토리: 장비 / 소모품 / 재료
import type { ItemDef } from '../types';
import { ITEMS } from '../data';
import { choiceBox, h, toast } from '../core/dom';
import { sfx } from '../core/audio';
import { charStats, equippedBy, type GameState } from '../game/state';
import { rarityLabelOrder } from '../game/items';
import { addItem } from '../game/world';
import { gs, setScreen } from './app';
import { hudActions } from './flow';
import { charName, equipDetail, tabs } from './common';

let tab = 0;
let sort: 'rarity' | 'tier' | 'slot' = 'rarity';

export function openInventory(onBack: () => void) {
  const g = gs();
  const main = h('main', { class: 'inventory' });
  const render = () => {
    main.innerHTML = '';
    main.append(h('div', { class: 'row between' }, h('h1', { class: 'page-title' }, '가방'), h('button', { class: 'btn', onclick: onBack }, '돌아가기')),
      tabs([`장비 (${g.equipment.length})`, '소모품', '재료 · 중요'], tab, (i) => { tab = i; render(); }));
    const body = h('div', { class: 'inv-body' });
    if (tab === 0) equipList(g, body, render);
    else itemList(g, body, tab === 1 ? ['consumable'] : ['material', 'key'], render);
    main.append(body);
  };
  setScreen(main, { hud: hudActions() });
  render();
}

function equipList(g: GameState, el: HTMLElement, rerender: () => void) {
  el.append(h('div', { class: 'seg' }, '정렬: ',
    (['rarity', 'tier', 'slot'] as const).map((k) => h('button', { class: 'btn small' + (sort === k ? ' primary' : ''), onclick: () => { sort = k; rerender(); } },
      { rarity: '등급', tier: '단계', slot: '부위' }[k]))));
  const order = { weapon: 0, armor: 1, accessory: 2 };
  const list = [...g.equipment].sort((a, b) =>
    sort === 'rarity' ? rarityLabelOrder(b.rarity) - rarityLabelOrder(a.rarity) || b.tier - a.tier
      : sort === 'tier' ? b.tier - a.tier || rarityLabelOrder(b.rarity) - rarityLabelOrder(a.rarity)
        : order[a.slot] - order[b.slot] || rarityLabelOrder(b.rarity) - rarityLabelOrder(a.rarity));
  const grid = h('div', { class: 'equip-grid' });
  for (const e of list) {
    const who = equippedBy(g, e.uid);
    grid.append(h('div', { class: 'equip-card' }, equipDetail(e), who ? h('div', { class: 'small good' }, `장착: ${charName(g, who)}`) : null));
  }
  if (!list.length) grid.append(h('p', { class: 'muted' }, '장비가 없어요.'));
  el.append(h('p', { class: 'muted small' }, '장착은 파티 관리 → 장비 탭에서, 판매·강화는 마을에서 할 수 있어요.'), grid);
}

function itemList(g: GameState, el: HTMLElement, kinds: string[], rerender: () => void) {
  const owned = ITEMS.filter((it) => kinds.includes(it.kind) && (g.items[it.id] || 0) > 0);
  if (!owned.length) el.append(h('p', { class: 'muted' }, '비어 있어요.'));
  for (const it of owned) {
    const usable = it.kind === 'consumable' && !it.battleOnly && it.use;
    el.append(h('div', { class: 'shop-row' },
      h('div', null, h('b', null, it.name), h('span', { class: 'muted' }, ` ×${g.items[it.id]}`), h('div', { class: 'small muted' }, it.desc)),
      usable ? h('button', { class: 'btn small primary', onclick: () => void useOutside(g, it, rerender) }, '사용') : it.battleOnly ? h('span', { class: 'muted small' }, '전투 전용') : null));
  }
}

async function useOutside(g: GameState, it: ItemDef, rerender: () => void) {
  const members = [...g.party, ...g.reserve];
  const id = await choiceBox(`${it.name} 사용`, '누구에게 쓸까요?', members.map((m) => {
    const st = charStats(g, m); const cs = g.chars[m];
    const dead = cs.hp <= 0;
    const ok = it.use!.target === 'dead_ally' ? dead : !dead;
    return { label: `${charName(g, m)} — HP ${cs.hp}/${st.hp} · MP ${cs.mp}/${st.mp}${dead ? ' (전투불능)' : ''}`, value: m, disabled: !ok };
  }));
  if (!id) return;
  const st = charStats(g, id);
  const cs = g.chars[id];
  const u = it.use!;
  if (u.revive) cs.hp = Math.round(st.hp * u.revive);
  if (u.heal || u.healPct) cs.hp = Math.min(st.hp, Math.round(cs.hp + (u.heal ?? 0) + st.hp * (u.healPct ?? 0)));
  if (u.mp) cs.mp = Math.min(st.mp, cs.mp + u.mp);
  addItem(g, it.id, -1);
  sfx('heal');
  toast(`${charName(g, id)}에게 ${it.name} 사용`, 'good');
  rerender();
}
