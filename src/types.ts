// ───────────────────────── 공통 타입 ─────────────────────────
export type Element = 'fire' | 'water' | 'wind' | 'earth' | 'lightning';
export type ElementOrNone = Element | 'none';
export type Side = 'ally' | 'enemy';

export type StatKey = 'hp' | 'mp' | 'atk' | 'mag' | 'def' | 'res' | 'spd' | 'crt';
export type Stats = Record<StatKey, number>;

export type ReactionId =
  | 'vaporize' | 'electro' | 'firestorm' | 'mud'
  | 'overload' | 'sandstorm' | 'crystallize' | 'freeze';

export type StatusId =
  | 'burn' | 'poison' | 'stun' | 'silence' | 'slow' | 'haste'
  | 'atkUp' | 'atkDown' | 'magUp' | 'defUp' | 'defDown' | 'resUp' | 'resDown'
  | 'accDown' | 'evaUp' | 'taunt' | 'regen' | 'counter' | 'freeze' | 'reactionUp';

// ───────────────────────── 스킬 ─────────────────────────
export type SkillTarget =
  | 'single_enemy' | 'all_enemies' | 'random_enemies'
  | 'single_ally' | 'all_allies' | 'self' | 'dead_ally' | 'all_dead_allies';

export interface EffectDef {
  status: StatusId;
  turns: number;
  value?: number;      // 비율(0.3=30%) 혹은 고정값
  chance?: number;     // 0~1, 기본 1
  to?: 'target' | 'self' | 'allies' | 'enemies'; // 기본 target
}

export interface SkillDef {
  id: string;
  name: string;
  desc: string;
  owner?: string;          // 캐릭터 id 또는 'enemy'
  mp: number;
  type: 'physical' | 'magic' | 'support';
  /** self = 사용자 현재 원소, weapon = 무기 원소 */
  element: ElementOrNone | 'self' | 'weapon';
  power: number;           // 피해 배율 (0이면 피해 없음)
  target: SkillTarget;
  hits?: number;
  applyElement?: boolean;
  breakDamage?: number;
  critBonus?: number;      // 치명 확률 추가 (0.3 = +30%p)
  effects?: EffectDef[];
  heal?: number;           // MAG 배율 회복
  healPct?: number;        // 최대 HP 비율 회복
  shield?: number;         // 보호막 = 배율 × (MAG 또는 DEF 중 큰 값)
  shieldPct?: number;      // 최대 HP 비율 보호막
  revive?: number;         // 부활 시 HP 비율
  cleanse?: boolean;
  mpRestore?: number;
  pull?: number;           // 행동 당기기 (대기값의 비율)
  push?: number;           // 행동 밀기
  pushSelf?: number;
  lifesteal?: number;
  missingHpBonus?: number; // 잃은 HP 비율 × 이 값만큼 배율 추가
  free?: boolean;          // 턴 소모 없음
  telegraph?: boolean;     // 1턴 전 예고
  summon?: string[];
  mimic?: boolean;         // 마지막 아군 반응 따라하기
  analyze?: boolean;
  cycleElements?: boolean; // 타격마다 해방한 원소를 순환
}

// ───────────────────────── 캐릭터 ─────────────────────────
export type WeaponType = 'sword' | 'staff' | 'bow' | 'axe';

export interface PassiveDef {
  pct?: Partial<Record<'hp' | 'mp' | 'atk' | 'mag' | 'def' | 'res' | 'spd', number>>;
  flat?: Partial<Record<'crt' | 'eva', number>>;
  special?: Record<string, number>;
}

export interface TreeNode {
  id: string;
  name: string;
  cost: number;
  kind: 'skill' | 'passive';
  skill?: string;
  passive?: PassiveDef;
  desc: string;
  ultimate?: boolean;
}

export interface Branch {
  name: string;
  nodes: TreeNode[];
}

export interface CharacterDef {
  id: string;
  name: string;
  job: string;
  element: ElementOrNone;      // 주인공은 none (해방 원소로 전환)
  role: string;
  attackType: 'physical' | 'magic';
  weaponType: WeaponType;
  base: Stats;
  growth: Stats;
  innate: string[];
  tree: Branch[];
  color: string;
  glyph: string;
  bio: string;
  startEquip: { weapon?: string; armor?: string };
}

// ───────────────────────── 적 ─────────────────────────
export interface AiCond {
  selfHpBelow?: number;
  selfHpAbove?: number;
  turnEvery?: number;     // 행동 횟수가 n의 배수
  noShield?: boolean;
  allyHpBelow?: number;   // 같은 편 누군가의 HP 비율
  summonsBelow?: number;  // 같은 편 수가 n 미만
  minTurn?: number;
}

export type TargetRule = 'random' | 'lowestHp' | 'attached' | 'highestAtk' | 'mage';

export interface AiRule {
  action: string;
  weight: number;
  cond?: AiCond;
  target?: TargetRule;
}

export interface PhaseDef {
  hpBelow: number;
  element?: Element;
  weakness?: Element[];
  ai?: AiRule[];
  message?: string;
  onEnter?: string;
  actionsPerTurn?: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  region: number;
  element: ElementOrNone;
  weakness: Element[];
  level: number;
  rank: 'normal' | 'elite' | 'boss' | 'summon';
  stats: Omit<Stats, 'mp' | 'crt'>;
  breakGauge: number;
  exp: number;
  gold: number;
  drops: { item: string; chance: number }[];
  ai: AiRule[];
  phases?: PhaseDef[];
  actionsPerTurn?: number;
  reactionImmune?: boolean;
  shape: string;
  desc: string;
  legendary?: string;
}

// ───────────────────────── 아이템/장비 ─────────────────────────
export type ItemKind = 'consumable' | 'material' | 'key';

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  desc: string;
  price: number;
  /** consumable 효과 */
  use?: {
    target: 'ally' | 'dead_ally' | 'enemy';
    heal?: number; healPct?: number; mp?: number;
    cleanse?: boolean; revive?: number;
    element?: Element; damage?: number;
  };
  battleOnly?: boolean;
}

export type EquipSlot = 'weapon' | 'armor' | 'accessory';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type OptionStat =
  | 'atkPct' | 'magPct' | 'defPct' | 'resPct' | 'hpPct' | 'mpPct' | 'spd' | 'crt' | 'reactionPct';

export interface EquipOption { stat: OptionStat; value: number }

export interface LegendaryDef {
  id: string;
  name: string;
  slot: EquipSlot;
  weaponType?: WeaponType;
  element?: Element;
  tier: number;
  stats: Partial<Stats>;
  options: EquipOption[];
  unique: { key: string; value: number; desc: string };
}

export interface Equipment {
  uid: string;
  name: string;
  slot: EquipSlot;
  weaponType?: WeaponType;
  rarity: Rarity;
  tier: number;
  element?: Element;
  stats: Partial<Stats>;
  options: EquipOption[];
  unique?: { key: string; value: number; desc: string };
  plus: number;
  legendaryId?: string;
}

// ───────────────────────── 지역/맵 ─────────────────────────
export type NodeType = 'start' | 'battle' | 'elite' | 'chest' | 'event' | 'rest' | 'town' | 'boss';

export interface MapNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  links: string[];
  encounter?: string[];
  chest?: { gold?: number; items?: { id: string; n: number }[]; equip?: Rarity };
  event?: string;
  label?: string;
}

export interface RegionDef {
  id: string;
  index: number;
  name: string;
  element: ElementOrNone;
  mood: string;
  town?: string;
  ally?: string;
  material?: string;
  levelRange: [number, number];
  pool: string[];          // 수련 전투용 몹
  nodes: MapNode[];
  introScene: string;
  bossPreScene: string;
  bossPostScene: string;
  color: string;
  wx: number; wy: number;  // 월드맵 위치
}

// ───────────────────────── 이벤트/퀘스트/스토리 ─────────────────────────
export interface EventOutcome {
  chance?: number;
  text: string;
  gold?: number;
  exp?: number;
  items?: { id: string; n: number }[];
  equip?: Rarity;
  hpPct?: number;    // 파티 전체 HP 변화 (최대 HP 비율, 음수 가능)
  mpPct?: number;
  battle?: string[];
  flag?: string;
}

export interface EventChoice {
  label: string;
  cost?: { gold?: number; item?: string };
  outcomes: EventOutcome[];
}

export interface EventDef {
  id: string;
  title: string;
  text: string;
  choices: EventChoice[];
}

export interface QuestDef {
  id: string;
  region: number;
  kind: 'main' | 'kill' | 'collect' | 'deliver' | 'companion';
  name: string;
  giver: string;
  desc: string;
  target: { enemy?: string; count?: number; item?: string; node?: string; regionId?: string };
  giveItem?: string;
  reward: { gold?: number; exp?: number; items?: { id: string; n: number }[]; legendary?: string; equip?: Rarity };
  auto?: boolean;          // 동료 합류 시 자동 수락
  requiresAlly?: string;
}

export interface SceneLine { speaker?: string; text: string; color?: string }
export type SceneDef = SceneLine[];
