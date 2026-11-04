// 게임 흐름: 월드맵 · 지역 맵 · 노드 처리 · 전투 실행 · 보상
import type { MapNode, RegionDef } from '../types';
import { ELEMENT_COLOR, ELEMENT_NAME, REGIONS, enemy as enemyDef, gameEvent, item as itemDef, region as regionDef, character } from '../data';
import { add, alertBox, choiceBox, h, modal, toast } from '../core/dom';
import { sfx } from '../core/audio';
import { createBattle } from '../battle/engine';
import { newGame, partyUnits, healAll, type GameState } from '../game/state';
import {
  applyOutcome, canAfford, canMoveTo, checkDeliveries, checkMapReward, enterRegion, grantBattleRewards,
  isResolved, liberate, mapCompletion, markVisited, openChest, progress, resolveEvent, writeBack, type Rewards,
} from '../game/world';
import { loadSlot } from '../game/save';
import { app, gs, setScreen, startClock, type HudActions } from './app';
import { playScene } from './dialog';
import { battleScreen } from './battle';
import { elBadge, equipTitle, rarityTag, charName } from './common';
import { enemySvg } from './art';
import { openTown } from './town';
import { openParty } from './party';
import { openInventory } from './inventory';
import { openMenu, openQuestLog, saveDialog, titleScreen } from './menus';

// ───────────── 내비게이션 ─────────────
let current: { kind: 'world' } | { kind: 'region'; rid: string } = { kind: 'world' };
/** 불러오기·타이틀 이동이 일어나면 증가 — 진행 중이던 노드 처리를 중단시킨다 */
let epoch = 0;
const stale = (e: number) => e !== epoch || !app.gs;

export function refresh() {
  if (current.kind === 'world') goWorld();
  else goRegion(current.rid);
}

export function hudActions(): HudActions {
  return {
    party: () => openParty(refresh),
    bag: () => openInventory(refresh),
    quests: () => openQuestLog(() => {}),
    world: current.kind === 'region' ? () => goWorld() : null,
    menu: () => openMenu(),
  };
}

// ───────────── 시작 ─────────────
export async function startNewGame(name: string, slot: number) {
  app.gs = newGame(name);
  app.slot = slot;
  startClock();
  await playScene('prologue');
  await enterAndShow('r1');
}

export function continueGame(g: GameState, slot: number) {
  epoch++;
  app.gs = g;
  app.slot = slot;
  startClock();
  if (g.location) goRegion(g.location);
  else goWorld();
}

async function enterAndShow(rid: string) {
  const g = gs();
  const r = regionDef(rid);
  const had = new Set(Object.keys(g.chars));
  const { firstTime } = enterRegion(g, rid);
  if (firstTime) {
    await playScene(r.introScene);
    for (const id of Object.keys(g.chars)) if (!had.has(id)) toast(`${character(id).name} 합류!`, 'good');
  }
  goRegion(rid);
}

// ───────────── 월드맵 ─────────────
export function goWorld() {
  const g = gs();
  current = { kind: 'world' };
  g.location = null;
  const info = h('div', { class: 'world-info card' }, h('p', { class: 'muted' }, '지역을 골라 이동하세요.'));
  const W = 1000, H = 620;
  const pts = REGIONS.map((r) => ({ r, x: (r.wx / 100) * W, y: (r.wy / 100) * H }));
  const ord = [...pts].sort((a, b) => a.r.index - b.r.index);
  const paths = ord.slice(0, 5).map((p, i) => {
    const q = ord[i + 1];
    const open = g.unlocked >= q.r.index;
    return `<path d="M${p.x} ${p.y} Q${(p.x + q.x) / 2} ${(p.y + q.y) / 2 - 60} ${q.x} ${q.y}" class="wpath ${open ? 'open' : ''}"/>`;
  }).join('');
  const nodes = pts.map(({ r, x, y }) => {
    const open = g.unlocked >= r.index;
    const freed = r.element !== 'none' ? g.liberated.includes(r.element) : g.cleared;
    const c = r.element === 'none' ? '#9a9aa8' : ELEMENT_COLOR[r.element];
    return `<g class="wnode ${open ? 'open' : 'locked'} ${freed ? 'freed' : ''}" data-rid="${r.id}" transform="translate(${x} ${y})" tabindex="${open ? 0 : -1}" role="button" aria-label="${r.name}">
      <circle r="40" class="halo" style="--c:${c}"/><circle r="30" fill="${open ? c : '#444'}" stroke="#fff3" stroke-width="3"/>
      <text y="9" text-anchor="middle" class="wglyph">${open ? (freed ? '✓' : r.index) : '🔒'}</text>
      <text y="62" text-anchor="middle" class="wlabel">${r.name}</text></g>`;
  }).join('');
  const map = h('div', { class: 'world-map', html: `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    <defs><radialGradient id="sea" cx=".5" cy=".5" r=".7"><stop offset="0" stop-color="#2a3550"/><stop offset="1" stop-color="#121826"/></radialGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#sea)" rx="18"/>
    <path d="M80 520 C40 380 120 220 260 160 C380 60 560 40 700 90 C860 140 960 300 920 450 C880 580 700 610 520 590 C340 600 160 640 80 520Z" fill="#2f3a2c" stroke="#4b5a40" stroke-width="4"/>
    <path d="M160 470 C140 380 220 300 320 260 C420 200 560 170 660 210 C780 250 860 340 830 430 C800 520 660 560 520 540 C380 560 200 560 160 470Z" fill="#3a4733" opacity=".7"/>
    ${paths}${nodes}</svg>` });
  map.querySelectorAll<SVGGElement>('.wnode').forEach((n) => {
    const r = regionDef(n.dataset.rid!);
    const show = () => showWorldInfo(info, r);
    n.addEventListener('click', show);
    n.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') show(); });
  });
  const lib = h('div', { class: 'lib-row' }, '해방한 원소: ',
    g.liberated.length ? g.liberated.map((e) => elBadge(e, { label: true })) : h('span', { class: 'muted' }, '아직 없음'));
  setScreen(h('main', { class: 'world' }, h('h1', { class: 'page-title' }, '대륙 아르케아'), lib, map, info), { hud: hudActions() });
}

function showWorldInfo(box: HTMLElement, r: RegionDef) {
  const g = gs();
  const open = g.unlocked >= r.index;
  const freed = r.element !== 'none' ? g.liberated.includes(r.element) : g.cleared;
  box.innerHTML = '';
  add(box,
    h('h2', null, r.name, ' ', r.element !== 'none' ? elBadge(r.element, { label: true }) : h('span', { class: 'chip' }, '전 원소')),
    h('p', { class: 'muted' }, r.mood, ` · 권장 Lv ${r.levelRange[0]}~${r.levelRange[1]}`),
    h('p', null, open ? (freed ? '신전 해방 완료' : '신전이 침묵하고 있다…') : '아직 갈 수 없는 지역이에요. 앞 지역의 신전을 해방하세요.'),
    open ? h('button', { class: 'btn primary', onclick: () => { sfx('click'); void enterAndShow(r.id); } }, `${r.name}(으)로 이동`) : null,
  );
}

// ───────────── 지역 맵 ─────────────
const NODE_ICON: Record<string, string> = { town: '⌂', battle: '⚔', elite: '☠', chest: '▣', event: '?', rest: '☾', boss: '♛', start: '⛺' };
const NODE_NAME: Record<string, string> = { town: '마을', battle: '전투', elite: '엘리트', chest: '상자', event: '이벤트', rest: '휴식처', boss: '신전 (보스)', start: '야영지' };

export function goRegion(rid: string) {
  const g = gs();
  current = { kind: 'region', rid };
  g.location = rid;
  const r = regionDef(rid);
  const p = progress(g, rid);
  const W = 800, H = 470;
  const pos = (n: MapNode) => ({ x: 60 + n.x * 97, y: 55 + n.y * 90 });
  const lines = r.nodes.flatMap((n) => n.links.filter((l) => l > n.id).map((l) => {
    const m = r.nodes.find((x) => x.id === l)!;
    const a = pos(n), b = pos(m);
    const known = p.visited.includes(n.id) || p.visited.includes(m.id);
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="mline ${known ? 'known' : ''}"/>`;
  })).join('');
  const nodes = r.nodes.map((n) => {
    const { x, y } = pos(n);
    const visited = p.visited.includes(n.id);
    const reach = canMoveTo(g, rid, n.id);
    const resolved = isResolved(g, rid, n);
    const cls = ['mnode', n.type, visited ? 'visited' : '', reach ? 'reach' : 'locked', p.current === n.id ? 'here' : '', resolved ? 'resolved' : ''].join(' ');
    return `<g class="${cls}" data-nid="${n.id}" transform="translate(${x} ${y})" tabindex="${reach ? 0 : -1}" role="button" aria-label="${NODE_NAME[n.type]}">
      ${p.current === n.id ? '<circle r="34" class="here-ring"/>' : ''}
      <circle r="${n.type === 'boss' ? 30 : 24}" class="nbody"/>
      <text y="8" text-anchor="middle" class="nicon">${NODE_ICON[n.type]}</text>
      ${n.label ? `<text y="${n.type === 'boss' ? 50 : 44}" text-anchor="middle" class="nlabel">${n.label}</text>` : ''}
      ${(n.type === 'battle' || n.type === 'elite') && !visited ? `<text y="-30" text-anchor="middle" class="ncount">${'●'.repeat(n.encounter!.length)}</text>` : ''}</g>`;
  }).join('');
  const info = h('div', { class: 'node-info card' });
  const map = h('div', { class: 'region-map', style: `--rc:${r.color}`, html: `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    <rect width="${W}" height="${H}" rx="16" class="rbg"/>${lines}${nodes}</svg>` });
  map.querySelectorAll<SVGGElement>('.mnode').forEach((el) => {
    const n = r.nodes.find((x) => x.id === el.dataset.nid)!;
    const show = () => showNodeInfo(info, rid, n);
    el.addEventListener('click', show);
    el.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') show(); });
  });
  const comp = mapCompletion(g, rid);
  const head = h('div', { class: 'region-head' },
    h('div', null, h('h1', { class: 'page-title' }, r.name, ' ', r.element !== 'none' ? elBadge(r.element) : null),
      h('div', { class: 'muted' }, `${r.mood} · 권장 Lv ${r.levelRange[0]}~${r.levelRange[1]}`)),
    h('div', { class: 'region-stats' },
      h('span', { class: 'chip' }, `탐험 ${comp.visited}/${comp.total}`),
      p.mapReward ? h('span', { class: 'chip good' }, '지도 완성') : null));
  const partyMini = h('div', { class: 'party-mini' }, g.party.map((id) => {
    const cs = g.chars[id];
    return h('div', { class: 'pm' + (cs.hp <= 0 ? ' dead' : '') }, h('b', null, charName(g, id)), h('span', null, ` Lv${cs.level}`),
      h('div', { class: 'bar hp thin' }, h('div', { class: 'bar-fill', style: `width:${Math.max(0, (cs.hp / partyMaxHp(g, id)) * 100)}%` })));
  }));
  setScreen(h('main', { class: 'region' }, head, partyMini, map, info), { hud: hudActions() });
  showNodeInfo(info, rid, r.nodes.find((x) => x.id === p.current)!);
}

function partyMaxHp(g: GameState, id: string) {
  return partyUnits(g).find((u) => u.defId === id)?.maxHp ?? 1;
}

function enemyList(ids: string[]) {
  const g = gs();
  return h('div', { class: 'enemy-list' }, ids.map((id) => {
    const d = enemyDef(id);
    const known = g.analyzed.includes(id);
    return h('div', { class: 'el-row' },
      h('div', { class: 'mini-sprite', html: enemySvg(d.shape, d.element) }),
      h('div', null, h('b', null, d.name), h('span', { class: 'muted' }, ` Lv${d.level}`), h('br'),
        h('span', { class: 'small' }, '원소 ', elBadge(d.element, { small: true }), ' · 약점 ',
          known ? (d.weakness.length ? d.weakness.map((w) => elBadge(w, { small: true })) : '없음') : '?')));
  }));
}

function showNodeInfo(box: HTMLElement, rid: string, n: MapNode) {
  const g = gs();
  const p = progress(g, rid);
  const reach = canMoveTo(g, rid, n.id);
  const resolved = isResolved(g, rid, n);
  box.innerHTML = '';
  const title = h('h2', null, NODE_ICON[n.type], ' ', n.label ?? NODE_NAME[n.type]);
  const parts: (Node | null)[] = [title];
  if ((n.type === 'battle' || n.type === 'elite' || n.type === 'boss') && n.encounter) {
    parts.push(h('p', { class: 'muted' }, resolved ? '이미 정리한 곳이에요.' : n.type === 'boss' ? '신전을 지키는 보스가 있다.' : '적이 길을 막고 있다. 다른 길로 돌아갈 수도 있어요.'));
    if (!resolved || n.type !== 'boss') parts.push(resolved ? null : enemyList(n.encounter));
  } else if (n.type === 'chest') parts.push(h('p', { class: 'muted' }, resolved ? '빈 상자.' : '보물 상자가 있다.'));
  else if (n.type === 'event') parts.push(h('p', { class: 'muted' }, resolved ? '이미 지나간 곳.' : '무언가 일어날 것 같은 곳.'));
  else if (n.type === 'rest' || n.type === 'start') parts.push(h('p', { class: 'muted' }, 'HP·MP를 회복하고 저장할 수 있어요. 수련 전투로 경험치를 모을 수도 있어요.'));
  else if (n.type === 'town') parts.push(h('p', { class: 'muted' }, '상점 · 대장간 · 여관 · 퀘스트 게시판'));
  const here = p.current === n.id;
  const label = here ? (n.type === 'town' ? '마을 들어가기' : n.type === 'rest' || n.type === 'start' ? '쉬기' : null)
    : !reach ? null : (n.type === 'battle' || n.type === 'elite') && !resolved ? '이동 (전투)' : n.type === 'boss' && !resolved ? '신전에 들어간다' : '이동';
  if (label) parts.push(h('button', { class: 'btn primary', onclick: () => { sfx('click'); void onNode(rid, n); } }, label));
  else if (!reach) parts.push(h('p', { class: 'muted small' }, '아직 갈 수 없어요. 연결된 지점부터 탐험하세요.'));
  box.append(...parts.filter(Boolean) as Node[]);
}

// ───────────── 노드 처리 ─────────────
async function onNode(rid: string, n: MapNode) {
  if (app.busy) return;
  app.busy = true;
  try { await handleNode(rid, n); } finally { app.busy = false; }
}

async function handleNode(rid: string, n: MapNode) {
  const ep = epoch;
  let g = gs();
  if (!canMoveTo(g, rid, n.id)) return;
  const r = regionDef(rid);
  const resolved = isResolved(g, rid, n);

  if ((n.type === 'battle' || n.type === 'elite') && !resolved) {
    const res = await fight(n.encounter!, { title: n.type === 'elite' ? '엘리트 전투' : r.name, theme: `theme-${r.id}` });
    if (stale(ep)) return;
    if (res !== 'win') { goRegion(rid); return; }
    g = gs();
    markVisited(g, rid, n.id);
  } else if (n.type === 'boss' && !resolved) {
    await playScene(r.bossPreScene);
    const res = await fight(n.encounter!, { title: `${n.label ?? '신전'} · 보스`, theme: `theme-${r.id} boss`, isBoss: true });
    if (stale(ep)) return;
    if (res !== 'win') { goRegion(rid); return; }
    g = gs();
    markVisited(g, rid, n.id);
    const lib = liberate(g, rid);
    goRegion(rid);
    if (r.index === 6) {
      await playScene('ending');
      await credits();
      return;
    }
    await playScene(r.bossPostScene);
    const next = REGIONS.find((x) => x.index === r.index + 1);
    await alertBox('신전 해방!', [
      lib.element ? h('p', null, elBadge(lib.element, { label: true }), ` ${ELEMENT_NAME[lib.element]}의 원소를 해방했다! 주인공이 원소 전환으로 쓸 수 있어요.`) : null,
      next ? h('p', null, `새 지역 「${next.name}」이(가) 열렸어요. 월드맵에서 이동하세요.`) : null,
      h('p', { class: 'muted' }, '파티의 HP·MP가 모두 회복되었어요.'),
    ]);
    if (await choiceBox('저장', '여기서 저장할까요?', [{ label: '저장하기', value: true, primary: true }, { label: '나중에', value: false }])) await saveDialog();
  } else {
    markVisited(g, rid, n.id);
  }

  g = gs();
  for (const q of checkDeliveries(g, n.id)) toast(`퀘스트 「${q}」 완료! 퀘스트 목록에서 보상을 받으세요.`, 'good');

  if (n.type === 'chest' && !resolved) {
    sfx('open');
    const lines = openChest(g, rid, n);
    await alertBox('보물 상자', lines.map((l) => h('div', null, '· ', l)));
  } else if (n.type === 'event' && !resolved) {
    await runEvent(rid, n);
    if (stale(ep)) return;
  } else if (n.type === 'rest' || n.type === 'start') {
    await restMenu(rid);
    if (stale(ep)) return;
  } else if (n.type === 'town') {
    const reward = checkMapReward(g, rid);
    if (reward) toast(reward, 'good');
    openTown(rid, () => goRegion(rid));
    return;
  }
  g = gs();
  const reward = checkMapReward(g, rid);
  if (reward) { sfx('levelup'); await alertBox('지도 완성!', reward); }
  goRegion(rid);
}

async function runEvent(rid: string, n: MapNode) {
  const ev = gameEvent(n.event!);
  const g = gs();
  const choice = await choiceBox(ev.title, h('p', null, ev.text), ev.choices.map((c, i) => ({
    label: c.label, value: i, disabled: !canAfford(g, c.cost),
  })), false);
  if (choice === null) return;
  const res = resolveEvent(g, ev, choice, rid);
  if (res.battle) {
    await alertBox(ev.title, res.outcome.text);
    const r = await fight(res.battle, { title: ev.title, theme: `theme-${rid}` });
    if (r !== 'win') return;
    const g2 = gs();
    const lines = applyOutcome(g2, res.outcome, regionDef(rid).index);
    progress(g2, rid).done.push(n.id);
    if (lines.length) await alertBox('봉인 보상', lines.map((l) => h('div', null, '· ', l)));
    return;
  }
  progress(g, rid).done.push(n.id);
  await alertBox(ev.title, [h('p', null, res.outcome.text), ...res.lines.map((l) => h('div', { class: 'good' }, '· ', l))]);
}

async function restMenu(rid: string) {
  for (;;) {
    const g = gs();
    const v = await choiceBox('휴식처', h('p', null, '모닥불 곁에서 숨을 고른다.'), [
      { label: '쉬기 (HP·MP 회복)', value: 'rest', primary: true },
      { label: '저장하기', value: 'save' },
      { label: '수련 전투 (주변의 적과 싸운다)', value: 'train' },
      { label: '떠나기', value: 'leave' },
    ]);
    if (v === 'rest') { healAll(g); sfx('heal'); toast('파티가 완전히 회복되었다.', 'good'); }
    else if (v === 'save') await saveDialog();
    else if (v === 'train') {
      const r = regionDef(rid);
      const pool = r.pool;
      const n = Math.min(4, 1 + Math.floor(Math.random() * Math.min(4, g.party.length + 1)));
      const enemies = Array.from({ length: n }, () => pool[Math.floor(Math.random() * pool.length)]);
      const ep = epoch;
      await fight(enemies, { title: '수련 전투', theme: `theme-${rid}` });
      if (stale(ep)) return;
      goRegion(rid);
    } else return;
  }
}

// ───────────── 전투 실행 ─────────────
export async function fight(enemies: string[], opts: { title?: string; theme?: string; isBoss?: boolean; canFlee?: boolean } = {}): Promise<'win' | 'lose' | 'fled'> {
  const snapshot = JSON.stringify(gs());
  for (;;) {
    const g = gs();
    g.stats.battles += 1;
    const s = createBattle({
      allies: partyUnits(g), enemies, liberated: [...g.liberated], analyzed: g.analyzed,
      isBoss: opts.isBoss, canFlee: opts.canFlee ?? !opts.isBoss,
    });
    const res = await battleScreen(s, g, { title: opts.title, theme: opts.theme });
    if (res === 'win') {
      writeBack(g, s, true);
      const rw = grantBattleRewards(g, s);
      await rewardsModal(rw);
      return 'win';
    }
    if (res === 'fled') { writeBack(g, s, false); return 'fled'; }
    const v = await choiceBox('패배…', h('p', null, '파티가 전멸했다.'), [
      { label: '다시 도전 (전투 직전으로)', value: 'retry', primary: true },
      { label: '마지막 저장에서 불러오기', value: 'load' },
      { label: '타이틀로', value: 'title' },
    ], false);
    if (v === 'retry') { app.gs = JSON.parse(snapshot); continue; }
    if (v === 'load') {
      const saved = loadSlot(app.slot);
      if (saved) { continueGame(saved, app.slot); return 'lose'; }
      toast('저장 데이터가 없어 전투 직전으로 돌아가요.', 'warn');
      app.gs = JSON.parse(snapshot);
      continue;
    }
    epoch++;
    app.gs = null;
    titleScreen();
    return 'lose';
  }
}

async function rewardsModal(rw: Rewards) {
  const g = gs();
  if (rw.levelUps.length) sfx('levelup'); else sfx('coin');
  await alertBox('승리!', [
    h('div', { class: 'reward-row' }, h('span', null, `경험치 +${rw.exp}`), h('span', { class: 'gold' }, `◆ +${rw.gold}`)),
    rw.items.length ? h('div', { class: 'reward-items' }, rw.items.map((i) => h('span', { class: 'chip' }, `${itemDef(i.id).name} ×${i.n}`))) : null,
    rw.equips.length ? h('div', { class: 'reward-equips' }, rw.equips.map((e) => h('div', null, '장비: ', equipTitle(e), ' ', rarityTag(e)))) : null,
    rw.levelUps.map((l) => h('div', { class: 'levelup' }, `★ ${charName(g, l.id)} 레벨 업! Lv${l.from} → Lv${l.to} (SP +${l.to - l.from})`)),
    rw.quests.map((q) => h('div', { class: 'good' }, `퀘스트 「${q}」 달성! 퀘스트 목록에서 보상을 받으세요.`)),
  ], '계속');
}

async function credits() {
  const g = gs();
  await new Promise<void>((res) => {
    const m = modal('다섯 원소의 계승자 — 클리어!', [
      h('div', { class: 'credits' },
        h('p', null, `${g.heroName}와 동료들은 다섯 신전을 모두 해방하고 공허를 걷어냈다.`),
        h('p', { class: 'muted' }, `플레이 시간 ${Math.floor(g.playTime / 60)}분 · 전투 ${g.stats.battles}회 · 원소 반응 ${g.stats.reactions}회 · 브레이크 ${g.stats.breaks}회`),
        h('p', null, '클리어 데이터를 저장하면 계속 탐험할 수 있어요.')),
      h('div', { class: 'row end' },
        h('button', { class: 'btn', onclick: () => { m.close(); } }, '닫기')),
    ], { onClose: () => res(), closable: false });
  });
  await saveDialog();
  goWorld();
}
