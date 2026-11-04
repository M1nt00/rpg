// 장비 생성 · 강화 · 가격
import type { Element, EquipOption, EquipSlot, Equipment, OptionStat, Rarity, Stats, WeaponType } from '../types';
import { ELEMENTS, legendary as legendaryDef } from '../data';
import { int, makeRng, pick, range, type Rng } from '../core/rng';

const TIER_PREFIX = ['낡은', '강철', '은빛', '룬', '미스릴', '성흔'];
const WEAPON_NAME: Record<WeaponType, string> = { sword: '검', staff: '지팡이', bow: '활', axe: '도끼' };
export const WEAPON_TYPE_NAME: Record<WeaponType, string> = { sword: '검', staff: '지팡이', bow: '활', axe: '도끼' };
const ACC_KINDS = ['ring', 'amulet', 'charm'] as const;
const ACC_NAME = { ring: '반지', amulet: '목걸이', charm: '부적' };
const RARITY_MUL: Record<Rarity, number> = { common: 1, rare: 1.08, epic: 1.16, legendary: 1.25 };
const OPTION_COUNT: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 2 };

function weaponBase(w: WeaponType, t: number): Partial<Stats> {
  switch (w) {
    case 'sword': return { atk: 7 + 9 * (t - 1) };
    case 'staff': return { mag: 7 + 9 * (t - 1), mp: 4 * t };
    case 'bow': return { atk: 6 + 8.5 * (t - 1), crt: 2 };
    case 'axe': return { atk: 8 + 9.8 * (t - 1), def: 1 + 1.5 * (t - 1) };
  }
}
function armorBase(t: number): Partial<Stats> {
  return { def: 4 + 6 * (t - 1), res: 3 + 5 * (t - 1), hp: 12 + 22 * (t - 1) };
}
function accBase(kind: typeof ACC_KINDS[number], t: number): Partial<Stats> {
  switch (kind) {
    case 'ring': return { atk: 3 + 3.5 * (t - 1), mag: 3 + 3.5 * (t - 1) };
    case 'amulet': return { res: 3 + 4 * (t - 1), mp: 6 + 5 * (t - 1), hp: 10 + 15 * (t - 1) };
    case 'charm': return { spd: 2 + 1.2 * (t - 1), crt: 2 + 0.8 * (t - 1) };
  }
}

const OPTION_POOL: { stat: OptionStat; base: number; per: number }[] = [
  { stat: 'atkPct', base: 4, per: 1.2 }, { stat: 'magPct', base: 4, per: 1.2 },
  { stat: 'defPct', base: 5, per: 1.2 }, { stat: 'resPct', base: 5, per: 1.2 },
  { stat: 'hpPct', base: 5, per: 1.5 }, { stat: 'mpPct', base: 6, per: 1.5 },
  { stat: 'spd', base: 2, per: 0.8 }, { stat: 'crt', base: 2, per: 0.8 },
  { stat: 'reactionPct', base: 4, per: 1.5 },
];

function rollOptions(r: Rng, n: number, t: number): EquipOption[] {
  const pool = [...OPTION_POOL];
  const out: EquipOption[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    const idx = int(r, 0, pool.length - 1);
    const o = pool.splice(idx, 1)[0];
    out.push({ stat: o.stat, value: Math.max(1, Math.round((o.base + o.per * t) * range(r, 0.7, 1.0))) });
  }
  return out;
}

function roundStats(st: Partial<Stats>, mul: number): Partial<Stats> {
  const out: Partial<Stats> = {};
  for (const [k, v] of Object.entries(st)) out[k as keyof Stats] = Math.round((v as number) * mul);
  return out;
}

let uidCounter = 0;
export function newUid(seq: number): string {
  uidCounter++;
  return `eq${seq}_${Date.now().toString(36)}${uidCounter}`;
}

export interface GenOpts {
  slot?: EquipSlot;
  weaponType?: WeaponType;
  element?: Element | null;
  rarity: Rarity;
  tier: number;
  rng?: Rng;
  uid: string;
}

export function generateEquipment(o: GenOpts): Equipment {
  const r = o.rng ?? makeRng();
  const tier = Math.max(1, Math.min(6, o.tier));
  const slot: EquipSlot = o.slot ?? pick(r, ['weapon', 'weapon', 'armor', 'accessory', 'accessory'] as EquipSlot[]);
  const mul = RARITY_MUL[o.rarity];
  const prefix = TIER_PREFIX[tier - 1];
  let name: string, stats: Partial<Stats>, weaponType: WeaponType | undefined, element: Element | undefined;
  if (slot === 'weapon') {
    weaponType = o.weaponType ?? pick(r, ['sword', 'staff', 'bow', 'axe'] as WeaponType[]);
    stats = roundStats(weaponBase(weaponType, tier), mul);
    element = o.element === null ? undefined : (o.element ?? pick(r, ELEMENTS));
    name = `${prefix} ${WEAPON_NAME[weaponType]}`;
  } else if (slot === 'armor') {
    stats = roundStats(armorBase(tier), mul);
    name = `${prefix} ${['가죽 갑옷', '사슬 갑옷', '판금 갑옷', '로브'][int(r, 0, 3)]}`;
  } else {
    const kind = pick(r, ACC_KINDS);
    stats = roundStats(accBase(kind, tier), mul);
    name = `${prefix} ${ACC_NAME[kind]}`;
  }
  return {
    uid: o.uid, name, slot, weaponType, rarity: o.rarity, tier, element, stats,
    options: rollOptions(r, OPTION_COUNT[o.rarity], tier), plus: 0,
  };
}

export function makeLegendary(id: string, uid: string): Equipment {
  const d = legendaryDef(id);
  return {
    uid, name: d.name, slot: d.slot, weaponType: d.weaponType, rarity: 'legendary', tier: d.tier,
    element: d.element, stats: { ...d.stats }, options: d.options.map((x) => ({ ...x })),
    unique: { ...d.unique }, plus: 0, legendaryId: id,
  };
}

/** 강화 수치가 반영된 장비 능력치 (+1당 8%) */
export function equipStats(e: Equipment): Partial<Stats> {
  const out: Partial<Stats> = {};
  for (const [k, v] of Object.entries(e.stats)) {
    const val = v as number;
    out[k as keyof Stats] = k === 'crt' || k === 'spd' ? val + Math.floor(e.plus / 3) * Math.sign(val) : Math.round(val * (1 + 0.08 * e.plus));
  }
  return out;
}

export function equipValue(e: Equipment): number {
  const rm = { common: 1, rare: 2, epic: 4, legendary: 8 }[e.rarity];
  return Math.round(40 * Math.pow(e.tier, 1.5) * rm * (1 + 0.15 * e.plus));
}
export const sellPrice = (e: Equipment) => Math.round(equipValue(e) * 0.3);

// ───────────── 강화 ─────────────
export const MAX_PLUS = 10;
const HIGH_RATES = [0.8, 0.65, 0.5, 0.4, 0.3];

export interface EnhanceCost { gold: number; item: string; n: number; rate: number }
export function enhanceCost(e: Equipment): EnhanceCost | null {
  if (e.plus >= MAX_PLUS) return null;
  const gold = Math.round(25 * e.tier * (e.plus + 1));
  if (e.plus < 5) return { gold, item: 'enh_stone', n: 1 + Math.floor(e.plus / 2), rate: 1 };
  return { gold, item: 'enh_stone_hi', n: e.plus - 3, rate: HIGH_RATES[e.plus - 5] };
}

export function rarityLabelOrder(r: Rarity): number {
  return { common: 0, rare: 1, epic: 2, legendary: 3 }[r];
}
