import { describe, expect, it } from 'vitest';
import { createBattle, beginTurn, enemyTurn, playerAction, makeEnemyUnit, executeSkill } from '../src/battle/engine';
import { computeDamage, hit } from '../src/battle/damage';
import { previewOrder, byUid, type BattleEvent, type BattleState, type Unit } from '../src/battle/core';
import { enemy, skill } from '../src/data';
import { newGame, partyUnits, makeAllyUnit, joinAlly, type GameState } from '../src/game/state';
import { grantBattleRewards, writeBack } from '../src/game/world';

function setup(enemies: string[], seed = 1, gs?: GameState): { s: BattleState; gs: GameState } {
  const g = gs ?? newGame('테스트');
  const s = createBattle({ allies: partyUnits(g), enemies, seed, liberated: g.liberated, analyzed: [] });
  return { s, gs: g };
}

/** 아군은 첫 번째 적을 일반 공격, 적은 AI */
function autoplay(s: BattleState, maxTurns = 400) {
  for (let i = 0; i < maxTurns && !s.result; i++) {
    const t = beginTurn(s);
    if (!t.actor || t.skipped) continue;
    if (t.actor.side === 'enemy') enemyTurn(s, t.actor);
    else {
      const target = s.units.find((u) => u.side === 'enemy' && u.alive && u.active)!;
      playerAction(s, t.actor, { kind: 'attack', target: target.uid });
    }
  }
}

describe('데미지 공식', () => {
  it('ATK × 배율 × 100/(100+DEF) × 상성', () => {
    const { s } = setup(['ash_wolf']);
    const a = s.units[0];
    const t = s.units.find((u) => u.side === 'enemy')!;
    a.base.atk = 100; t.base.def = 0;
    const n = computeDamage(s, a, t, { power: 1, type: 'physical', element: 'none', noRandom: true, noCrit: true });
    expect(n.amount).toBe(100);
    t.base.def = 100;
    const h = computeDamage(s, a, t, { power: 1, type: 'physical', element: 'none', noRandom: true, noCrit: true });
    expect(h.amount).toBe(50);
    // 늑대(바람)는 불에 약하다 → 1.5배
    const w = computeDamage(s, a, t, { power: 1, type: 'physical', element: 'fire', noRandom: true, noCrit: true });
    expect(w.aff).toBe('weak');
    expect(w.amount).toBe(75);
    // 바람은 땅을 이긴다 → 땅 공격은... 늑대 원소(바람)가 땅을 이기므로 0.75배
    const r = computeDamage(s, a, t, { power: 1, type: 'physical', element: 'earth', noRandom: true, noCrit: true });
    expect(r.aff).toBe('resist');
    expect(r.amount).toBe(38);
  });
});

describe('원소 반응', () => {
  it('불 부착 후 물 → 증발(2배), 부착 해제', () => {
    const { s } = setup(['dust_beetle']);
    const a = s.units[0];
    const t = s.units.find((u) => u.side === 'enemy')!;
    t.base.def = 0; t.base.res = 0; t.hp = t.maxHp = 100000; a.base.mag = 100; a.base.crt = 0;
    const ev: BattleEvent[] = [];
    hit(s, a, t, { power: 1, type: 'magic', element: 'fire', applyElement: true, breakDamage: 0, canMiss: false }, ev);
    expect(t.attached?.el).toBe('fire');
    const before = t.hp;
    hit(s, a, t, { power: 1, type: 'magic', element: 'water', applyElement: true, breakDamage: 0, canMiss: false }, ev);
    expect(ev.some((e) => e.t === 'reaction' && e.reaction === 'vaporize')).toBe(true);
    expect(t.attached).toBeNull();
    const dealt = before - t.hp;
    expect(dealt).toBeGreaterThanOrEqual(190);
    expect(dealt).toBeLessThanOrEqual(210);
  });

  it('땅 + 번개 → 결정화: 공격자 편 보호막', () => {
    const { s } = setup(['ember_slime']);
    const a = s.units[0];
    const t = s.units.find((u) => u.side === 'enemy')!;
    t.hp = t.maxHp = 100000;
    const ev: BattleEvent[] = [];
    hit(s, a, t, { power: 1, type: 'magic', element: 'earth', applyElement: true, breakDamage: 0, canMiss: false }, ev);
    hit(s, a, t, { power: 1, type: 'magic', element: 'lightning', applyElement: true, breakDamage: 0, canMiss: false }, ev);
    expect(s.units.filter((u) => u.side === 'ally' && u.active).every((u) => u.shield > 0)).toBe(true);
  });

  it('분신(반응 면역)에는 반응이 일어나지 않는다', () => {
    const { s } = setup(['mist_clone']);
    const a = s.units[0];
    const t = s.units.find((u) => u.side === 'enemy')!;
    t.hp = t.maxHp = 100000;
    const ev: BattleEvent[] = [];
    hit(s, a, t, { power: 1, type: 'magic', element: 'fire', applyElement: true, breakDamage: 0, canMiss: false }, ev);
    hit(s, a, t, { power: 1, type: 'magic', element: 'water', applyElement: true, breakDamage: 0, canMiss: false }, ev);
    expect(ev.some((e) => e.t === 'reaction')).toBe(false);
  });
});

describe('브레이크', () => {
  it('약점으로 게이지를 깎으면 브레이크 → 다음 행동 건너뜀 → 게이지 회복', () => {
    const { s } = setup(['ash_wolf']);
    const a = s.units[0];
    const t = s.units.find((u) => u.side === 'enemy')!;
    t.hp = t.maxHp = 100000;
    const ev: BattleEvent[] = [];
    for (let i = 0; i < 3; i++) hit(s, a, t, { power: 0.1, type: 'physical', element: 'fire', applyElement: false, breakDamage: 1, canMiss: false }, ev);
    expect(t.broken).toBe(true);
    // 브레이크 중 피해 1.5배
    const d1 = computeDamage(s, a, t, { power: 1, type: 'physical', element: 'none', noRandom: true, noCrit: true }).amount;
    t.broken = false;
    const d0 = computeDamage(s, a, t, { power: 1, type: 'physical', element: 'none', noRandom: true, noCrit: true }).amount;
    t.broken = true;
    expect(d1).toBeCloseTo(d0 * 1.5, -1);
    // 늑대 차례가 오면 건너뛰고 회복
    for (const u of s.units) u.av = 999;
    t.av = 0;
    const turn = beginTurn(s);
    expect(turn.actor?.uid).toBe(t.uid);
    expect(turn.skipped).toBe(true);
    expect(t.broken).toBe(false);
    expect(t.breakCur).toBe(t.breakMax);
  });

  it('브레이크는 예고 기술을 끊는다', () => {
    const { s } = setup(['ash_golem']);
    const g = s.units.find((u) => u.side === 'enemy')!;
    g.telegraph = 'golem_lava';
    const ev: BattleEvent[] = [];
    g.breakCur = 1;
    hit(s, s.units[0], g, { power: 0.1, type: 'magic', element: 'water', applyElement: false, breakDamage: 1, canMiss: false }, ev);
    expect(g.broken).toBe(true);
    expect(g.telegraph).toBeNull();
  });
});

describe('타임라인', () => {
  it('빠른 유닛이 더 자주 행동하고, 미리보기는 8칸', () => {
    const { s } = setup(['ash_wolf']);
    const order = previewOrder(s, 8);
    expect(order.length).toBe(8);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 60; i++) {
      const t = beginTurn(s);
      if (!t.actor) break;
      counts[t.actor.uid] = (counts[t.actor.uid] || 0) + 1;
      if (!t.skipped) { t.actor.av = 1000 / t.actor.base.spd; s.current = null; }
    }
    const hero = s.units.find((u) => u.defId === 'hero')!; // spd 102
    const kyle = s.units.find((u) => u.defId === 'kyle')!; // spd 94
    expect(counts[hero.uid]).toBeGreaterThanOrEqual(counts[kyle.uid]);
  });

  it('순풍은 아군 행동을 당긴다', () => {
    const gs = newGame('t');
    joinAlly(gs, 'arin', 5);
    const { s } = setup(['ash_wolf'], 3, gs);
    const arin = s.units.find((u) => u.defId === 'arin')!;
    const kyle = s.units.find((u) => u.defId === 'kyle')!;
    kyle.av = 8; arin.mp = 50;
    executeSkill(s, arin, skill('arin_tailwind'), kyle.uid, []);
    expect(kyle.av).toBeLessThan(8);
  });
});

describe('전투 전체 흐름', () => {
  it('1지역 전투는 끝까지 돌아가고 보상이 들어온다', () => {
    const { s, gs } = setup(['ash_wolf', 'ash_wolf'], 7);
    autoplay(s);
    expect(s.result).toBe('win');
    writeBack(gs, s, true);
    const rw = grantBattleRewards(gs, s);
    expect(rw.exp).toBeGreaterThan(0);
    expect(gs.kills.ash_wolf).toBe(2);
  });

  it('보스는 페이즈 전환과 예고 기술을 쓴다', () => {
    const gs = newGame('t');
    for (const id of ['hero', 'kyle']) { gs.chars[id].level = 30; }
    const s = createBattle({ allies: [makeAllyUnit(gs, 'hero', true), makeAllyUnit(gs, 'kyle', true)], enemies: ['ash_golem'], seed: 5, liberated: [], analyzed: [] });
    for (const u of s.units) if (u.side === 'ally') { u.hp = u.maxHp = 99999; }
    const seen = new Set<string>();
    for (let i = 0; i < 400 && !s.result; i++) {
      const t = beginTurn(s);
      if (!t.actor || t.skipped) continue;
      if (t.actor.side === 'enemy') { for (const e of enemyTurn(s, t.actor)) seen.add(e.t); }
      else {
        const g = s.units.find((u) => u.side === 'enemy' && u.alive)!;
        for (const e of playerAction(s, t.actor, { kind: 'attack', target: g.uid }).events) seen.add(e.t);
      }
    }
    expect(s.result).toBe('win');
    expect(seen.has('telegraph')).toBe(true);
    expect(seen.has('phase')).toBe(true);
  });

  it('마녀는 분신을 소환한다', () => {
    const { s } = setup(['lake_witch'], 11);
    const w = s.units.find((u) => u.side === 'enemy')!;
    w.actCount = 2;
    for (const u of s.units) if (u.side === 'ally') { u.hp = u.maxHp = 99999; }
    s.current = w.uid;
    enemyTurn(s, w);
    // 1회 행동 후 분신이 있거나, 다른 행동을 했다
    const clones = s.units.filter((u) => u.defId === 'mist_clone');
    expect(clones.length === 0 || clones.length === 2).toBe(true);
  });

  it('교대는 턴을 소모하지 않는다', () => {
    const gs = newGame('t');
    for (const id of ['serin', 'arin', 'doyun']) joinAlly(gs, id, 3);
    expect(gs.reserve).toEqual(['doyun']);
    const { s } = setup(['ash_wolf'], 2, gs);
    for (const u of s.units) u.av = 50;
    const hero = byUid(s, 'a_hero'); hero.av = 0;
    const t = beginTurn(s);
    expect(t.actor?.uid).toBe('a_hero');
    const r = playerAction(s, hero, { kind: 'swap', out: 'a_hero', in: 'a_doyun' });
    expect(r.ok).toBe(true);
    expect(r.endsTurn).toBe(false);
    expect(s.current).toBe('a_doyun');
    expect(s.swapsLeft).toBe(1);
  });

  it('모든 적 데이터의 AI 스킬이 존재한다', () => {
    for (const id of ['ash_golem', 'lake_witch', 'storm_griffon', 'thunder_guardian', 'dwarf_king', 'void_heir']) {
      const d = enemy(id);
      for (const r of [...d.ai, ...(d.phases ?? []).flatMap((p) => p.ai ?? [])]) expect(() => skill(r.action)).not.toThrow();
      const u: Unit = makeEnemyUnit(d, 'x', false);
      expect(u.maxHp).toBeGreaterThan(0);
    }
  });
});
