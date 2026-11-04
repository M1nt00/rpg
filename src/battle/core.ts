// 전투 상태 타입과 공통 유틸 (DOM 없음, 순수 로직)
import type { AiRule, Element, ElementOrNone, PhaseDef, ReactionId, Side, Stats, StatusId } from '../types';
import type { Rng } from '../core/rng';
import { chance } from '../core/rng';

export interface StatusInst {
  id: StatusId;
  turns: number;
  value: number;
  fresh: boolean; // 이번 턴에 걸린 상태 — 턴 종료 시 한 번 감소를 건너뜀
}

export interface Unit {
  uid: string;
  side: Side;
  defId: string;
  name: string;
  level: number;
  element: ElementOrNone;
  weaponElement: ElementOrNone;
  weakness: Element[];
  base: Stats & { eva: number };
  hp: number;
  mp: number;
  maxHp: number;
  maxMp: number;
  av: number;
  statuses: StatusInst[];
  attached: { el: Element; turns: number; fresh: boolean } | null;
  breakMax: number;
  breakCur: number;
  broken: boolean;
  defending: boolean;
  shield: number;
  skills: string[];
  alive: boolean;
  active: boolean;
  rank: 'ally' | 'normal' | 'elite' | 'boss' | 'summon';
  telegraph: string | null;
  phase: number;
  actCount: number;
  ai: AiRule[];
  phases: PhaseDef[];
  actionsPerTurn: number;
  reactionImmune: boolean;
  specials: Record<string, number>;
  attackType: 'physical' | 'magic';
  color: string;
  glyph: string;
  shape?: string;
  revealed: boolean;
  switchedThisTurn: boolean;
  pendingSelfPull: number;
}

export type BattleEvent =
  | { t: 'turn'; uid: string }
  | { t: 'action'; uid: string; name: string; skillId?: string }
  | { t: 'damage'; uid: string; amount: number; hpAfter: number; shieldAfter: number; crit: boolean; weak: boolean; resist: boolean; element: ElementOrNone; reaction?: ReactionId; dot?: boolean; absorbed: number }
  | { t: 'miss'; uid: string }
  | { t: 'heal'; uid: string; amount: number; hpAfter: number }
  | { t: 'mp'; uid: string; amount: number; mpAfter: number }
  | { t: 'shield'; uid: string; amount: number; shieldAfter: number }
  | { t: 'reaction'; uid: string; reaction: ReactionId; side: Side }
  | { t: 'break'; uid: string }
  | { t: 'status'; uid: string; status: StatusId; add: boolean }
  | { t: 'attach'; uid: string; el: Element | null }
  | { t: 'death'; uid: string }
  | { t: 'revive'; uid: string; hpAfter: number }
  | { t: 'text'; text: string }
  | { t: 'telegraph'; uid: string; name: string }
  | { t: 'phase'; uid: string; text: string }
  | { t: 'summon'; uid: string }
  | { t: 'swap'; outUid: string; inUid: string }
  | { t: 'element'; uid: string; el: ElementOrNone }
  | { t: 'skip'; uid: string; reason: string }
  | { t: 'move'; uid: string; dir: 'pull' | 'push' };

export interface BattleState {
  units: Unit[];
  rng: Rng;
  turn: number;
  current: string | null;
  swapsLeft: number;
  analyzeUsed: boolean;
  lastAllyReaction: ReactionId | null;
  result: null | 'win' | 'lose' | 'fled';
  isBoss: boolean;
  canFlee: boolean;
  liberated: Element[];
  defeated: string[];         // 처치한 적 defId
  revealedIds: string[];      // 이번 전투에서 새로 알아낸 약점 (defId)
  reactionsTriggered: number;
  summonSeq: number;
}

export const MAX_ENEMIES = 5;
export const ACTIVE_ALLIES = 4;

export function byUid(s: BattleState, uid: string): Unit {
  const u = s.units.find((x) => x.uid === uid);
  if (!u) throw new Error('unit not found ' + uid);
  return u;
}

export function onField(s: BattleState): Unit[] {
  return s.units.filter((u) => u.active);
}
export function aliveOnField(s: BattleState): Unit[] {
  return s.units.filter((u) => u.active && u.alive);
}
export function sideAlive(s: BattleState, side: Side): Unit[] {
  return s.units.filter((u) => u.active && u.alive && u.side === side);
}
export function opponents(s: BattleState, u: Unit): Unit[] {
  return sideAlive(s, u.side === 'ally' ? 'enemy' : 'ally');
}
export function friends(s: BattleState, u: Unit): Unit[] {
  return sideAlive(s, u.side);
}
export function reserves(s: BattleState): Unit[] {
  return s.units.filter((u) => u.side === 'ally' && !u.active);
}

export function statusValue(u: Unit, id: StatusId): number {
  const st = u.statuses.find((x) => x.id === id);
  return st ? st.value : 0;
}
export function hasStatus(u: Unit, id: StatusId): boolean {
  return u.statuses.some((x) => x.id === id);
}
export function hasDebuff(u: Unit): boolean {
  return u.statuses.some((x) =>
    ['burn', 'poison', 'stun', 'silence', 'slow', 'atkDown', 'defDown', 'resDown', 'accDown', 'freeze'].includes(x.id));
}

/** 상태이상이 반영된 현재 능력치 */
export function stat(u: Unit, key: 'atk' | 'mag' | 'def' | 'res' | 'spd' | 'crt' | 'eva'): number {
  const b = u.base[key];
  switch (key) {
    case 'atk': return b * Math.max(0.2, 1 + statusValue(u, 'atkUp') - statusValue(u, 'atkDown'));
    case 'mag': return b * Math.max(0.2, 1 + statusValue(u, 'magUp'));
    case 'def': return b * Math.max(0.2, 1 + statusValue(u, 'defUp') - statusValue(u, 'defDown'));
    case 'res': return b * Math.max(0.2, 1 + statusValue(u, 'resUp') - statusValue(u, 'resDown'));
    case 'spd': return b * Math.max(0.3, 1 + statusValue(u, 'haste') - statusValue(u, 'slow'));
    case 'crt': return b;
    case 'eva': return b / 100 + statusValue(u, 'evaUp');
  }
}

// ───────────── 타임라인 ─────────────
/** 대기값 = 1000 / SPD */
export function baseWait(u: Unit): number {
  return 1000 / Math.max(1, stat(u, 'spd'));
}

/** 속도가 바뀌는 상태 변화를 감싸서, 남은 대기값을 새 속도에 비례하게 조정 */
export function withSpeedChange(u: Unit, fn: () => void) {
  const before = baseWait(u);
  fn();
  const after = baseWait(u);
  if (before > 0) u.av = u.av * (after / before);
}

export function pull(u: Unit, frac: number) {
  u.av = Math.max(0, u.av - frac * baseWait(u));
}
export function push(u: Unit, frac: number) {
  u.av = u.av + frac * baseWait(u);
}

/** 다음에 행동할 유닛 (대기값 최소, 동률이면 아군 → 속도 순) */
export function nextActor(s: BattleState): Unit | null {
  const list = aliveOnField(s);
  if (!list.length) return null;
  let best = list[0];
  for (const u of list) {
    if (u.av < best.av - 1e-9) best = u;
    else if (Math.abs(u.av - best.av) < 1e-9) {
      if (u.side === 'ally' && best.side !== 'ally') best = u;
      else if (u.side === best.side && stat(u, 'spd') > stat(best, 'spd')) best = u;
    }
  }
  return best;
}

/** 앞으로 행동할 순서 n칸 미리보기 (현재 행동 유닛 포함) */
export function previewOrder(s: BattleState, n = 8): string[] {
  const list = aliveOnField(s).map((u) => ({ u, av: u.av, w: baseWait(u) }));
  const out: string[] = [];
  if (s.current) {
    const cur = list.find((x) => x.u.uid === s.current);
    if (cur) { out.push(cur.u.uid); cur.av = cur.w; }
  }
  let guard = 0;
  while (out.length < n && list.length && guard++ < 200) {
    let best = list[0];
    for (const x of list) {
      if (x.av < best.av - 1e-9 || (Math.abs(x.av - best.av) < 1e-9 && x.u.side === 'ally' && best.u.side !== 'ally')) best = x;
    }
    const d = best.av;
    for (const x of list) x.av -= d;
    out.push(best.u.uid);
    best.av = best.w;
  }
  return out;
}

// ───────────── 상태이상 ─────────────
const SPEED_STATUSES: StatusId[] = ['haste', 'slow'];
const BOSS_IMMUNE: StatusId[] = ['stun', 'freeze'];

export function applyStatus(
  s: BattleState, target: Unit, id: StatusId, turns: number, value: number, events: BattleEvent[],
  opts: { chance?: number; fresh?: boolean } = {},
): boolean {
  if (!target.alive) return false;
  let p = opts.chance ?? 1;
  if (target.rank === 'boss') {
    if (BOSS_IMMUNE.includes(id)) {
      // 보스는 기절·빙결 대신 행동이 밀린다
      if (chance(s.rng, p)) {
        push(target, 0.4);
        events.push({ t: 'move', uid: target.uid, dir: 'push' });
        events.push({ t: 'text', text: `${target.name}의 행동이 밀렸다!` });
      }
      return false;
    }
    if (id === 'silence') p *= 0.5;
  }
  if (!chance(s.rng, p)) return false;
  const apply = () => {
    const ex = target.statuses.find((x) => x.id === id);
    if (ex) {
      ex.turns = Math.max(ex.turns, turns);
      ex.value = Math.max(ex.value, value);
      ex.fresh = ex.fresh || !!opts.fresh;
    } else {
      target.statuses.push({ id, turns, value, fresh: !!opts.fresh });
    }
  };
  if (SPEED_STATUSES.includes(id)) withSpeedChange(target, apply);
  else apply();
  events.push({ t: 'status', uid: target.uid, status: id, add: true });
  return true;
}

export function removeStatus(target: Unit, id: StatusId, events: BattleEvent[]) {
  if (!hasStatus(target, id)) return;
  const fn = () => { target.statuses = target.statuses.filter((x) => x.id !== id); };
  if (SPEED_STATUSES.includes(id)) withSpeedChange(target, fn);
  else fn();
  events.push({ t: 'status', uid: target.uid, status: id, add: false });
}

export function cleanse(target: Unit, events: BattleEvent[]) {
  for (const st of [...target.statuses]) {
    if (['burn', 'poison', 'stun', 'silence', 'slow', 'atkDown', 'defDown', 'resDown', 'accDown', 'freeze'].includes(st.id)) {
      removeStatus(target, st.id, events);
    }
  }
}

/** 턴 종료 시 지속 시간 감소 */
export function tickDurations(u: Unit, events: BattleEvent[]) {
  for (const st of [...u.statuses]) {
    if (st.fresh) { st.fresh = false; continue; }
    st.turns -= 1;
    if (st.turns <= 0) removeStatus(u, st.id, events);
  }
  if (u.attached) {
    if (u.attached.fresh) u.attached.fresh = false;
    else {
      u.attached.turns -= 1;
      if (u.attached.turns <= 0) {
        u.attached = null;
        events.push({ t: 'attach', uid: u.uid, el: null });
      }
    }
  }
}
