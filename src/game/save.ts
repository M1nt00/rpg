// 저장: localStorage 세이브 슬롯 3개 + JSON 내보내기/불러오기
import { SAVE_VERSION, type GameState } from './state';

const KEY = (n: number) => `elemental-heir/save/${n}`;
const SETTINGS_KEY = 'elemental-heir/settings';
export const SLOT_COUNT = 3;

export interface SlotInfo { slot: number; heroName: string; level: number; region: string; playTime: number; savedAt: number }

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveSlot(gs: GameState, n: number): boolean {
  try {
    gs.savedAt = Date.now();
    storage()?.setItem(KEY(n), JSON.stringify(gs));
    return true;
  } catch {
    return false;
  }
}

export function loadSlot(n: number): GameState | null {
  try {
    const raw = storage()?.getItem(KEY(n));
    return raw ? validate(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function deleteSlot(n: number) {
  try { storage()?.removeItem(KEY(n)); } catch { /* 무시 */ }
}

export function slotInfo(n: number, regionName: (id: string | null) => string): SlotInfo | null {
  const gs = loadSlot(n);
  if (!gs) return null;
  return {
    slot: n, heroName: gs.heroName, level: gs.chars.hero?.level ?? 1,
    region: regionName(gs.location), playTime: gs.playTime, savedAt: gs.savedAt,
  };
}

export function exportJSON(gs: GameState): string {
  return JSON.stringify({ game: '다섯 원소의 계승자', ...gs }, null, 1);
}

export function importJSON(text: string): GameState {
  const obj = JSON.parse(text);
  const gs = validate(obj);
  if (!gs) throw new Error('올바른 세이브 파일이 아니에요.');
  return gs;
}

function validate(o: unknown): GameState | null {
  if (!o || typeof o !== 'object') return null;
  const g = o as Partial<GameState>;
  if (!g.chars || !g.party || !Array.isArray(g.party) || typeof g.gold !== 'number') return null;
  if ((g.version ?? 0) > SAVE_VERSION) return null;
  const gs = g as GameState;
  // 이후 버전에서 추가된 필드 기본값
  gs.shops ??= {};
  gs.analyzed ??= [];
  gs.flags ??= {};
  gs.kills ??= {};
  gs.stats ??= { battles: 0, reactions: 0, breaks: 0, wins: 0 };
  gs.reserve ??= [];
  return gs;
}

export interface Settings { sound: boolean; speed: 1 | 2; }
export function loadSettings(): Settings {
  try {
    const raw = storage()?.getItem(SETTINGS_KEY);
    if (raw) return { sound: true, speed: 1, ...JSON.parse(raw) };
  } catch { /* 무시 */ }
  return { sound: true, speed: 1 };
}
export function saveSettings(s: Settings) {
  try { storage()?.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* 무시 */ }
}
