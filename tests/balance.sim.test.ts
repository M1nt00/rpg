// 밸런스 시뮬레이션 (수동 실행: SIM=1 npx vitest run tests/balance.sim.test.ts)
import { it } from 'vitest';
declare const process: { env: Record<string, string | undefined> };
import { createBattle, beginTurn, enemyTurn, playerAction, previewHit, canUseSkill, type PlayerAction } from '../src/battle/engine';
import { sideAlive, type BattleState, type Unit } from '../src/battle/core';
import { REGIONS, skill, character } from '../src/data';
import { newGame, joinAlly, partyUnits, learn, healAll, type GameState } from '../src/game/state';
import { generateEquipment } from '../src/game/items';
import type { Element } from '../src/types';

const ALLIES = ['hero', 'kyle', 'serin', 'arin', 'doyun', 'bark'];
function makeGs(regionIdx: number, level: number): GameState {
  const gs = newGame('sim');
  for (let i = 2; i <= Math.min(5, regionIdx); i++) joinAlly(gs, ALLIES[i], level);
  gs.liberated = (['fire', 'water', 'wind', 'lightning', 'earth'] as Element[]).slice(0, regionIdx - 1);
  for (const id of Object.keys(gs.chars)) {
    const cs = gs.chars[id];
    cs.level = level; cs.sp = level + 1;
    const d = character(id);
    // 장비: 지역 단계 일반 +2
    const tier = Math.min(6, regionIdx);
    const w = generateEquipment({ slot: 'weapon', weaponType: d.weaponType, element: d.element === 'none' ? null : d.element, rarity: 'rare', tier, uid: id + 'w' });
    const a = generateEquipment({ slot: 'armor', rarity: 'rare', tier, uid: id + 'a' });
    const r = generateEquipment({ slot: 'accessory', rarity: 'common', tier, uid: id + 'r' });
    w.plus = a.plus = 2;
    gs.equipment.push(w, a, r);
    cs.equip = { weapon: w.uid, armor: a.uid, acc1: r.uid };
    // 스킬: 첫 갈래 → 둘째 갈래 순서로
    for (const b of [0, 1, 2]) for (const n of d.tree[b].nodes) learn(gs, id, n.id);
  }
  // 파티 편성: 앞 4명
  gs.party = Object.keys(gs.chars).slice(0, 4);
  gs.reserve = Object.keys(gs.chars).slice(4);
  healAll(gs);
  return gs;
}

function choose(s: BattleState, a: Unit): PlayerAction {
  const allies = sideAlive(s, 'ally');
  const enemies = sideAlive(s, 'enemy');
  // 주인공: 약점 원소로 전환
  if (a.defId === 'hero' && !a.switchedThisTurn && s.liberated.length) {
    const t = enemies.find((e) => e.weakness.some((w) => s.liberated.includes(w) && w !== a.element));
    if (t) { const w = t.weakness.find((x) => s.liberated.includes(x))!; return { kind: 'switch', el: w }; }
  }
  const low = allies.filter((u) => u.hp / u.maxHp < 0.4);
  for (const id of a.skills) {
    const sk = skill(id);
    if (!canUseSkill(s, a, sk).ok) continue;
    if (low.length >= 2 && sk.target === 'all_allies' && sk.heal) return { kind: 'skill', skillId: id };
    if (low.length && sk.target === 'single_ally' && sk.heal) return { kind: 'skill', skillId: id, target: low[0].uid };
  }
  let best: { v: number; act: PlayerAction } = { v: -1, act: { kind: 'attack', target: enemies[0].uid } };
  for (const t of enemies) {
    const p = previewHit(s, a, 'attack', t);
    const v = (t.rank === 'boss' ? 1.4 : 1) * (p?.est ?? 0) * (p?.reaction ? 1.5 : 1);
    if (v > best.v) best = { v, act: { kind: 'attack', target: t.uid } };
  }
  for (const id of a.skills) {
    const sk = skill(id);
    if (!canUseSkill(s, a, sk).ok || sk.power <= 0 || sk.type === 'support') continue;
    const targets = sk.target === 'single_enemy' ? enemies : [enemies[0]];
    for (const t of targets) {
      const p = previewHit(s, a, id, t);
      if (!p) continue;
      const mult = sk.target === 'all_enemies' ? enemies.length : sk.hits ?? 1;
      const v = (t.rank === 'boss' ? 1.4 : 1) * p.est * mult * (p.reaction ? 1.6 : 1) * (sk.applyElement && !t.attached ? 1.15 : 1) - sk.mp * 0.3;
      if (v > best.v) best = { v, act: { kind: 'skill', skillId: id, target: t.uid } };
    }
  }
  return best.act;
}

function run(gs: GameState, enemies: string[], seed: number) {
  const s = createBattle({ allies: partyUnits(gs), enemies, seed, liberated: gs.liberated, analyzed: enemies, isBoss: enemies.some((e) => e.includes('golem') || e.includes('witch') || e.includes('griffon') || e.includes('guardian') || e.includes('king') || e.includes('heir')), canFlee: false });
  let turns = 0;
  for (let i = 0; i < 600 && !s.result; i++) {
    const t = beginTurn(s);
    if (!t.actor || t.skipped) continue;
    turns++;
    if (t.actor.side === 'enemy') { enemyTurn(s, t.actor); continue; }
    for (let k = 0; k < 4 && !s.result; k++) {
      const r = playerAction(s, t.actor, choose(s, t.actor));
      if (!r.ok) { playerAction(s, t.actor, { kind: 'attack', target: sideAlive(s, 'enemy')[0].uid }); break; }
      if (r.endsTurn) break;
      if (s.current) t.actor = s.units.find((u) => u.uid === s.current)!;
    }
  }
  const hpLeft = sideAlive(s, 'ally').reduce((x, u) => x + u.hp / u.maxHp, 0) / Math.max(1, s.units.filter((u) => u.side === 'ally' && u.active).length);
  return { win: s.result === 'win', turns, hpLeft };
}

it.skipIf(!process.env.SIM)('지역별 밸런스', () => {
  const rows: string[] = [];
  for (const r of REGIONS) {
    const [lo, hi] = r.levelRange;
    const lvMob = Math.round((lo + hi) / 2) - 1;
    const lvBoss = hi;
    const groups = r.nodes.filter((n) => n.type === 'battle').map((n) => n.encounter!);
    const elite = r.nodes.find((n) => n.type === 'elite')!.encounter!;
    const boss = r.nodes.find((n) => n.type === 'boss')!.encounter!;
    const stat = (gs: GameState, encs: string[][], N: number) => {
      let w = 0, t = 0, hp = 0, n = 0;
      for (const e of encs) for (let i = 0; i < N; i++) { const x = run(gs, e, 1000 + i * 17 + n); w += +x.win; t += x.turns; hp += x.hpLeft; n++; }
      return `승률 ${(w / n * 100).toFixed(0)}% · 평균 ${(t / n).toFixed(0)}턴 · 남은 HP ${(hp / n * 100).toFixed(0)}%`;
    };
    rows.push(`${r.name} 일반(Lv${lvMob}) ${stat(makeGs(r.index, lvMob), groups, 6)}`);
    rows.push(`${r.name} 엘리트(Lv${lvBoss - 1}) ${stat(makeGs(r.index, lvBoss - 1), [elite], 20)}`);
    rows.push(`${r.name} 보스(Lv${lvBoss}) ${stat(makeGs(r.index, lvBoss), [boss], 20)}`);
  }
  console.log(rows.join('\n'));
}, 120000);
