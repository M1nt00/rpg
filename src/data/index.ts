import type {
  CharacterDef, Element, ElementOrNone, EnemyDef, EventDef, ItemDef, LegendaryDef, QuestDef,
  ReactionId, RegionDef, SceneDef, SkillDef, StatusId,
} from '../types';
import skillsJson from './skills.json';
import charactersJson from './characters.json';
import enemiesJson from './enemies.json';
import itemsJson from './items.json';
import regionsJson from './regions.json';
import eventsJson from './events.json';
import questsJson from './quests.json';
import scenesJson from './scenes.json';

export const SKILLS: SkillDef[] = skillsJson as SkillDef[];
export const CHARACTERS: CharacterDef[] = charactersJson as CharacterDef[];
export const ENEMIES: EnemyDef[] = enemiesJson as EnemyDef[];
export const ITEMS: ItemDef[] = itemsJson.items as ItemDef[];
export const LEGENDARIES: LegendaryDef[] = itemsJson.legendaries as LegendaryDef[];
export const REGIONS: RegionDef[] = regionsJson as RegionDef[];
export const EVENTS: EventDef[] = eventsJson as EventDef[];
export const QUESTS: QuestDef[] = questsJson as QuestDef[];
export const SCENES: Record<string, SceneDef> = scenesJson as Record<string, SceneDef>;

function index<T extends { id: string }>(list: T[], label: string) {
  const map = new Map(list.map((x) => [x.id, x]));
  return (id: string): T => {
    const v = map.get(id);
    if (!v) throw new Error(`알 수 없는 ${label}: ${id}`);
    return v;
  };
}
export const skill = index(SKILLS, '스킬');
export const character = index(CHARACTERS, '캐릭터');
export const enemy = index(ENEMIES, '적');
export const item = index(ITEMS, '아이템');
export const legendary = index(LEGENDARIES, '전설 장비');
export const region = index(REGIONS, '지역');
export const gameEvent = index(EVENTS, '이벤트');
export const quest = index(QUESTS, '퀘스트');

export const ELEMENTS: Element[] = ['fire', 'water', 'wind', 'earth', 'lightning'];
export const ELEMENT_NAME: Record<ElementOrNone, string> = {
  fire: '불', water: '물', wind: '바람', earth: '땅', lightning: '번개', none: '무',
};
export const ELEMENT_COLOR: Record<ElementOrNone, string> = {
  fire: '#ff6b3d', water: '#3fa7ff', wind: '#4fd88a', earth: '#d4a24c', lightning: '#c18cff', none: '#c8c8d0',
};
export const ELEMENT_ICON: Record<ElementOrNone, string> = {
  fire: '火', water: '水', wind: '風', earth: '地', lightning: '雷', none: '無',
};

/** 순환 상성: 물 → 불 → 바람 → 땅 → 번개 → 물 (화살표 방향이 유리) */
export const BEATS: Record<Element, Element> = {
  water: 'fire', fire: 'wind', wind: 'earth', earth: 'lightning', lightning: 'water',
};

export interface ReactionInfo { id: ReactionId; name: string; desc: string; mul: number; color: string }
export const REACTIONS: Record<ReactionId, ReactionInfo> = {
  vaporize:    { id: 'vaporize',    name: '증발',     desc: '이번 공격 피해 2배',               mul: 2.0,  color: '#ff9b6b' },
  electro:     { id: 'electro',     name: '감전',     desc: '적 전체에 추가 피해 30%',           mul: 1.2,  color: '#8fb8ff' },
  firestorm:   { id: 'firestorm',   name: '화염폭풍', desc: '광역 피해 + 화상',                  mul: 1.2,  color: '#ffb347' },
  mud:         { id: 'mud',         name: '진흙',     desc: '적 속도 30% 감소 2턴',              mul: 1.25, color: '#a7825a' },
  overload:    { id: 'overload',    name: '과부하',   desc: '적 방어 40% 감소 2턴',              mul: 1.25, color: '#ff6be0' },
  sandstorm:   { id: 'sandstorm',   name: '모래폭풍', desc: '적 명중 감소 + 아군 회피 증가',     mul: 1.25, color: '#e0c07a' },
  crystallize: { id: 'crystallize', name: '결정화',   desc: '아군 전체 보호막',                  mul: 1.25, color: '#f5e08a' },
  freeze:      { id: 'freeze',      name: '빙결',     desc: '적 1턴 행동 불가 (보스는 행동 밀기)', mul: 1.25, color: '#a8f0ff' },
};

const PAIRS: [Element, Element, ReactionId][] = [
  ['fire', 'water', 'vaporize'],
  ['water', 'lightning', 'electro'],
  ['fire', 'wind', 'firestorm'],
  ['earth', 'water', 'mud'],
  ['lightning', 'fire', 'overload'],
  ['wind', 'earth', 'sandstorm'],
  ['earth', 'lightning', 'crystallize'],
  ['wind', 'water', 'freeze'],
];
export function reactionOf(a: Element, b: Element): ReactionId | null {
  for (const [x, y, r] of PAIRS) if ((x === a && y === b) || (x === b && y === a)) return r;
  return null;
}

export const STATUS_INFO: Record<StatusId, { name: string; good: boolean; icon: string }> = {
  burn: { name: '화상', good: false, icon: '🔥' },
  poison: { name: '중독', good: false, icon: '☠' },
  stun: { name: '기절', good: false, icon: '✦' },
  silence: { name: '침묵', good: false, icon: '✕' },
  slow: { name: '둔화', good: false, icon: '▼' },
  haste: { name: '가속', good: true, icon: '▲' },
  atkUp: { name: '공격↑', good: true, icon: '⚔' },
  atkDown: { name: '공격↓', good: false, icon: '⚔' },
  magUp: { name: '마력↑', good: true, icon: '✧' },
  defUp: { name: '방어↑', good: true, icon: '⛨' },
  defDown: { name: '방어↓', good: false, icon: '⛨' },
  resUp: { name: '마방↑', good: true, icon: '◈' },
  resDown: { name: '마방↓', good: false, icon: '◈' },
  accDown: { name: '명중↓', good: false, icon: '◎' },
  evaUp: { name: '회피↑', good: true, icon: '≋' },
  taunt: { name: '도발', good: true, icon: '!' },
  regen: { name: '재생', good: true, icon: '✚' },
  counter: { name: '반격', good: true, icon: '↺' },
  freeze: { name: '빙결', good: false, icon: '❄' },
  reactionUp: { name: '공명', good: true, icon: '✺' },
};

export const STAT_NAME: Record<string, string> = {
  hp: 'HP', mp: 'MP', atk: '공격', mag: '마력', def: '방어', res: '마방', spd: '속도', crt: '치명',
  atkPct: '공격%', magPct: '마력%', defPct: '방어%', resPct: '마방%', hpPct: 'HP%', mpPct: 'MP%', reactionPct: '반응 피해%',
  eva: '회피',
};

export const RARITY_NAME = { common: '일반', rare: '희귀', epic: '영웅', legendary: '전설' } as const;
export const RARITY_COLOR = { common: '#c9c9c9', rare: '#5aa9ff', epic: '#c77dff', legendary: '#ffb340' } as const;
