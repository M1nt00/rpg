// 전투 진행: 턴 시작/종료, 스킬 실행, 플레이어 행동, 적 턴
import type { Element, ElementOrNone, EnemyDef, ItemDef, ReactionId, SkillDef } from '../types';
import { enemy as enemyDef, skill as skillDef, REACTIONS } from '../data';
import { chance, makeRng, pick, range } from '../core/rng';
import {
  ACTIVE_ALLIES, MAX_ENEMIES, aliveOnField, applyStatus, baseWait, byUid, cleanse, friends, hasStatus,
  nextActor, opponents, pull, push, reserves, sideAlive, stat, tickDurations,
  type BattleEvent, type BattleState, type Unit,
} from './core';
import { chooseAction, chooseTarget, lowestFriend } from './ai';
import {
  addShield, affinity, applyDamage, checkReaction, computeDamage, heal, hit, maybeCounter, reactionMul,
  type Affinity,
} from './damage';

// ───────────── 생성 ─────────────
export function makeEnemyUnit(def: EnemyDef, uid: string, revealed: boolean): Unit {
  return {
    uid, side: 'enemy', defId: def.id, name: def.name, level: def.level,
    element: def.element, weaponElement: def.element, weakness: [...def.weakness],
    base: { hp: def.stats.hp, mp: 0, atk: def.stats.atk, mag: def.stats.mag, def: def.stats.def, res: def.stats.res, spd: def.stats.spd, crt: 5, eva: 0 },
    hp: def.stats.hp, mp: 0, maxHp: def.stats.hp, maxMp: 0, av: 0,
    statuses: [], attached: null,
    breakMax: def.breakGauge, breakCur: def.breakGauge, broken: false,
    defending: false, shield: 0, skills: def.ai.map((a) => a.action),
    alive: true, active: true, rank: def.rank, telegraph: null, phase: 0, actCount: 0,
    ai: def.ai, phases: def.phases ?? [], actionsPerTurn: def.actionsPerTurn ?? 1,
    reactionImmune: !!def.reactionImmune, specials: {}, attackType: def.stats.mag > def.stats.atk ? 'magic' : 'physical',
    color: '', glyph: '', shape: def.shape, revealed, switchedThisTurn: false, pendingSelfPull: 0,
  };
}

export interface BattleSetup {
  allies: Unit[];          // active 플래그가 설정된 아군 (대기 멤버 포함)
  enemies: string[];
  seed?: number;
  liberated: Element[];
  analyzed: string[];
  isBoss?: boolean;
  canFlee?: boolean;
}

export function createBattle(setup: BattleSetup): BattleState {
  const rng = makeRng(setup.seed);
  const enemies = setup.enemies.map((id, i) => makeEnemyUnit(enemyDef(id), `e${i}`, setup.analyzed.includes(id)));
  const isBoss = setup.isBoss ?? enemies.some((e) => e.rank === 'boss');
  const s: BattleState = {
    units: [...setup.allies, ...enemies], rng, turn: 0, current: null,
    swapsLeft: 2, analyzeUsed: false, lastAllyReaction: null, result: null,
    isBoss, canFlee: setup.canFlee ?? !isBoss, liberated: setup.liberated,
    defeated: [], revealedIds: [], reactionsTriggered: 0, summonSeq: 0,
  };
  for (const u of s.units) {
    u.av = baseWait(u) * range(rng, 0.82, 1.0);
    if (u.specials.firstStrike && u.active) u.av = 0;
  }
  return s;
}

// ───────────── 턴 흐름 ─────────────
export interface TurnStart { events: BattleEvent[]; actor: Unit | null; skipped: boolean }

export function beginTurn(s: BattleState): TurnStart {
  const events: BattleEvent[] = [];
  if (s.result) return { events, actor: null, skipped: false };
  const u = nextActor(s);
  if (!u) { checkResult(s, events); return { events, actor: null, skipped: false }; }
  const d = u.av;
  for (const x of aliveOnField(s)) x.av -= d;
  u.av = 0;
  s.current = u.uid;
  u.actCount += 1;
  u.defending = false;
  u.switchedThisTurn = false;
  events.push({ t: 'turn', uid: u.uid });

  // 지속 피해 / 재생
  for (const st of [...u.statuses]) {
    if (st.id === 'burn') {
      const dmg = Math.max(1, Math.round(u.maxHp * (u.rank === 'boss' ? 0.02 : 0.05)));
      applyDamage(s, u, dmg, events, { dot: true, element: 'fire' });
    } else if (st.id === 'poison') {
      applyDamage(s, u, Math.max(1, Math.round(st.value)), events, { dot: true });
    } else if (st.id === 'regen') {
      heal(u, u.maxHp * st.value, events);
    }
    if (!u.alive) break;
  }
  if (u.alive && u.specials.mpOnTurn && u.mp < u.maxMp) {
    const g = Math.min(u.maxMp - u.mp, u.specials.mpOnTurn);
    u.mp += g;
    events.push({ t: 'mp', uid: u.uid, amount: g, mpAfter: u.mp });
  }
  if (!u.alive) {
    checkResult(s, events);
    endTurn(s, u, events);
    return { events, actor: u, skipped: true };
  }
  if (u.broken) {
    events.push({ t: 'skip', uid: u.uid, reason: '브레이크' });
    u.broken = false;
    u.breakCur = u.breakMax;
    endTurn(s, u, events);
    return { events, actor: u, skipped: true };
  }
  if (hasStatus(u, 'stun') || hasStatus(u, 'freeze')) {
    events.push({ t: 'skip', uid: u.uid, reason: hasStatus(u, 'freeze') ? '빙결' : '기절' });
    endTurn(s, u, events);
    return { events, actor: u, skipped: true };
  }
  return { events, actor: u, skipped: false };
}

export function endTurn(s: BattleState, u: Unit, events: BattleEvent[]) {
  tickDurations(u, events);
  if (u.alive) {
    u.av = baseWait(u);
    if (u.pendingSelfPull) { pull(u, u.pendingSelfPull); u.pendingSelfPull = 0; }
  }
  s.current = null;
  s.turn += 1;
}

export function checkResult(s: BattleState, events: BattleEvent[]) {
  if (s.result) return;
  if (!sideAlive(s, 'enemy').length) { s.result = 'win'; return; }
  if (!sideAlive(s, 'ally').length) {
    const bench = reserves(s).filter((r) => r.alive);
    if (bench.length) {
      const dead = s.units.filter((u) => u.side === 'ally' && u.active && !u.alive);
      for (let i = 0; i < dead.length && i < bench.length; i++) doSwap(s, dead[i], bench[i], events);
      events.push({ t: 'text', text: '대기 멤버가 전선에 나섰다!' });
      return;
    }
    s.result = 'lose';
  }
}

// ───────────── 스킬 실행 ─────────────
export function resolveElement(a: Unit, sk: SkillDef): ElementOrNone {
  if (sk.element === 'self') return a.element;
  if (sk.element === 'weapon') return a.weaponElement;
  return sk.element;
}

function resolveTargets(s: BattleState, a: Unit, sk: SkillDef, targetUid?: string): Unit[] {
  switch (sk.target) {
    case 'single_enemy': {
      const t = targetUid ? byUid(s, targetUid) : null;
      if (t && t.alive && t.active && t.side !== a.side) return [t];
      const opp = opponents(s, a);
      return opp.length ? [pick(s.rng, opp)] : [];
    }
    case 'all_enemies': return opponents(s, a);
    case 'random_enemies': return [];
    case 'single_ally': {
      const t = targetUid ? byUid(s, targetUid) : null;
      if (t && t.alive && t.active && t.side === a.side) return [t];
      return friends(s, a).length ? [lowestFriend(s, a)] : [];
    }
    case 'all_allies':
      return sk.revive ? s.units.filter((u) => u.side === a.side && u.active) : friends(s, a);
    case 'self': return [a];
    case 'dead_ally': {
      const t = targetUid ? byUid(s, targetUid) : null;
      return t && !t.alive && t.active && t.side === a.side ? [t] : [];
    }
    case 'all_dead_allies':
      return s.units.filter((u) => u.side === a.side && u.active && !u.alive);
  }
}

export function executeSkill(s: BattleState, a: Unit, sk: SkillDef, targetUid: string | undefined, events: BattleEvent[]) {
  events.push({ t: 'action', uid: a.uid, name: sk.name, skillId: sk.id });
  if (sk.mp > 0) {
    a.mp = Math.max(0, a.mp - sk.mp);
    events.push({ t: 'mp', uid: a.uid, amount: -sk.mp, mpAfter: a.mp });
  }
  const targets = resolveTargets(s, a, sk, targetUid);
  const el = resolveElement(a, sk);

  // ── 피해 ──
  if (sk.power > 0 && sk.type !== 'support') {
    if (sk.mimic) {
      const r: ReactionId = s.lastAllyReaction ?? pick(s.rng, Object.keys(REACTIONS) as ReactionId[]);
      events.push({ t: 'text', text: `${a.name}이(가) 「${REACTIONS[r].name}」 반응을 모방했다!` });
      for (const t of opponents(s, a)) {
        hit(s, a, t, { power: sk.power, type: sk.type, element: el, applyElement: false, breakDamage: 0, forceReaction: r }, events);
      }
    } else {
      const hits = sk.hits ?? 1;
      const missing = 1 - a.hp / a.maxHp;
      const power = sk.power * (1 + (sk.missingHpBonus ?? 0) * missing);
      const cyc = s.liberated.length ? s.liberated : [];
      let counterTarget: Unit | null = null;
      for (let i = 0; i < hits; i++) {
        const list = sk.target === 'random_enemies'
          ? (opponents(s, a).length ? [pick(s.rng, opponents(s, a))] : [])
          : targets.filter((t) => t.alive);
        if (!list.length) break;
        const hitEl: ElementOrNone = sk.cycleElements && cyc.length ? cyc[i % cyc.length] : el;
        for (const t of list) {
          hit(s, a, t, {
            power, type: sk.type, element: hitEl, applyElement: !!sk.applyElement,
            breakDamage: sk.breakDamage ?? 1, critBonus: sk.critBonus, lifesteal: sk.lifesteal,
          }, events);
          if (sk.push && t.alive) { push(t, sk.push); events.push({ t: 'move', uid: t.uid, dir: 'push' }); }
          if (sk.target === 'single_enemy' && sk.type === 'physical') counterTarget = t;
        }
      }
      if (counterTarget) maybeCounter(s, a, counterTarget, events);
    }
  }

  // ── 보조 효과 ──
  for (const t of targets) {
    if (sk.revive && !t.alive) {
      t.alive = true;
      t.hp = Math.max(1, Math.round(t.maxHp * sk.revive));
      t.av = baseWait(t);
      events.push({ t: 'revive', uid: t.uid, hpAfter: t.hp });
    }
    if (!t.alive) continue;
    const healMul = 1 + (a.specials.healPct || 0);
    if (sk.heal) heal(t, sk.heal * stat(a, 'mag') * healMul + (sk.type === 'support' ? 10 : 0), events);
    if (sk.healPct) heal(t, t.maxHp * sk.healPct * healMul, events);
    if (sk.shield) addShield(t, sk.shield * Math.max(stat(a, 'mag'), stat(a, 'def')), events);
    if (sk.shieldPct) addShield(t, t.maxHp * sk.shieldPct, events);
    if (sk.cleanse) cleanse(t, events);
    if (sk.pull && sk.type === 'support') { pull(t, sk.pull); events.push({ t: 'move', uid: t.uid, dir: 'pull' }); }
    if (sk.push && sk.type === 'support') { push(t, sk.push); events.push({ t: 'move', uid: t.uid, dir: 'push' }); }
  }
  if (sk.mpRestore) {
    const g = Math.min(a.maxMp - a.mp, sk.mpRestore);
    a.mp += g;
    events.push({ t: 'mp', uid: a.uid, amount: g, mpAfter: a.mp });
  }

  // ── 상태 효과 ──
  for (const ef of sk.effects ?? []) {
    const to = ef.to ?? 'target';
    const recips = to === 'self' ? [a] : to === 'allies' ? friends(s, a) : to === 'enemies' ? opponents(s, a) : targets.filter((t) => t.alive);
    for (const r of recips) {
      let value = ef.value ?? 0;
      if (ef.status === 'poison') value = Math.max(1, (ef.value ?? 0.4) * Math.max(stat(a, 'atk'), stat(a, 'mag')));
      if (ef.status === 'burn') value = 0.05;
      applyStatus(s, r, ef.status, ef.turns, value, events, { chance: ef.chance, fresh: r.uid === a.uid });
      if (ef.status === 'taunt' && r.uid === a.uid && a.specials.tauntShield) addShield(a, a.maxHp * a.specials.tauntShield, events);
    }
  }
  if (sk.pull && a.specials.pullSelf) a.pendingSelfPull = a.specials.pullSelf;

  // ── 소환 ──
  if (sk.summon) {
    for (const id of sk.summon) {
      if (sideAlive(s, a.side).length >= MAX_ENEMIES) break;
      const u = makeEnemyUnit(enemyDef(id), `s${s.summonSeq++}`, true);
      u.av = baseWait(u) * 0.6;
      s.units.push(u);
      events.push({ t: 'summon', uid: u.uid });
    }
  }
  checkPhases(s, events);
  checkResult(s, events);
}

/** 보스 페이즈 전환 */
export function checkPhases(s: BattleState, events: BattleEvent[]) {
  for (const u of s.units) {
    if (!u.alive || !u.phases.length) continue;
    while (u.phase < u.phases.length && u.hp / u.maxHp <= u.phases[u.phase].hpBelow) {
      const ph = u.phases[u.phase];
      u.phase += 1;
      if (ph.element) { u.element = ph.element; u.weaponElement = ph.element; events.push({ t: 'element', uid: u.uid, el: ph.element }); }
      if (ph.weakness) u.weakness = [...ph.weakness];
      if (ph.ai) u.ai = ph.ai;
      if (ph.actionsPerTurn) u.actionsPerTurn = ph.actionsPerTurn;
      u.attached = null;
      events.push({ t: 'phase', uid: u.uid, text: ph.message ?? `${u.name}의 기운이 변했다!` });
      if (ph.onEnter) {
        const sk = skillDef(ph.onEnter);
        const t = chooseTarget(s, u, 'random');
        executeSkill(s, u, sk, t?.uid, events);
      }
    }
  }
}

// ───────────── 적 턴 ─────────────
export function enemyTurn(s: BattleState, u: Unit): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (let i = 0; i < u.actionsPerTurn; i++) {
    if (!u.alive || s.result) break;
    if (u.telegraph) {
      const sk = skillDef(u.telegraph);
      u.telegraph = null;
      const t = chooseTarget(s, u, 'random');
      executeSkill(s, u, sk, t?.uid, events);
      continue;
    }
    const rule = chooseAction(s, u);
    const sk = skillDef(rule.action);
    if (sk.telegraph) {
      u.telegraph = sk.id;
      events.push({ t: 'telegraph', uid: u.uid, name: sk.name });
      break;
    }
    let target: Unit | null = null;
    if (sk.target === 'single_enemy') target = chooseTarget(s, u, rule.target);
    else if (sk.target === 'single_ally') target = lowestFriend(s, u);
    executeSkill(s, u, sk, target?.uid, events);
  }
  endTurn(s, u, events);
  return events;
}

// ───────────── 플레이어 행동 ─────────────
export type PlayerAction =
  | { kind: 'attack'; target: string }
  | { kind: 'skill'; skillId: string; target?: string }
  | { kind: 'defend' }
  | { kind: 'item'; item: ItemDef; target?: string }
  | { kind: 'swap'; out: string; in: string }
  | { kind: 'switch'; el: Element }
  | { kind: 'flee' }
  | { kind: 'analyze' };

export interface ActionResult { events: BattleEvent[]; endsTurn: boolean; ok: boolean; consumedItem?: string; message?: string }

export function canUseSkill(s: BattleState, a: Unit, sk: SkillDef): { ok: boolean; why?: string } {
  if (hasStatus(a, 'silence') && sk.mp > 0) return { ok: false, why: '침묵 상태' };
  if (a.mp < sk.mp) return { ok: false, why: 'MP 부족' };
  if (sk.id === 'hero_switch') {
    if (a.switchedThisTurn) return { ok: false, why: '이번 턴에 이미 전환' };
    if (s.liberated.length === 0) return { ok: false, why: '해방한 원소 없음' };
  }
  if (sk.target === 'dead_ally' && !s.units.some((u) => u.side === a.side && u.active && !u.alive)) return { ok: false, why: '대상 없음' };
  return { ok: true };
}

export function basicAttack(s: BattleState, a: Unit, targetUid: string, events: BattleEvent[]) {
  events.push({ t: 'action', uid: a.uid, name: '공격' });
  const t0 = byUid(s, targetUid);
  const t = t0.alive && t0.active ? t0 : pick(s.rng, opponents(s, a));
  if (!t) return;
  hit(s, a, t, {
    power: a.attackType === 'magic' ? 0.95 : 1.0, type: a.attackType, element: a.weaponElement,
    applyElement: !!a.specials.basicAttach, breakDamage: 1,
  }, events);
  if (a.attackType === 'physical') maybeCounter(s, a, t, events);
  gainMp(a, 10, events);
  checkPhases(s, events);
  checkResult(s, events);
}

function gainMp(a: Unit, n: number, events: BattleEvent[]) {
  const g = Math.min(a.maxMp - a.mp, n);
  if (g > 0) { a.mp += g; events.push({ t: 'mp', uid: a.uid, amount: g, mpAfter: a.mp }); }
}

export function doSwap(s: BattleState, out: Unit, inn: Unit, events: BattleEvent[]) {
  inn.active = true;
  out.active = false;
  inn.av = out.av;
  out.statuses = [];
  out.attached = null;
  out.defending = false;
  out.shield = 0;
  const i = s.units.indexOf(out), j = s.units.indexOf(inn);
  s.units[i] = inn; s.units[j] = out;
  if (s.current === out.uid) s.current = inn.uid;
  events.push({ t: 'swap', outUid: out.uid, inUid: inn.uid });
}

export function useItemEffect(s: BattleState, a: Unit, it: ItemDef, targetUid: string | undefined, events: BattleEvent[]): boolean {
  const use = it.use;
  if (!use) return false;
  const t = targetUid ? byUid(s, targetUid) : a;
  events.push({ t: 'action', uid: a.uid, name: it.name });
  const boost = 1 + (a.specials.itemPct || 0);
  if (use.target === 'dead_ally') {
    if (t.alive || t.side !== a.side) return false;
    t.alive = true;
    t.hp = Math.max(1, Math.round(t.maxHp * (use.revive ?? 0.3)));
    t.av = baseWait(t);
    events.push({ t: 'revive', uid: t.uid, hpAfter: t.hp });
    return true;
  }
  if (!t.alive) return false;
  if (use.target === 'enemy') {
    if (t.side === a.side) return false;
    hit(s, a, t, {
      power: use.damage ?? 0.5, type: 'magic', element: use.element ?? 'none', applyElement: true, breakDamage: 1, canMiss: false,
    }, events);
    checkPhases(s, events);
    checkResult(s, events);
    return true;
  }
  if (use.heal || use.healPct) heal(t, ((use.heal ?? 0) + t.maxHp * (use.healPct ?? 0)) * boost, events);
  if (use.mp) gainMp(t, Math.round(use.mp * boost), events);
  if (use.cleanse) cleanse(t, events);
  return true;
}

export function playerAction(s: BattleState, a: Unit, act: PlayerAction): ActionResult {
  const events: BattleEvent[] = [];
  const done = (endsTurn: boolean, extra: Partial<ActionResult> = {}): ActionResult => {
    if (endsTurn && s.current === a.uid) endTurn(s, a, events);
    return { events, endsTurn, ok: true, ...extra };
  };
  switch (act.kind) {
    case 'attack':
      basicAttack(s, a, act.target, events);
      return done(true);
    case 'skill': {
      const sk = skillDef(act.skillId);
      const c = canUseSkill(s, a, sk);
      if (!c.ok) return { events, endsTurn: false, ok: false, message: c.why };
      executeSkill(s, a, sk, act.target, events);
      return done(!sk.free);
    }
    case 'defend':
      a.defending = true;
      events.push({ t: 'action', uid: a.uid, name: '방어' });
      gainMp(a, 15, events);
      return done(true);
    case 'item': {
      const ok = useItemEffect(s, a, act.item, act.target, events);
      if (!ok) return { events, endsTurn: false, ok: false, message: '사용할 수 없는 대상' };
      return done(true, { consumedItem: act.item.id });
    }
    case 'swap': {
      const out = byUid(s, act.out), inn = byUid(s, act.in);
      if (s.swapsLeft <= 0) return { events, endsTurn: false, ok: false, message: '교대 횟수 소진' };
      if (inn.active || !inn.alive || !out.active || out.side !== 'ally') return { events, endsTurn: false, ok: false, message: '교대 불가' };
      s.swapsLeft -= 1;
      doSwap(s, out, inn, events);
      return { events, endsTurn: false, ok: true };
    }
    case 'switch': {
      if (a.switchedThisTurn || !s.liberated.includes(act.el)) return { events, endsTurn: false, ok: false, message: '전환 불가' };
      a.element = act.el;
      a.weaponElement = act.el;
      a.weakness = [weaknessOf(act.el)];
      a.switchedThisTurn = true;
      events.push({ t: 'element', uid: a.uid, el: act.el });
      return { events, endsTurn: false, ok: true };
    }
    case 'flee': {
      if (!s.canFlee) return { events, endsTurn: false, ok: false, message: '도망칠 수 없다!' };
      const avg = (l: Unit[]) => l.reduce((x, u) => x + stat(u, 'spd'), 0) / Math.max(1, l.length);
      const p = Math.min(0.9, Math.max(0.2, 0.5 + (avg(sideAlive(s, 'ally')) - avg(sideAlive(s, 'enemy'))) * 0.01));
      if (chance(s.rng, p)) {
        s.result = 'fled';
        events.push({ t: 'text', text: '무사히 도망쳤다!' });
        return { events, endsTurn: false, ok: true };
      }
      events.push({ t: 'text', text: '도망치지 못했다!' });
      return done(true);
    }
    case 'analyze': {
      if (s.analyzeUsed) return { events, endsTurn: false, ok: false, message: '이미 분석함' };
      s.analyzeUsed = true;
      for (const e of sideAlive(s, 'enemy')) {
        e.revealed = true;
        if (!s.revealedIds.includes(e.defId)) s.revealedIds.push(e.defId);
      }
      events.push({ t: 'text', text: '적을 분석했다! 약점이 드러났다.' });
      return { events, endsTurn: false, ok: true };
    }
  }
}

export function weaknessOf(el: Element): Element {
  const m: Record<Element, Element> = { fire: 'water', wind: 'fire', earth: 'wind', lightning: 'earth', water: 'lightning' };
  return m[el];
}

// ───────────── UI 미리보기 ─────────────
export interface HitPreview { reaction: ReactionId | null; aff: Affinity; est: number; breaks: boolean; immune: boolean }

export function previewHit(s: BattleState, a: Unit, skillId: string | 'attack', t: Unit): HitPreview | null {
  if (t.side === a.side) return null;
  let el: ElementOrNone, power: number, type: 'physical' | 'magic', bd = 1;
  if (skillId === 'attack') {
    el = a.weaponElement; power = a.attackType === 'magic' ? 0.95 : 1; type = a.attackType;
  } else {
    const sk = skillDef(skillId);
    if (sk.power <= 0 || sk.type === 'support') return null;
    el = sk.cycleElements && s.liberated.length ? s.liberated[0] : resolveElement(a, sk);
    power = sk.power * (1 + (sk.missingHpBonus ?? 0) * (1 - a.hp / a.maxHp));
    type = sk.type;
    bd = sk.breakDamage ?? 1;
  }
  const reaction = checkReaction(t, el);
  const { amount, aff } = computeDamage(s, a, t, {
    power, type, element: el, reactMul: reaction ? reactionMul(a, reaction) : 1, noRandom: true, noCrit: true,
  });
  return {
    reaction, aff: t.revealed || aff !== 'weak' ? aff : 'normal', est: amount,
    breaks: t.revealed && aff === 'weak' && !t.broken && t.breakCur <= bd, immune: t.reactionImmune,
  };
}

export { affinity, ACTIVE_ALLIES };
