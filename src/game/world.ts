// 지역 맵 이동 · 보상 · 이벤트 · 퀘스트 · 상점
import type { Element, EventDef, EventOutcome, MapNode, QuestDef, Rarity, RegionDef } from '../types';
import { ELEMENTS, QUESTS, REGIONS, character, enemy as enemyDef, item as itemDef, quest as questDef, region as regionDef } from '../data';
import { chance, int, makeRng, next, pick, weighted } from '../core/rng';
import type { BattleState } from '../battle/core';
import { generateEquipment, makeLegendary } from './items';
import {
  addEquip, charStats, giveExp, healAll, joinAlly, nextEquipUid, seededRng,
  type GameState, type LevelUpInfo, type RegionProgress,
} from './state';
import type { Equipment } from '../types';

// ───────────── 지역 ─────────────
export function regionByIndex(i: number): RegionDef {
  return REGIONS.find((r) => r.index === i)!;
}

export function progress(gs: GameState, rid: string): RegionProgress {
  if (!gs.regions[rid]) {
    const r = regionDef(rid);
    gs.regions[rid] = { current: r.nodes[0].id, visited: [r.nodes[0].id], done: [], mapReward: false, introSeen: false };
  }
  return gs.regions[rid];
}

export function nodeOf(rid: string, nid: string): MapNode {
  const n = regionDef(rid).nodes.find((x) => x.id === nid);
  if (!n) throw new Error('node ' + nid);
  return n;
}

/** 방문한 노드 또는 방문한 노드와 연결된 노드로만 이동할 수 있다 */
export function canMoveTo(gs: GameState, rid: string, nid: string): boolean {
  const p = progress(gs, rid);
  if (p.visited.includes(nid)) return true;
  return regionDef(rid).nodes.some((n) => p.visited.includes(n.id) && n.links.includes(nid));
}

export function isResolved(gs: GameState, rid: string, n: MapNode): boolean {
  const p = progress(gs, rid);
  if (n.type === 'chest' || n.type === 'event') return p.done.includes(n.id);
  if (n.type === 'battle' || n.type === 'elite' || n.type === 'boss') return p.visited.includes(n.id);
  return p.visited.includes(n.id);
}

export function markVisited(gs: GameState, rid: string, nid: string) {
  const p = progress(gs, rid);
  if (!p.visited.includes(nid)) p.visited.push(nid);
  p.current = nid;
}

export function mapCompletion(gs: GameState, rid: string): { visited: number; total: number } {
  const p = progress(gs, rid);
  const nodes = regionDef(rid).nodes;
  return { visited: nodes.filter((n) => p.visited.includes(n.id)).length, total: nodes.length };
}

/** 지도 완성 보상 */
export function checkMapReward(gs: GameState, rid: string): string | null {
  const p = progress(gs, rid);
  const c = mapCompletion(gs, rid);
  if (p.mapReward || c.visited < c.total) return null;
  p.mapReward = true;
  const r = regionDef(rid);
  const gold = 100 * r.index;
  gs.gold += gold;
  const e = generateEquipment({ rarity: 'epic', tier: Math.min(6, r.index), uid: nextEquipUid(gs), rng: seededRng(gs, 77) });
  addEquip(gs, e);
  return `지도 완성 보상! 골드 ${gold}, ${e.name}(영웅)`;
}

// ───────────── 아이템 ─────────────
export function addItem(gs: GameState, id: string, n = 1) {
  gs.items[id] = (gs.items[id] || 0) + n;
  if (gs.items[id] <= 0) delete gs.items[id];
}
export function hasItem(gs: GameState, id: string, n = 1) {
  return (gs.items[id] || 0) >= n;
}

// ───────────── 전투 보상 ─────────────
export interface Rewards {
  exp: number;
  gold: number;
  items: { id: string; n: number }[];
  equips: Equipment[];
  levelUps: LevelUpInfo[];
  quests: string[];
  notes: string[];
}

function rollEquipDrop(gs: GameState, tier: number, rarity: Rarity): Equipment {
  return generateEquipment({ rarity, tier, uid: nextEquipUid(gs), rng: makeRng() });
}

/** 전투 결과를 게임 상태에 반영 (HP 기록, 처치 수, 약점 도감) */
export function writeBack(gs: GameState, s: BattleState, won: boolean) {
  for (const u of s.units) {
    if (u.side !== 'ally') continue;
    const cs = gs.chars[u.defId];
    if (!cs) continue;
    cs.hp = u.alive ? u.hp : won ? 1 : 0;
    cs.mp = u.mp;
    if (u.defId === 'hero' && u.element !== 'none') cs.element = u.element as Element;
  }
  for (const id of s.revealedIds) if (!gs.analyzed.includes(id)) gs.analyzed.push(id);
  gs.stats.reactions += s.reactionsTriggered;
}

export function grantBattleRewards(gs: GameState, s: BattleState): Rewards {
  const rw: Rewards = { exp: 0, gold: 0, items: [], equips: [], levelUps: [], quests: [], notes: [] };
  const r = makeRng();
  const addI = (id: string, n: number) => {
    const ex = rw.items.find((x) => x.id === id);
    if (ex) ex.n += n; else rw.items.push({ id, n });
    addItem(gs, id, n);
  };
  for (const id of s.defeated) {
    const d = enemyDef(id);
    gs.kills[id] = (gs.kills[id] || 0) + 1;
    rw.exp += d.exp;
    rw.gold += d.gold;
    for (const dr of d.drops) if (chance(r, dr.chance)) addI(dr.item, 1);
    const tier = Math.min(6, d.region || 1);
    if (d.rank === 'normal' && chance(r, 0.12)) rw.equips.push(rollEquipDrop(gs, tier, chance(r, 0.35) ? 'rare' : 'common'));
    if (d.rank === 'elite') rw.equips.push(rollEquipDrop(gs, tier, 'epic'));
    if (d.rank === 'boss' && d.legendary && !gs.flags['lg_' + d.legendary]) {
      gs.flags['lg_' + d.legendary] = true;
      rw.equips.push(makeLegendary(d.legendary, nextEquipUid(gs)));
    }
  }
  for (const e of rw.equips) addEquip(gs, e);
  gs.gold += rw.gold;
  // 경험치: 출전 멤버 100%, 대기 멤버 50%
  for (const id of gs.party) { const lv = giveExp(gs, id, rw.exp); if (lv) rw.levelUps.push(lv); }
  for (const id of gs.reserve) { const lv = giveExp(gs, id, rw.exp * 0.5); if (lv) rw.levelUps.push(lv); }
  gs.stats.wins += 1;
  rw.quests = refreshQuests(gs);
  return rw;
}

// ───────────── 상자 ─────────────
export function openChest(gs: GameState, rid: string, n: MapNode): string[] {
  const p = progress(gs, rid);
  if (p.done.includes(n.id) || !n.chest) return [];
  p.done.push(n.id);
  const out: string[] = [];
  if (n.chest.gold) { gs.gold += n.chest.gold; out.push(`골드 ${n.chest.gold}`); }
  for (const it of n.chest.items ?? []) { addItem(gs, it.id, it.n); out.push(`${itemDef(it.id).name} ×${it.n}`); }
  if (n.chest.equip) {
    const e = generateEquipment({ rarity: n.chest.equip, tier: regionDef(rid).index, uid: nextEquipUid(gs) });
    addEquip(gs, e);
    out.push(e.name);
  }
  refreshQuests(gs);
  return out;
}

// ───────────── 이벤트 ─────────────
export interface EventResult { outcome: EventOutcome; lines: string[]; battle: string[] | null }

export function canAfford(gs: GameState, cost?: { gold?: number; item?: string }): boolean {
  if (!cost) return true;
  if (cost.gold && gs.gold < cost.gold) return false;
  if (cost.item && !hasItem(gs, cost.item)) return false;
  return true;
}

export function resolveEvent(gs: GameState, ev: EventDef, choice: number, rid: string): EventResult {
  const c = ev.choices[choice];
  if (c.cost?.gold) gs.gold -= c.cost.gold;
  if (c.cost?.item) addItem(gs, c.cost.item, -1);
  const r = makeRng();
  const outcome = weighted(r, c.outcomes, (o) => o.chance ?? 1) ?? c.outcomes[0];
  const reg = regionDef(rid);
  const battle = outcome.battle ? outcome.battle.map((id) => (id === '@pool' ? pick(r, reg.pool) : id)) : null;
  const lines = battle ? [] : applyOutcome(gs, outcome, reg.index);
  return { outcome, lines, battle };
}

export function applyOutcome(gs: GameState, o: EventOutcome, ri: number): string[] {
  const lines: string[] = [];
  if (o.gold) { const g = Math.round(o.gold * ri); gs.gold += g; lines.push(`골드 +${g}`); }
  if (o.exp) {
    const x = Math.round(o.exp * Math.pow(ri, 1.4));
    for (const id of [...gs.party, ...gs.reserve]) giveExp(gs, id, x);
    lines.push(`경험치 +${x}`);
  }
  for (const it of o.items ?? []) { addItem(gs, it.id, it.n); lines.push(`${itemDef(it.id).name} ×${it.n}`); }
  if (o.equip) {
    const e = generateEquipment({ rarity: o.equip, tier: Math.min(6, ri), uid: nextEquipUid(gs) });
    addEquip(gs, e);
    lines.push(`${e.name} 획득`);
  }
  if (o.hpPct || o.mpPct) {
    for (const id of [...gs.party, ...gs.reserve]) {
      const st = charStats(gs, id);
      const cs = gs.chars[id];
      if (o.hpPct && cs.hp > 0) cs.hp = Math.max(1, Math.min(st.hp, Math.round(cs.hp + st.hp * o.hpPct)));
      if (o.mpPct) cs.mp = Math.max(0, Math.min(st.mp, Math.round(cs.mp + st.mp * o.mpPct)));
    }
    if (o.hpPct) lines.push(o.hpPct > 0 ? `파티 HP 회복` : `파티 HP 감소`);
  }
  if (o.flag) gs.flags[o.flag] = true;
  refreshQuests(gs);
  return lines;
}

// ───────────── 퀘스트 ─────────────
export function questProgress(gs: GameState, q: QuestDef): { cur: number; need: number } {
  const st = gs.quests[q.id];
  switch (q.kind) {
    case 'kill':
    case 'companion': {
      const need = q.target.count ?? 1;
      const cur = Math.min(need, (gs.kills[q.target.enemy!] || 0) - (st?.base ?? 0));
      return { cur: Math.max(0, cur), need };
    }
    case 'collect': {
      const need = q.target.count ?? 1;
      return { cur: Math.min(need, gs.items[q.target.item!] || 0), need };
    }
    case 'deliver':
      return { cur: st?.status === 'done' || st?.status === 'claimed' ? 1 : 0, need: 1 };
    default:
      return { cur: 0, need: 1 };
  }
}

/** 진행도가 채워진 퀘스트를 '완료'로 바꾸고, 새로 완료된 목록을 돌려준다 */
export function refreshQuests(gs: GameState): string[] {
  const done: string[] = [];
  for (const [id, st] of Object.entries(gs.quests)) {
    const q = questDef(id);
    if (q.kind === 'main' || q.kind === 'deliver') continue;
    const p = questProgress(gs, q);
    if (st.status === 'active' && p.cur >= p.need) { st.status = 'done'; done.push(q.name); }
    else if (st.status === 'done' && q.kind === 'collect' && p.cur < p.need) st.status = 'active';
  }
  return done;
}

export function acceptQuest(gs: GameState, id: string) {
  if (gs.quests[id]) return;
  const q = questDef(id);
  gs.quests[id] = { status: 'active', base: q.target.enemy ? gs.kills[q.target.enemy] || 0 : 0 };
  if (q.giveItem) addItem(gs, q.giveItem, 1);
  refreshQuests(gs);
}

export function boardQuests(gs: GameState, regionIndex: number): QuestDef[] {
  return QUESTS.filter((q) => q.region === regionIndex && !q.auto && q.kind !== 'main');
}

/** 배달 퀘스트: 목표 노드에 아이템을 들고 도착 */
export function checkDeliveries(gs: GameState, nodeId: string): string[] {
  const out: string[] = [];
  for (const [id, st] of Object.entries(gs.quests)) {
    const q = questDef(id);
    if (q.kind !== 'deliver' || st.status !== 'active') continue;
    if (q.target.node === nodeId && hasItem(gs, q.target.item!)) {
      addItem(gs, q.target.item!, -1);
      st.status = 'done';
      out.push(q.name);
    }
  }
  return out;
}

export function claimQuest(gs: GameState, id: string): string[] {
  const st = gs.quests[id];
  const q = questDef(id);
  if (!st || st.status !== 'done') return [];
  if (q.kind === 'collect') addItem(gs, q.target.item!, -(q.target.count ?? 1));
  st.status = 'claimed';
  const lines: string[] = [];
  const rw = q.reward;
  if (rw.gold) { gs.gold += rw.gold; lines.push(`골드 +${rw.gold}`); }
  if (rw.exp) { for (const cid of [...gs.party, ...gs.reserve]) giveExp(gs, cid, rw.exp); lines.push(`경험치 +${rw.exp}`); }
  for (const it of rw.items ?? []) { addItem(gs, it.id, it.n); lines.push(`${itemDef(it.id).name} ×${it.n}`); }
  if (rw.legendary && !gs.flags['lg_' + rw.legendary]) {
    gs.flags['lg_' + rw.legendary] = true;
    const e = makeLegendary(rw.legendary, nextEquipUid(gs));
    addEquip(gs, e);
    lines.push(`전설 장비 「${e.name}」`);
  }
  if (rw.equip) {
    const e = generateEquipment({ rarity: rw.equip, tier: Math.min(6, q.region + 1), uid: nextEquipUid(gs) });
    addEquip(gs, e);
    lines.push(`${e.name} 획득`);
  }
  refreshQuests(gs);
  return lines;
}

export function autoAcceptCompanion(gs: GameState) {
  for (const q of QUESTS) if (q.auto && q.requiresAlly && gs.chars[q.requiresAlly] && !gs.quests[q.id]) acceptQuest(gs, q.id);
}

// ───────────── 진행 ─────────────
/** 지역 첫 방문: 동료 합류 */
export function enterRegion(gs: GameState, rid: string): { firstTime: boolean } {
  const p = progress(gs, rid);
  gs.location = rid;
  const first = !p.introSeen;
  if (first) {
    p.introSeen = true;
    const r = regionDef(rid);
    if (r.ally && !gs.chars[r.ally]) joinAlly(gs, r.ally);
    autoAcceptCompanion(gs);
  }
  return { firstTime: first };
}

/** 신전 해방 */
export function liberate(gs: GameState, rid: string): { element: Element | null; next: number } {
  const r = regionDef(rid);
  let el: Element | null = null;
  if (r.element !== 'none' && !gs.liberated.includes(r.element as Element)) {
    el = r.element as Element;
    gs.liberated.push(el);
    if (!gs.chars.hero.element) gs.chars.hero.element = el;
  }
  gs.unlocked = Math.max(gs.unlocked, Math.min(6, r.index + 1));
  if (r.index === 6) gs.cleared = true;
  healAll(gs);
  return { element: el, next: gs.unlocked };
}

// ───────────── 상점 ─────────────
export function shopItems(regionIndex: number): string[] {
  const base = ['potion', 'ether', 'panacea', 'stone_fire', 'stone_water', 'stone_wind', 'stone_earth', 'stone_lightning', 'enh_stone'];
  if (regionIndex >= 2) base.splice(1, 0, 'feather');
  if (regionIndex >= 3) base.splice(1, 0, 'hipotion');
  if (regionIndex >= 4) base.push('enh_stone_hi');
  return base;
}

export function shopStock(gs: GameState, rid: string): Equipment[] {
  const r = regionDef(rid);
  const sh = gs.shops[rid];
  if (sh && gs.stats.battles - sh.at < 8) return sh.stock;
  const rng = makeRng();
  const types = [...new Set([...gs.party, ...gs.reserve].map((id) => character(id).weaponType))];
  const els: Element[] = gs.liberated.length ? [...gs.liberated] : [...ELEMENTS];
  const stock: Equipment[] = [];
  const tier = Math.min(6, r.index);
  for (let i = 0; i < 3; i++) {
    stock.push(generateEquipment({ slot: 'weapon', weaponType: pick(rng, types), element: pick(rng, els), rarity: next(rng) < 0.35 ? 'rare' : 'common', tier, uid: nextEquipUid(gs), rng }));
  }
  for (let i = 0; i < 2; i++) stock.push(generateEquipment({ slot: 'armor', rarity: next(rng) < 0.35 ? 'rare' : 'common', tier, uid: nextEquipUid(gs), rng }));
  for (let i = 0; i < int(rng, 1, 2); i++) stock.push(generateEquipment({ slot: 'accessory', rarity: next(rng) < 0.35 ? 'rare' : 'common', tier, uid: nextEquipUid(gs), rng }));
  gs.shops[rid] = { stock, at: gs.stats.battles };
  return stock;
}

export const innCost = (gs: GameState) => 15 * gs.unlocked;
