// 파티 관리: 스탯 · 장비 · 스킬트리 · 편성
import type { EquipSlot, Equipment } from '../types';
import { ELEMENT_NAME, STAT_NAME, character, skill as skillDef } from '../data';
import { add, h, toast } from '../core/dom';
import { sfx } from '../core/audio';
import {
  canLearn, charStats, clampVitals, computeChar, equippedBy, expToNext, findEquip, learn, type GameState,
} from '../game/state';
import { equipStats, rarityLabelOrder } from '../game/items';
import { gs, setScreen } from './app';
import { hudActions } from './flow';
import { bar, charName, charPortrait, elBadge, equipDetail, equipTitle, tabs } from './common';

let selected = 'hero';
let tab = 0;

export function openParty(onBack: () => void) {
  const g = gs();
  if (!g.chars[selected]) selected = 'hero';
  const main = h('main', { class: 'party' });
  const render = () => {
    main.innerHTML = '';
    const members = [...g.party, ...g.reserve];
    const list = h('div', { class: 'party-list' }, members.map((id) => {
      const cs = g.chars[id];
      const st = charStats(g, id);
      return h('button', { class: 'pl-item' + (id === selected ? ' active' : ''), onclick: () => { selected = id; render(); } },
        charPortrait(g, id, 44),
        h('div', { class: 'pl-text' }, h('b', null, charName(g, id)), h('span', { class: 'muted small' }, ` Lv${cs.level}${g.reserve.includes(id) ? ' · 대기' : ''}`),
          bar(cs.hp, st.hp, 'hp', false), cs.sp > 0 ? h('span', { class: 'sp-dot' }, `SP ${cs.sp}`) : null));
    }));
    const panel = h('div', { class: 'party-panel' });
    panel.append(tabs(['스탯', '장비', '스킬트리', '편성'], tab, (i) => { tab = i; render(); }));
    const body = h('div', { class: 'party-body' });
    if (tab === 0) statsTab(g, selected, body, render);
    if (tab === 1) equipTab(g, selected, body, render);
    if (tab === 2) treeTab(g, selected, body, render);
    if (tab === 3) formationTab(g, body, render);
    panel.append(body);
    main.append(h('div', { class: 'row between' }, h('h1', { class: 'page-title' }, '파티 관리'), h('button', { class: 'btn', onclick: onBack }, '돌아가기')),
      h('div', { class: 'party-layout' }, list, panel));
  };
  setScreen(main, { hud: hudActions() });
  render();
}

function statsTab(g: GameState, id: string, el: HTMLElement, rerender: () => void) {
  const d = character(id);
  const cs = g.chars[id];
  const c = computeChar(g, id);
  const st = c.stats;
  add(el,
    h('div', { class: 'char-head' }, charPortrait(g, id, 84),
      h('div', null, h('h2', null, charName(g, id), ' ', h('span', { class: 'muted' }, `${d.job} · ${d.role}`)),
        h('div', null, '원소 ', id === 'hero' ? (cs.element ? elBadge(cs.element, { label: true }) : '없음 (신전을 해방하면 얻어요)') : elBadge(d.element, { label: true }),
          ' · 무기 원소 ', elBadge(c.weaponElement, { small: true })),
        h('p', { class: 'muted small' }, d.bio))),
    h('div', { class: 'lv-line' }, `Lv ${cs.level}`, bar(cs.exp, expToNext(cs.level), 'exp'), h('span', { class: 'sp-dot' }, `SP ${cs.sp}`)),
    h('div', { class: 'stat-grid' },
      (['hp', 'mp', 'atk', 'mag', 'def', 'res', 'spd', 'crt'] as const).map((k) =>
        h('div', { class: 'stat-cell' }, h('span', { class: 'muted' }, STAT_NAME[k]),
          h('b', null, k === 'hp' ? `${cs.hp} / ${st.hp}` : k === 'mp' ? `${cs.mp} / ${st.mp}` : k === 'crt' ? `${st.crt}%` : st[k]))),
      st.eva ? h('div', { class: 'stat-cell' }, h('span', { class: 'muted' }, '회피'), h('b', null, `${st.eva}%`)) : null),
    Object.keys(c.specials).length ? h('div', { class: 'specials' }, h('h3', null, '특수 효과'),
      Object.entries(c.specials).map(([k, v]) => h('span', { class: 'chip' }, specialLabel(k, v)))) : null,
    h('h3', null, '사용 스킬'),
    h('div', { class: 'skill-chips' }, c.skills.map((s) => {
      const sk = skillDef(s);
      return h('span', { class: 'chip', title: sk.desc }, sk.name, sk.mp ? ` (MP ${sk.mp})` : '');
    })),
  );
  if (id === 'hero' && g.liberated.length) {
    el.append(h('h3', null, '원소 바꾸기 (전투 밖)'), h('div', { class: 'row' }, g.liberated.map((e) =>
      h('button', { class: 'btn small' + (cs.element === e ? ' primary' : ''), onclick: () => { cs.element = e; rerender(); } }, elBadge(e), ' ', ELEMENT_NAME[e]))));
  }
}

function specialLabel(k: string, v: number): string {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  if (k === 'reactionPct') return `반응 피해 +${pct(v)}`;
  if (k.startsWith('react_')) return `특정 반응 피해 +${pct(v)}`;
  if (k.startsWith('elem_')) return `${ELEMENT_NAME[k.slice(5) as 'fire']} 피해 +${pct(v)}`;
  const map: Record<string, string> = {
    healPct: `회복량 +${pct(v)}`, counterPct: `반격 피해 +${pct(v)}`, mpOnTurn: `턴마다 MP +${v}`, debuffedPct: `상태이상 대상 피해 +${pct(v)}`,
    basicAttach: '일반 공격 원소 부착', itemPct: `회복 아이템 +${pct(v)}`, breakMp: `브레이크 시 MP +${v}`, firstStrike: '전투 시작 시 즉시 행동',
    tauntShield: `도발 시 보호막 ${pct(v)}`, pullSelf: `당기기 시 자신도 ${pct(v)}`, dmgReduce: `받는 피해 -${pct(v)}`,
  };
  return map[k] ?? k;
}

const SLOTS: { key: 'weapon' | 'armor' | 'acc1' | 'acc2'; slot: EquipSlot; name: string }[] = [
  { key: 'weapon', slot: 'weapon', name: '무기' }, { key: 'armor', slot: 'armor', name: '방어구' },
  { key: 'acc1', slot: 'accessory', name: '장신구 1' }, { key: 'acc2', slot: 'accessory', name: '장신구 2' },
];
let pickSlot: string | null = null;

function equipTab(g: GameState, id: string, el: HTMLElement, rerender: () => void) {
  const d = character(id);
  const cs = g.chars[id];
  const slots = h('div', { class: 'slot-grid' }, SLOTS.map((s) => {
    const e = findEquip(g, cs.equip[s.key]);
    return h('button', { class: 'slot' + (pickSlot === s.key ? ' active' : ''), onclick: () => { pickSlot = pickSlot === s.key ? null : s.key; rerender(); } },
      h('div', { class: 'muted small' }, s.name), e ? equipTitle(e) : h('span', { class: 'muted' }, '— 비어 있음 —'));
  }));
  el.append(slots);
  if (!pickSlot) { el.append(h('p', { class: 'muted' }, '슬롯을 눌러 장비를 바꾸세요.')); return; }
  const s = SLOTS.find((x) => x.key === pickSlot)!;
  const cur = findEquip(g, cs.equip[s.key]);
  if (cur) {
    el.append(h('div', { class: 'equip-card current' }, h('div', { class: 'small muted' }, '장착 중'), equipDetail(cur),
      h('button', { class: 'btn small', onclick: () => { delete cs.equip[s.key]; clampVitals(g); rerender(); } }, '해제')));
  }
  const cands = g.equipment.filter((e) => e.slot === s.slot && (e.slot !== 'weapon' || e.weaponType === d.weaponType) && e.uid !== cs.equip[s.key])
    .sort((a, b) => rarityLabelOrder(b.rarity) - rarityLabelOrder(a.rarity) || b.tier - a.tier || b.plus - a.plus);
  const grid = h('div', { class: 'equip-grid' });
  for (const e of cands) {
    const owner = equippedBy(g, e.uid);
    grid.append(h('div', { class: 'equip-card' }, equipDetail(e), diffLine(cur, e),
      owner ? h('div', { class: 'small muted' }, `${charName(g, owner)} 장착 중`) : null,
      h('button', { class: 'btn small primary', onclick: () => {
        if (owner) { const oc = g.chars[owner]; for (const k of Object.keys(oc.equip) as (keyof typeof oc.equip)[]) if (oc.equip[k] === e.uid) delete oc.equip[k]; }
        cs.equip[s.key] = e.uid; clampVitals(g); sfx('buff'); rerender();
      } }, '장착')));
  }
  if (!cands.length) grid.append(h('p', { class: 'muted' }, s.slot === 'weapon' ? `장착할 수 있는 ${d.weaponType === 'sword' ? '검' : d.weaponType === 'staff' ? '지팡이' : d.weaponType === 'bow' ? '활' : '도끼'}이 없어요.` : '장착할 장비가 없어요.'));
  el.append(h('h3', null, '교체 후보'), grid);
}

function diffLine(cur: Equipment | undefined, e: Equipment) {
  const a = cur ? equipStats(cur) : {};
  const b = equipStats(e);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const parts: HTMLElement[] = [];
  for (const k of keys) {
    const dv = ((b as Record<string, number>)[k] || 0) - ((a as Record<string, number>)[k] || 0);
    if (dv) parts.push(h('span', { class: dv > 0 ? 'up' : 'down' }, `${STAT_NAME[k]} ${dv > 0 ? '▲' : '▼'}${Math.abs(dv)} `));
  }
  return parts.length ? h('div', { class: 'diff small' }, '변화: ', parts) : null;
}

function treeTab(g: GameState, id: string, el: HTMLElement, rerender: () => void) {
  const d = character(id);
  const cs = g.chars[id];
  el.append(h('p', null, `남은 SP: `, h('b', { class: 'sp-dot' }, cs.sp), h('span', { class: 'muted small' }, ' — 갈래마다 순서대로 배워요. 끝까지 찍으면 궁극기! 전부 찍을 수는 없어요. (여관에서 초기화 가능)')),
    h('div', { class: 'small muted' }, '기본 스킬: ', d.innate.map((s) => skillDef(s).name).join(', ')));
  const cols = h('div', { class: 'tree' }, d.tree.map((b) => h('div', { class: 'branch' }, h('h3', null, b.name), b.nodes.map((n) => {
    const learned = cs.learned.includes(n.id);
    const c = canLearn(g, id, n.id);
    const sk = n.skill ? skillDef(n.skill) : null;
    return h('div', { class: 'tnode' + (learned ? ' learned' : c.ok ? ' can' : '') + (n.ultimate ? ' ult' : '') },
      h('div', { class: 'row between' }, h('b', null, n.ultimate ? '★ ' : '', n.name), h('span', { class: 'chip' }, `SP ${n.cost}`)),
      h('div', { class: 'small muted' }, n.kind === 'skill' ? '스킬' : '패시브', ' · ', n.desc),
      sk ? h('div', { class: 'small' }, sk.desc) : null,
      learned ? h('span', { class: 'chip good' }, '습득')
        : c.ok ? h('button', { class: 'btn small primary', onclick: () => {
          if (learn(g, id, n.id)) { sfx('levelup'); toast(`${n.name} 습득!`, 'good'); rerender(); }
        } }, '배우기')
          : h('span', { class: 'chip locked' }, '🔒 ', c.why));
  }))));
  el.append(cols);
}

function formationTab(g: GameState, el: HTMLElement, rerender: () => void) {
  el.append(h('p', { class: 'muted' }, '전투에는 최대 4명이 나가요. 대기 멤버는 전투 중 교대할 수 있고(전투당 2회), 경험치를 50% 받아요.'));
  const row = (id: string, active: boolean, idx: number) => h('div', { class: 'form-row' }, charPortrait(g, id, 36),
    h('b', null, charName(g, id)), h('span', { class: 'muted small' }, ` ${character(id).role}`),
    h('div', { class: 'row' },
      active && idx > 0 ? h('button', { class: 'btn small', onclick: () => { [g.party[idx - 1], g.party[idx]] = [g.party[idx], g.party[idx - 1]]; rerender(); } }, '▲') : null,
      active ? h('button', { class: 'btn small', disabled: g.party.length <= 1, onclick: () => { g.party.splice(idx, 1); g.reserve.push(id); rerender(); } }, '대기로') : null,
      !active ? h('button', { class: 'btn small primary', disabled: g.party.length >= 4, onclick: () => { g.reserve.splice(idx, 1); g.party.push(id); rerender(); } }, '출전') : null,
      !active && g.party.length >= 4 ? h('span', { class: 'muted small' }, '출전 4명 가득') : null));
  add(el, h('h3', null, `출전 (${g.party.length}/4)`), g.party.map((id, i) => row(id, true, i)),
    h('h3', null, '대기'), g.reserve.length ? g.reserve.map((id, i) => row(id, false, i)) : h('p', { class: 'muted' }, '대기 멤버 없음'));
}
