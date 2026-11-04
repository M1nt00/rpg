// 마을: 상점 / 대장간 / 여관 / 퀘스트 게시판
import type { Equipment } from '../types';
import { ITEMS, item as itemDef, region as regionDef, quest as questDef } from '../data';
import { confirmBox, h, toast } from '../core/dom';
import { sfx } from '../core/audio';
import { equipValue, enhanceCost, sellPrice, MAX_PLUS, rarityLabelOrder } from '../game/items';
import { charStats, equippedBy, healAll, resetCost, resetSkills, type GameState } from '../game/state';
import {
  acceptQuest, addItem, boardQuests, claimQuest, hasItem, innCost, questProgress, shopItems, shopStock,
} from '../game/world';
import { app, gs, setScreen } from './app';
import { hudActions } from './flow';
import { charName, equipDetail, goldText, tabs } from './common';
import { saveDialog } from './menus';

let tab = 0;

export function openTown(rid: string, onLeave: () => void) {
  const g = gs();
  const r = regionDef(rid);
  const body = h('div', { class: 'town-body' });
  const render = () => {
    body.innerHTML = '';
    body.append(tabs(['상점', '대장간', '여관', '퀘스트 게시판'], tab, (i) => { tab = i; render(); }));
    const panel = h('div', { class: 'town-panel' });
    if (tab === 0) shop(g, rid, panel, render);
    if (tab === 1) smith(g, panel, render);
    if (tab === 2) inn(g, panel, render);
    if (tab === 3) board(g, r.index, panel, render);
    body.append(panel);
    const goldEl = document.querySelector('.hud .gold');
    if (goldEl) goldEl.textContent = '◆ ' + g.gold.toLocaleString();
  };
  setScreen(h('main', { class: 'town' },
    h('div', { class: 'row between' },
      h('h1', { class: 'page-title' }, '⌂ ', r.town ?? r.name),
      h('button', { class: 'btn', onclick: onLeave }, '지도로 나가기')),
    body), { hud: { ...hudActions(), world: null } });
  render();
}

// ───── 상점 ─────
let shopMode: 'buy' | 'sell' = 'buy';
function shop(g: GameState, rid: string, el: HTMLElement, rerender: () => void) {
  const r = regionDef(rid);
  el.append(h('div', { class: 'seg' },
    h('button', { class: 'btn small' + (shopMode === 'buy' ? ' primary' : ''), onclick: () => { shopMode = 'buy'; rerender(); } }, '구매'),
    h('button', { class: 'btn small' + (shopMode === 'sell' ? ' primary' : ''), onclick: () => { shopMode = 'sell'; rerender(); } }, '판매')));
  if (shopMode === 'buy') {
    const list = h('div', { class: 'shop-list' });
    for (const id of shopItems(r.index)) {
      const it = itemDef(id);
      const buy = (n: number) => {
        if (g.gold < it.price * n) return toast('골드가 부족해요', 'warn');
        g.gold -= it.price * n; addItem(g, id, n); sfx('coin'); rerender();
      };
      list.append(h('div', { class: 'shop-row' },
        h('div', null, h('b', null, it.name), h('span', { class: 'muted small' }, ` 보유 ${g.items[id] || 0}`), h('div', { class: 'small muted' }, it.desc)),
        h('div', { class: 'shop-buy' }, goldText(it.price),
          h('button', { class: 'btn small', disabled: g.gold < it.price, onclick: () => buy(1) }, '구매'),
          h('button', { class: 'btn small', disabled: g.gold < it.price * 5, onclick: () => buy(5) }, '×5'))));
    }
    el.append(h('h3', null, '소모품 · 재료'), list);
    const stock = shopStock(g, rid);
    const eq = h('div', { class: 'equip-grid' });
    stock.forEach((e, i) => {
      const price = equipValue(e);
      eq.append(h('div', { class: 'equip-card' }, equipDetail(e),
        h('div', { class: 'row between' }, goldText(price),
          h('button', { class: 'btn small primary', disabled: g.gold < price, onclick: () => {
            g.gold -= price; g.equipment.push(e); stock.splice(i, 1); sfx('coin'); toast(`${e.name} 구매!`, 'good'); rerender();
          } }, '구매'))));
    });
    if (!stock.length) eq.append(h('p', { class: 'muted' }, '장비가 다 팔렸어요. 전투를 더 하고 오면 새로 들어와요.'));
    el.append(h('h3', null, '장비'), eq);
  } else {
    const list = h('div', { class: 'shop-list' });
    const sellable = g.equipment.filter((e) => !equippedBy(g, e.uid)).sort((a, b) => rarityLabelOrder(a.rarity) - rarityLabelOrder(b.rarity));
    for (const e of sellable) {
      const p = sellPrice(e);
      list.append(h('div', { class: 'shop-row' }, equipDetail(e),
        h('div', { class: 'shop-buy' }, goldText(p), h('button', { class: 'btn small', onclick: async () => {
          if (e.rarity === 'legendary' && !(await confirmBox('전설 장비 판매', `${e.name}을(를) 정말 팔까요?`))) return;
          g.equipment = g.equipment.filter((x) => x.uid !== e.uid); g.gold += p; sfx('coin'); rerender();
        } }, '판매'))));
    }
    for (const it of ITEMS.filter((x) => (x.kind === 'material' || x.kind === 'consumable') && (g.items[x.id] || 0) > 0)) {
      const p = Math.max(1, Math.round(it.price * 0.4));
      list.append(h('div', { class: 'shop-row' },
        h('div', null, h('b', null, it.name), h('span', { class: 'muted small' }, ` ×${g.items[it.id]}`)),
        h('div', { class: 'shop-buy' }, goldText(p), h('button', { class: 'btn small', onclick: () => { addItem(g, it.id, -1); g.gold += p; sfx('coin'); rerender(); } }, '1개 판매'))));
    }
    if (!list.childNodes.length) list.append(h('p', { class: 'muted' }, '팔 물건이 없어요. (장착 중인 장비는 팔 수 없어요)'));
    el.append(list);
  }
}

// ───── 대장간 ─────
function smith(g: GameState, el: HTMLElement, rerender: () => void) {
  el.append(h('p', { class: 'muted' }, '골드와 강화석으로 장비를 +1 ~ +10 강화해요. +5까지는 확정, 이후엔 실패해도 재료만 잃고 장비는 부서지지 않아요.'),
    h('p', { class: 'small' }, `강화석 ${g.items.enh_stone || 0} · 상급 강화석 ${g.items.enh_stone_hi || 0}`));
  const list = h('div', { class: 'equip-grid' });
  const sorted = [...g.equipment].sort((a, b) => (equippedBy(g, b.uid) ? 1 : 0) - (equippedBy(g, a.uid) ? 1 : 0) || rarityLabelOrder(b.rarity) - rarityLabelOrder(a.rarity));
  for (const e of sorted) list.append(enhanceCard(g, e, rerender));
  el.append(list);
}

function enhanceCard(g: GameState, e: Equipment, rerender: () => void) {
  const c = enhanceCost(e);
  const who = equippedBy(g, e.uid);
  const can = c && g.gold >= c.gold && hasItem(g, c.item, c.n);
  return h('div', { class: 'equip-card' }, equipDetail(e),
    who ? h('div', { class: 'small muted' }, `장착: ${charName(g, who)}`) : null,
    c ? h('div', { class: 'small' }, `비용: ◆${c.gold} + ${itemDef(c.item).name} ×${c.n} · 성공률 ${Math.round(c.rate * 100)}%`) : h('div', { class: 'small good' }, `최대 강화 (+${MAX_PLUS})`),
    c ? h('button', { class: 'btn small primary', disabled: !can, onclick: () => {
      g.gold -= c.gold; addItem(g, c.item, -c.n);
      if (Math.random() < c.rate) { e.plus += 1; sfx('levelup'); toast(`강화 성공! ${e.name} +${e.plus}`, 'good'); }
      else { sfx('miss'); toast('강화 실패… 재료만 소모되었어요.', 'warn'); }
      rerender();
    } }, `+${e.plus + 1} 강화`) : null);
}

// ───── 여관 ─────
function inn(g: GameState, el: HTMLElement, rerender: () => void) {
  const cost = innCost(g);
  el.append(
    h('div', { class: 'card' }, h('h3', null, '숙박'), h('p', { class: 'muted' }, 'HP·MP를 모두 회복하고 저장할 수 있어요.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', disabled: g.gold < cost, onclick: () => { g.gold -= cost; healAll(g); sfx('heal'); toast('푹 쉬었다! 파티 완전 회복.', 'good'); rerender(); } }, `묵기 (◆${cost})`),
        h('button', { class: 'btn', onclick: () => void saveDialog() }, '저장하기'))),
    h('div', { class: 'card' }, h('h3', null, '스킬 포인트 초기화'),
      h('p', { class: 'muted' }, `배운 스킬을 모두 되돌리고 SP를 돌려받아요. 빌드 실험에 써 보세요. (◆${resetCost(g)})`),
      h('div', { class: 'reset-list' }, [...g.party, ...g.reserve].map((id) =>
        h('button', { class: 'btn small', disabled: g.gold < resetCost(g) || !g.chars[id].learned.length, onclick: async () => {
          if (!(await confirmBox('초기화', `${charName(g, id)}의 스킬을 초기화할까요?`))) return;
          g.gold -= resetCost(g); resetSkills(g, id); toast('초기화 완료', 'good'); rerender();
        } }, `${charName(g, id)} (SP ${g.chars[id].sp})`)))),
    h('div', { class: 'card' }, h('h3', null, '파티 상태'), [...g.party, ...g.reserve].map((id) => {
      const st = charStats(g, id); const cs = g.chars[id];
      return h('div', { class: 'small' }, `${charName(g, id)} Lv${cs.level} — HP ${cs.hp}/${st.hp} · MP ${cs.mp}/${st.mp}`);
    })));
  void app;
}

// ───── 퀘스트 게시판 ─────
function board(g: GameState, ri: number, el: HTMLElement, rerender: () => void) {
  const qs = boardQuests(g, ri);
  if (!qs.length) el.append(h('p', { class: 'muted' }, '게시판이 비어 있어요.'));
  for (const q of qs) {
    const st = g.quests[q.id];
    const p = questProgress(g, q);
    el.append(h('div', { class: 'card quest' },
      h('div', { class: 'row between' }, h('h3', null, q.name), h('span', { class: 'chip' }, { kill: '처치', collect: '수집', deliver: '전달', companion: '동료', main: '메인' }[q.kind])),
      h('p', { class: 'muted small' }, `의뢰인: ${q.giver}`),
      h('p', null, q.desc),
      st ? h('p', { class: 'small' }, `진행 ${p.cur}/${p.need}`) : null,
      h('div', { class: 'row' },
        !st ? h('button', { class: 'btn primary small', onclick: () => { acceptQuest(g, q.id); if (q.giveItem) toast(`${itemDef(q.giveItem).name}을(를) 받았다`, 'good'); rerender(); } }, '수락') : null,
        st?.status === 'done' ? h('button', { class: 'btn primary small', onclick: () => {
          const lines = claimQuest(g, q.id); sfx('levelup'); toast(`보상: ${lines.join(', ')}`, 'good'); rerender();
        } }, '보상 받기') : null,
        st?.status === 'claimed' ? h('span', { class: 'chip good' }, '완료') : null,
        st?.status === 'active' ? h('span', { class: 'chip' }, '진행 중') : null)));
  }
  void questDef;
}
