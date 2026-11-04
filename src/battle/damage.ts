// 데미지 공식 · 원소 상성 · 원소 반응
import type { Element, ElementOrNone, ReactionId } from '../types';
import { BEATS, REACTIONS, reactionOf } from '../data';
import { chance, range } from '../core/rng';
import {
  applyStatus, byUid, hasDebuff, opponents, friends, push, sideAlive, stat, statusValue,
  type BattleEvent, type BattleState, type Unit,
} from './core';

export type Affinity = 'weak' | 'resist' | 'normal';

/** 원소 상성: 약점이면 1.5배, 상대 원소가 공격 원소를 이기면 0.75배 */
export function affinity(attackEl: ElementOrNone, target: Unit): Affinity {
  if (attackEl === 'none') return 'normal';
  if (target.weakness.includes(attackEl)) return 'weak';
  if (target.element !== 'none' && BEATS[target.element as Element] === attackEl) return 'resist';
  return 'normal';
}
export const AFFINITY_MUL: Record<Affinity, number> = { weak: 1.5, resist: 0.75, normal: 1 };

/** 반응 보너스 (패시브·장비·공명 상태) */
export function reactionBonus(attacker: Unit, r: ReactionId): number {
  return (attacker.specials.reactionPct || 0) + (attacker.specials['react_' + r] || 0) + statusValue(attacker, 'reactionUp');
}

/** 실제 적용될 반응 배율: 1 + (기본배율-1) × (1+보너스) */
export function reactionMul(attacker: Unit, r: ReactionId): number {
  return 1 + (REACTIONS[r].mul - 1) * (1 + reactionBonus(attacker, r));
}

export interface DamageInput {
  power: number;
  type: 'physical' | 'magic';
  element: ElementOrNone;
  reactMul?: number;
  critBonus?: number;
  noRandom?: boolean;
  noCrit?: boolean;
}

/**
 * 피해 = ATK × 스킬배율 × 100/(100+DEF) × 상성 × 반응 × 치명 × 난수
 * 마법은 ATK 대신 MAG, DEF 대신 RES
 */
export function computeDamage(s: BattleState, a: Unit, t: Unit, inp: DamageInput) {
  const off = inp.type === 'magic' ? stat(a, 'mag') : stat(a, 'atk');
  const dfn = inp.type === 'magic' ? stat(t, 'res') : stat(t, 'def');
  const aff = affinity(inp.element, t);
  let dmg = off * inp.power * (100 / (100 + dfn)) * AFFINITY_MUL[aff] * (inp.reactMul ?? 1);
  // 패시브: 원소 피해 보너스, 상태이상 대상 보너스
  if (inp.element !== 'none') dmg *= 1 + (a.specials['elem_' + inp.element] || 0);
  if (a.specials.debuffedPct && hasDebuff(t)) dmg *= 1 + a.specials.debuffedPct;
  let crit = false;
  if (!inp.noCrit) {
    const cr = stat(a, 'crt') / 100 + (inp.critBonus || 0);
    crit = inp.noRandom ? false : chance(s.rng, cr);
    if (crit) dmg *= 1.5;
  }
  if (!inp.noRandom) dmg *= range(s.rng, 0.95, 1.05);
  if (t.defending) dmg *= 0.5;
  if (t.broken) dmg *= 1.5;
  if (t.specials.dmgReduce) dmg *= 1 - t.specials.dmgReduce;
  return { amount: Math.max(1, Math.round(dmg)), crit, aff };
}

/** 피해 적용 (보호막 → HP). 약점 원소는 보호막에 2배. */
export function applyDamage(
  s: BattleState, t: Unit, amount: number, events: BattleEvent[],
  info: { crit?: boolean; aff?: Affinity; element?: ElementOrNone; reaction?: ReactionId; dot?: boolean } = {},
): number {
  if (!t.alive) return 0;
  let rest = amount;
  let absorbed = 0;
  if (t.shield > 0 && !info.dot) {
    const shieldMul = info.aff === 'weak' ? 2 : 1;
    const need = Math.ceil(t.shield / shieldMul);
    if (rest >= need) {
      absorbed = t.shield;
      rest -= need;
      t.shield = 0;
    } else {
      absorbed = rest * shieldMul;
      t.shield -= absorbed;
      rest = 0;
    }
  }
  const dealt = Math.min(t.hp, rest);
  t.hp -= dealt;
  events.push({
    t: 'damage', uid: t.uid, amount: rest, hpAfter: t.hp, shieldAfter: Math.round(t.shield),
    crit: !!info.crit, weak: info.aff === 'weak', resist: info.aff === 'resist',
    element: info.element ?? 'none', reaction: info.reaction, dot: info.dot, absorbed: Math.round(absorbed),
  });
  if (t.hp <= 0) kill(s, t, events);
  return dealt + absorbed;
}

export function kill(s: BattleState, t: Unit, events: BattleEvent[]) {
  if (!t.alive) return;
  t.alive = false;
  t.hp = 0;
  t.shield = 0;
  t.statuses = [];
  t.attached = null;
  t.telegraph = null;
  t.broken = false;
  events.push({ t: 'death', uid: t.uid });
  if (t.side === 'enemy') s.defeated.push(t.defId);
}

export function heal(t: Unit, amount: number, events: BattleEvent[]) {
  if (!t.alive) return 0;
  let a = amount;
  if (t.statuses.some((x) => x.id === 'poison')) a *= 0.5; // 중독: 회복량 50% 감소
  a = Math.round(a);
  const real = Math.min(t.maxHp - t.hp, a);
  t.hp += real;
  events.push({ t: 'heal', uid: t.uid, amount: real, hpAfter: t.hp });
  return real;
}

export function addShield(t: Unit, amount: number, events: BattleEvent[]) {
  if (!t.alive) return;
  const a = Math.round(amount);
  t.shield = Math.max(t.shield, a);
  events.push({ t: 'shield', uid: t.uid, amount: a, shieldAfter: t.shield });
}

/** 공격 원소가 대상에 닿았을 때 반응 판정 (부착 소모) */
export function checkReaction(t: Unit, el: ElementOrNone): ReactionId | null {
  if (el === 'none' || !t.attached || t.reactionImmune) return null;
  if (t.attached.el === el) return null;
  return reactionOf(t.attached.el, el);
}

/** 반응의 부가 효과 (공격자 편 기준으로 대칭 적용) */
export function applyReactionEffect(
  s: BattleState, a: Unit, t: Unit, r: ReactionId, mainDamage: number, events: BattleEvent[],
) {
  const bonus = 1 + reactionBonus(a, r);
  const targetSide = sideAlive(s, t.side);
  switch (r) {
    case 'vaporize':
      break; // 피해 배율로 처리
    case 'electro': {
      const extra = Math.max(1, Math.round(mainDamage * 0.3 * bonus));
      for (const u of targetSide) applyDamage(s, u, extra, events, { element: 'lightning', reaction: 'electro' });
      break;
    }
    case 'firestorm': {
      const splash = Math.max(1, Math.round(mainDamage * 0.5 * bonus));
      for (const u of targetSide) {
        if (u.uid !== t.uid) applyDamage(s, u, splash, events, { element: 'fire', reaction: 'firestorm' });
        if (u.alive) applyStatus(s, u, 'burn', 2, 0.05, events);
      }
      break;
    }
    case 'mud':
      applyStatus(s, t, 'slow', 2, 0.3, events);
      break;
    case 'overload':
      applyStatus(s, t, 'defDown', 2, 0.4, events);
      applyStatus(s, t, 'resDown', 2, 0.4, events);
      break;
    case 'sandstorm':
      for (const u of targetSide) applyStatus(s, u, 'accDown', 2, 0.3, events);
      for (const u of friends(s, a)) applyStatus(s, u, 'evaUp', 2, 0.2, events, { fresh: true });
      break;
    case 'crystallize': {
      for (const u of friends(s, a)) addShield(u, (mainDamage * 0.4 + u.maxHp * 0.05) * bonus, events);
      break;
    }
    case 'freeze':
      if (t.rank === 'boss') {
        push(t, 0.5);
        events.push({ t: 'move', uid: t.uid, dir: 'push' });
        events.push({ t: 'text', text: `${t.name}이(가) 얼어붙어 행동이 밀렸다!` });
      } else {
        applyStatus(s, t, 'freeze', 1, 0, events);
      }
      break;
  }
}

export interface HitSpec {
  power: number;
  type: 'physical' | 'magic';
  element: ElementOrNone;
  applyElement: boolean;
  breakDamage: number;
  critBonus?: number;
  canMiss?: boolean;
  lifesteal?: number;
  forceReaction?: ReactionId; // 공허의 계승자 모방 공격
}

/** 명중 판정: 1 − 공격자 명중 감소 − 대상 회피 */
export function hitChance(a: Unit, t: Unit): number {
  return Math.min(1, Math.max(0.25, 1 - statusValue(a, 'accDown') - stat(t, 'eva')));
}

/** 단일 타격 처리: 반응 → 피해 → 부착 → 브레이크 */
export function hit(s: BattleState, a: Unit, t: Unit, h: HitSpec, events: BattleEvent[]): number {
  if (!t.alive || !a.alive) return 0;
  if (h.canMiss !== false && !chance(s.rng, hitChance(a, t))) {
    events.push({ t: 'miss', uid: t.uid });
    return 0;
  }
  const reaction = h.forceReaction ?? checkReaction(t, h.element);
  const rMul = reaction ? reactionMul(a, reaction) : 1;
  if (reaction && !h.forceReaction) {
    t.attached = null;
    events.push({ t: 'attach', uid: t.uid, el: null });
  }
  if (reaction) {
    events.push({ t: 'reaction', uid: t.uid, reaction, side: a.side });
    if (a.side === 'ally') { s.lastAllyReaction = reaction; s.reactionsTriggered++; }
  }
  const { amount, crit, aff } = computeDamage(s, a, t, {
    power: h.power, type: h.type, element: h.element, reactMul: rMul, critBonus: h.critBonus,
  });
  if (aff === 'weak' && !t.revealed && t.side === 'enemy') {
    t.revealed = true;
    if (!s.revealedIds.includes(t.defId)) s.revealedIds.push(t.defId);
  }
  const dealt = applyDamage(s, t, amount, events, { crit, aff, element: h.element, reaction: reaction ?? undefined });
  if (reaction) applyReactionEffect(s, a, t, reaction, amount, events);

  // 원소 부착 (반응이 없었을 때)
  if (!reaction && h.applyElement && h.element !== 'none' && t.alive && !t.reactionImmune) {
    t.attached = { el: h.element as Element, turns: 2, fresh: false };
    events.push({ t: 'attach', uid: t.uid, el: h.element as Element });
  }

  // 브레이크: 약점 원소로 맞출 때마다 게이지 감소
  if (t.alive && t.breakMax > 0 && !t.broken && aff === 'weak' && h.breakDamage > 0) {
    t.breakCur = Math.max(0, t.breakCur - h.breakDamage);
    if (t.breakCur === 0) {
      t.broken = true;
      const hadTele = t.telegraph;
      t.telegraph = null;
      events.push({ t: 'break', uid: t.uid });
      if (hadTele) events.push({ t: 'text', text: `브레이크! ${t.name}의 예고 기술이 끊겼다!` });
      if (a.specials.breakMp) {
        const g = Math.min(a.maxMp - a.mp, a.specials.breakMp);
        a.mp += g;
        events.push({ t: 'mp', uid: a.uid, amount: g, mpAfter: a.mp });
      }
    }
  }

  if (h.lifesteal && dealt > 0) heal(a, dealt * h.lifesteal, events);
  return dealt;
}

/** 반격 (반격 태세 상태에서 단일 물리 공격을 받았을 때) */
export function maybeCounter(s: BattleState, attacker: Unit, defender: Unit, events: BattleEvent[]) {
  const c = defender.statuses.find((x) => x.id === 'counter');
  if (!c || !defender.alive || !attacker.alive) return;
  events.push({ t: 'action', uid: defender.uid, name: '반격!' });
  const power = (c.value || 0.7) * (1 + (defender.specials.counterPct || 0));
  hit(s, defender, attacker, {
    power, type: 'physical', element: defender.weaponElement, applyElement: false, breakDamage: 1, canMiss: false,
  }, events);
}

export function targetOf(s: BattleState, uid: string): Unit {
  return byUid(s, uid);
}
export { opponents };
