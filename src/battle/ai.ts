// 적 AI: 규칙 기반 가중치 방식
import type { AiCond, AiRule, SkillDef, TargetRule } from '../types';
import { skill as skillDef } from '../data';
import { next, pick, weighted } from '../core/rng';
import { friends, hasStatus, opponents, stat, type BattleState, type Unit } from './core';

export function condOk(s: BattleState, u: Unit, c: AiCond | undefined): boolean {
  if (!c) return true;
  const ratio = u.hp / u.maxHp;
  if (c.selfHpBelow !== undefined && !(ratio < c.selfHpBelow)) return false;
  if (c.selfHpAbove !== undefined && !(ratio > c.selfHpAbove)) return false;
  if (c.turnEvery !== undefined && u.actCount % c.turnEvery !== 0) return false;
  if (c.minTurn !== undefined && !(u.actCount > c.minTurn)) return false;
  if (c.noShield && u.shield > 0) return false;
  if (c.allyHpBelow !== undefined && !friends(s, u).some((f) => f.hp / f.maxHp < c.allyHpBelow!)) return false;
  if (c.summonsBelow !== undefined && friends(s, u).length >= c.summonsBelow) return false;
  return true;
}

function usable(u: Unit, sk: SkillDef): boolean {
  if (hasStatus(u, 'silence') && sk.type !== 'physical') return false;
  return true;
}

/** 행동 선택 — 조건을 만족하는 규칙 중 가중치 랜덤 */
export function chooseAction(s: BattleState, u: Unit): AiRule {
  const rules = u.ai.filter((r) => {
    const sk = skillDef(r.action);
    if (!usable(u, sk)) return false;
    if (sk.summon && friends(s, u).length >= 5) return false;
    if (sk.target === 'single_ally' && !friends(s, u).some((f) => f.hp < f.maxHp * 0.7)) return false;
    return condOk(s, u, r.cond);
  });
  // 예고형 기술 등 가중치 100짜리는 조건이 맞으면 우선
  const forced = rules.filter((r) => r.weight >= 100);
  const pool = forced.length ? forced : rules;
  const chosen = weighted(s.rng, pool, (r) => r.weight);
  return chosen ?? { action: 'e_slam', weight: 1 };
}

/** 단일 대상 선택 — 도발 우선, 그다음 규칙 */
export function chooseTarget(s: BattleState, u: Unit, rule: TargetRule | undefined): Unit | null {
  const opp = opponents(s, u);
  if (!opp.length) return null;
  const taunters = opp.filter((o) => hasStatus(o, 'taunt'));
  if (taunters.length) return pick(s.rng, taunters);
  switch (rule) {
    case 'lowestHp':
      return opp.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b));
    case 'attached': {
      const att = opp.filter((o) => o.attached);
      if (att.length && next(s.rng) < 0.75) return pick(s.rng, att);
      return pick(s.rng, opp);
    }
    case 'highestAtk':
      return opp.reduce((a, b) => (stat(a, 'atk') >= stat(b, 'atk') ? a : b));
    case 'mage': {
      const m = opp.filter((o) => o.attackType === 'magic');
      return m.length ? pick(s.rng, m) : pick(s.rng, opp);
    }
    default:
      return pick(s.rng, opp);
  }
}

export function lowestFriend(s: BattleState, u: Unit): Unit {
  return friends(s, u).reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b));
}
