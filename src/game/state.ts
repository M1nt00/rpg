// 게임 진행 상태 · 캐릭터 능력치 · 성장
import type { Element, Equipment, Stats, TreeNode } from '../types';
import { CHARACTERS, character, skill as skillDef } from '../data';
import { generateEquipment, equipStats, newUid } from './items';
import { makeRng } from '../core/rng';
import type { Unit } from '../battle/core';

export const SAVE_VERSION = 1;
export const LEVEL_CAP = 30;

export interface CharState {
  id: string;
  level: number;
  exp: number;
  hp: number;
  mp: number;
  sp: number;
  learned: string[];
  equip: { weapon?: string; armor?: string; acc1?: string; acc2?: string };
  element?: Element; // 주인공의 현재 원소
}

export interface RegionProgress {
  current: string;
  visited: string[];
  done: string[];      // 열어 본 상자 / 끝낸 이벤트
  mapReward: boolean;
  introSeen: boolean;
}

export interface QuestState { status: 'active' | 'done' | 'claimed'; base: number }

export interface GameState {
  version: number;
  heroName: string;
  playTime: number;
  savedAt: number;
  chars: Record<string, CharState>;
  party: string[];
  reserve: string[];
  gold: number;
  items: Record<string, number>;
  equipment: Equipment[];
  equipSeq: number;
  liberated: Element[];
  unlocked: number;            // 이동 가능한 최대 지역 번호
  regions: Record<string, RegionProgress>;
  location: string | null;     // 현재 지역 id (null = 월드맵)
  quests: Record<string, QuestState>;
  flags: Record<string, boolean>;
  kills: Record<string, number>;
  analyzed: string[];
  shops: Record<string, { stock: Equipment[]; at: number }>;
  stats: { battles: number; reactions: number; breaks: number; wins: number };
  cleared: boolean;
}

// ───────────── 경험치 ─────────────
export function expToNext(level: number): number {
  return Math.round(20 + 18 * Math.pow(level, 1.3));
}

// ───────────── 장비 관리 ─────────────
export function findEquip(gs: GameState, uid: string | undefined): Equipment | undefined {
  return uid ? gs.equipment.find((e) => e.uid === uid) : undefined;
}
export function addEquip(gs: GameState, e: Equipment) {
  gs.equipment.push(e);
}
export function nextEquipUid(gs: GameState): string {
  gs.equipSeq += 1;
  return newUid(gs.equipSeq);
}
export function equippedBy(gs: GameState, uid: string): string | null {
  for (const c of Object.values(gs.chars)) {
    if (Object.values(c.equip).includes(uid)) return c.id;
  }
  return null;
}

// ───────────── 새 게임 ─────────────
function starterEquip(gs: GameState, charId: string, tier = 1) {
  const def = character(charId);
  const cs = gs.chars[charId];
  const el = def.element === 'none' ? null : def.element;
  const w = generateEquipment({ slot: 'weapon', weaponType: def.weaponType, element: el, rarity: 'common', tier, uid: nextEquipUid(gs) });
  const a = generateEquipment({ slot: 'armor', rarity: 'common', tier, uid: nextEquipUid(gs) });
  addEquip(gs, w); addEquip(gs, a);
  cs.equip.weapon = w.uid;
  cs.equip.armor = a.uid;
}

export function makeCharState(id: string, level: number): CharState {
  return { id, level, exp: 0, hp: 1, mp: 1, sp: level + 1, learned: [], equip: {} };
}

export function newGame(heroName: string): GameState {
  const gs: GameState = {
    version: SAVE_VERSION, heroName: heroName || '이안', playTime: 0, savedAt: 0,
    chars: {}, party: [], reserve: [], gold: 150,
    items: { potion: 4, stone_water: 3, ether: 1 },
    equipment: [], equipSeq: 0, liberated: [], unlocked: 1, regions: {}, location: null,
    quests: { q_main: { status: 'active', base: 0 } }, flags: {}, kills: {}, analyzed: [], shops: {},
    stats: { battles: 0, reactions: 0, breaks: 0, wins: 0 }, cleared: false,
  };
  joinAlly(gs, 'hero', 1);
  joinAlly(gs, 'kyle', 1);
  return gs;
}

/** 동료 합류 — 파티 평균 레벨 근처로 맞춰 준다 */
export function joinAlly(gs: GameState, id: string, level?: number) {
  if (gs.chars[id]) return;
  const lv = level ?? Math.max(1, Math.round(avgLevel(gs)) - 1);
  const cs = makeCharState(id, lv);
  gs.chars[id] = cs;
  const tier = Math.max(1, Math.ceil(lv / 5));
  starterEquip(gs, id, tier);
  if (gs.party.length < 4) gs.party.push(id);
  else gs.reserve.push(id);
  const st = charStats(gs, id);
  cs.hp = st.hp; cs.mp = st.mp;
}

export function avgLevel(gs: GameState): number {
  const l = Object.values(gs.chars);
  return l.length ? l.reduce((s, c) => s + c.level, 0) / l.length : 1;
}

// ───────────── 능력치 계산 ─────────────
export interface FinalStats extends Stats { eva: number }
export interface CharComputed {
  stats: FinalStats;
  specials: Record<string, number>;
  skills: string[];
  weaponElement: Element | 'none';
}

export function learnedNodes(gs: GameState, id: string): TreeNode[] {
  const def = character(id);
  const cs = gs.chars[id];
  const out: TreeNode[] = [];
  for (const b of def.tree) for (const n of b.nodes) if (cs.learned.includes(n.id)) out.push(n);
  return out;
}

export function computeChar(gs: GameState, id: string): CharComputed {
  const def = character(id);
  const cs = gs.chars[id];
  const L = cs.level - 1;
  const raw: Stats = { hp: 0, mp: 0, atk: 0, mag: 0, def: 0, res: 0, spd: 0, crt: 0 };
  for (const k of Object.keys(raw) as (keyof Stats)[]) raw[k] = def.base[k] + def.growth[k] * L;
  const pct: Record<string, number> = {};
  const flat: Record<string, number> = { crt: 0, eva: 0 };
  const specials: Record<string, number> = {};
  const addSpecial = (k: string, v: number) => { specials[k] = (specials[k] || 0) + v; };
  let weaponElement: Element | 'none' = def.element;

  for (const slot of ['weapon', 'armor', 'acc1', 'acc2'] as const) {
    const e = findEquip(gs, cs.equip[slot]);
    if (!e) continue;
    const st = equipStats(e);
    for (const [k, v] of Object.entries(st)) raw[k as keyof Stats] += v as number;
    for (const o of e.options) {
      if (o.stat === 'spd' || o.stat === 'crt') raw[o.stat] += o.value;
      else if (o.stat === 'reactionPct') addSpecial('reactionPct', o.value / 100);
      else pct[o.stat.replace('Pct', '')] = (pct[o.stat.replace('Pct', '')] || 0) + o.value / 100;
    }
    if (e.unique) addSpecial(e.unique.key, e.unique.value);
    if (slot === 'weapon' && e.element) weaponElement = e.element;
  }
  for (const n of learnedNodes(gs, id)) {
    if (n.kind !== 'passive' || !n.passive) continue;
    for (const [k, v] of Object.entries(n.passive.pct ?? {})) pct[k] = (pct[k] || 0) + (v as number);
    for (const [k, v] of Object.entries(n.passive.flat ?? {})) flat[k] = (flat[k] || 0) + (v as number);
    for (const [k, v] of Object.entries(n.passive.special ?? {})) addSpecial(k, v as number);
  }
  const stats: FinalStats = {
    hp: Math.round(raw.hp * (1 + (pct.hp || 0))),
    mp: Math.round(raw.mp * (1 + (pct.mp || 0))),
    atk: Math.round(raw.atk * (1 + (pct.atk || 0))),
    mag: Math.round(raw.mag * (1 + (pct.mag || 0))),
    def: Math.round(raw.def * (1 + (pct.def || 0))),
    res: Math.round(raw.res * (1 + (pct.res || 0))),
    spd: Math.round(raw.spd * (1 + (pct.spd || 0))),
    crt: Math.round((raw.crt + flat.crt) * 10) / 10,
    eva: flat.eva,
  };
  if (id === 'hero' && cs.element) weaponElement = cs.element;
  const skills = [...def.innate];
  for (const n of learnedNodes(gs, id)) if (n.kind === 'skill' && n.skill) skills.push(n.skill);
  return { stats, specials, skills, weaponElement };
}

export function charStats(gs: GameState, id: string): FinalStats {
  return computeChar(gs, id).stats;
}

/** HP/MP가 최대치를 넘지 않게 보정 */
export function clampVitals(gs: GameState) {
  for (const id of Object.keys(gs.chars)) {
    const st = charStats(gs, id);
    const cs = gs.chars[id];
    cs.hp = Math.min(cs.hp, st.hp);
    cs.mp = Math.min(cs.mp, st.mp);
  }
}

export function healAll(gs: GameState) {
  for (const id of Object.keys(gs.chars)) {
    const st = charStats(gs, id);
    gs.chars[id].hp = st.hp;
    gs.chars[id].mp = st.mp;
  }
}

// ───────────── 레벨업 ─────────────
export interface LevelUpInfo { id: string; from: number; to: number }
export function giveExp(gs: GameState, id: string, amount: number): LevelUpInfo | null {
  const cs = gs.chars[id];
  if (!cs || cs.level >= LEVEL_CAP) return null;
  const from = cs.level;
  const before = charStats(gs, id);
  cs.exp += Math.round(amount);
  while (cs.level < LEVEL_CAP && cs.exp >= expToNext(cs.level)) {
    cs.exp -= expToNext(cs.level);
    cs.level += 1;
    cs.sp += 1;
  }
  if (cs.level >= LEVEL_CAP) cs.exp = 0;
  if (cs.level > from) {
    const after = charStats(gs, id);
    if (cs.hp > 0) cs.hp += after.hp - before.hp;
    cs.mp += after.mp - before.mp;
    return { id, from, to: cs.level };
  }
  return null;
}

// ───────────── 스킬트리 ─────────────
export function canLearn(gs: GameState, id: string, nodeId: string): { ok: boolean; why?: string } {
  const def = character(id);
  const cs = gs.chars[id];
  for (const b of def.tree) {
    const idx = b.nodes.findIndex((n) => n.id === nodeId);
    if (idx < 0) continue;
    const n = b.nodes[idx];
    if (cs.learned.includes(nodeId)) return { ok: false, why: '이미 배움' };
    if (idx > 0 && !cs.learned.includes(b.nodes[idx - 1].id)) return { ok: false, why: '이전 노드 필요' };
    if (cs.sp < n.cost) return { ok: false, why: `SP ${n.cost} 필요` };
    return { ok: true };
  }
  return { ok: false, why: '노드 없음' };
}

export function learn(gs: GameState, id: string, nodeId: string): boolean {
  if (!canLearn(gs, id, nodeId).ok) return false;
  const def = character(id);
  const n = def.tree.flatMap((b) => b.nodes).find((x) => x.id === nodeId)!;
  gs.chars[id].sp -= n.cost;
  gs.chars[id].learned.push(nodeId);
  return true;
}

export function resetSkills(gs: GameState, id: string) {
  const def = character(id);
  const cs = gs.chars[id];
  const refund = def.tree.flatMap((b) => b.nodes).filter((n) => cs.learned.includes(n.id)).reduce((s, n) => s + n.cost, 0);
  cs.sp += refund;
  cs.learned = [];
  clampVitals(gs);
}

export const resetCost = (gs: GameState) => 60 * gs.unlocked;

// ───────────── 전투 유닛 생성 ─────────────
export function makeAllyUnit(gs: GameState, id: string, active: boolean): Unit {
  const def = character(id);
  const cs = gs.chars[id];
  const c = computeChar(gs, id);
  const el: Element | 'none' = id === 'hero' ? (cs.element ?? 'none') : def.element;
  const weakMap: Record<Element, Element> = { fire: 'water', wind: 'fire', earth: 'wind', lightning: 'earth', water: 'lightning' };
  return {
    uid: 'a_' + id, side: 'ally', defId: id, name: id === 'hero' ? gs.heroName : def.name, level: cs.level,
    element: el, weaponElement: c.weaponElement, weakness: el === 'none' ? [] : [weakMap[el]],
    base: { ...c.stats },
    hp: Math.min(cs.hp, c.stats.hp), mp: Math.min(cs.mp, c.stats.mp), maxHp: c.stats.hp, maxMp: c.stats.mp, av: 0,
    statuses: [], attached: null, breakMax: 0, breakCur: 0, broken: false, defending: false, shield: 0,
    skills: c.skills.filter((s) => { try { skillDef(s); return true; } catch { return false; } }),
    alive: cs.hp > 0, active, rank: 'ally', telegraph: null, phase: 0, actCount: 0,
    ai: [], phases: [], actionsPerTurn: 1, reactionImmune: false, specials: c.specials,
    attackType: def.attackType, color: def.color, glyph: def.glyph, revealed: true, switchedThisTurn: false, pendingSelfPull: 0,
  };
}

export function partyUnits(gs: GameState): Unit[] {
  const active = gs.party.map((id) => makeAllyUnit(gs, id, true));
  // 전원 쓰러진 파티로는 시작하지 않도록 최소 1 HP 보장
  if (!active.some((u) => u.alive)) { active[0].alive = true; active[0].hp = 1; }
  const res = gs.reserve.map((id) => makeAllyUnit(gs, id, false));
  return [...active, ...res];
}

export function allCharIds(): string[] {
  return CHARACTERS.map((c) => c.id);
}

export function seededRng(gs: GameState, salt: number) {
  return makeRng((gs.stats.battles * 7919 + salt * 104729 + gs.equipSeq * 31) >>> 0);
}
