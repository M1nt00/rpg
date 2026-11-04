// 전투 화면: 타임라인 · 전장 · 행동 메뉴 · 연출
import type { Element, ItemDef, SkillDef } from '../types';
import {
  ELEMENT_COLOR, ELEMENT_NAME, ITEMS, REACTIONS, STATUS_INFO, skill as skillDef, item as itemDef,
} from '../data';
import { h, clear, sleep, svg, toast } from '../core/dom';
import { sfx } from '../core/audio';
import {
  aliveOnField, byUid, previewOrder, reserves, sideAlive, type BattleEvent, type BattleState, type Unit,
} from '../battle/core';
import {
  beginTurn, canUseSkill, enemyTurn, playerAction, previewHit, type PlayerAction,
} from '../battle/engine';
import { enemySvg, portraitSvg } from './art';
import { bar, elBadge, setBar } from './common';
import { app } from './app';
import type { GameState } from '../game/state';
import { addItem } from '../game/world';

type Result = 'win' | 'lose' | 'fled';

interface Card { root: HTMLElement; fx: HTMLElement }

export async function battleScreen(s: BattleState, g: GameState, opts: { title?: string; theme?: string } = {}): Promise<Result> {
  const speed = () => (app.settings.speed === 2 ? 0.5 : 1);
  const wait = (ms: number) => sleep(ms * speed());

  // ───── DOM 골격 ─────
  const timeline = h('div', { class: 'bt-timeline', 'aria-label': '행동 순서' });
  const enemyRow = h('div', { class: 'bt-enemies' });
  const allyRow = h('div', { class: 'bt-allies' });
  const banner = h('div', { class: 'bt-banner' });
  const actionName = h('div', { class: 'bt-action-name' });
  const field = h('div', { class: 'bt-field' }, enemyRow, banner, actionName, allyRow);
  const partyPanel = h('div', { class: 'bt-party' });
  const cmd = h('div', { class: 'bt-cmd' });
  const hint = h('div', { class: 'bt-hint' });
  const log = h('div', { class: 'bt-log', 'aria-live': 'polite' });
  const root = h('div', { class: 'battle ' + (opts.theme ?? '') },
    h('div', { class: 'bt-top' }, h('div', { class: 'bt-title' }, opts.title ?? '전투'), timeline),
    field,
    h('div', { class: 'bt-bottom' }, partyPanel, h('div', { class: 'bt-cmd-wrap' }, hint, cmd)),
    log);

  const screenEl = document.getElementById('screen')!;
  clear(screenEl);
  screenEl.className = 'screen battle-screen';
  screenEl.appendChild(root);

  const cards = new Map<string, Card>();
  let selecting: { valid: Set<string>; onPick: (uid: string) => void; preview?: (u: Unit) => string } | null = null;
  let armed: string | null = null;

  function logLine(t: string) {
    const ln = h('div', null, t);
    log.prepend(ln);
    while (log.childNodes.length > 4) log.lastChild?.remove();
  }

  // ───── 카드 ─────
  function buildCards() {
    clear(enemyRow); clear(allyRow); cards.clear();
    for (const u of s.units.filter((x) => x.active)) {
      const fx = h('div', { class: 'fx' });
      let root: HTMLElement;
      if (u.side === 'enemy') {
        root = h('div', { class: `unit enemy rank-${u.rank}`, dataset: { uid: u.uid } },
          h('div', { class: 'tele' }),
          h('div', { class: 'sprite' }, svg(enemySvg(u.shape, u.element)), h('div', { class: 'attached' }), h('div', { class: 'broken-mark' }, 'BREAK')),
          h('div', { class: 'uname' }, u.name, h('span', { class: 'lv' }, ` Lv${u.level}`)),
          bar(u.hp, u.maxHp, 'hp'),
          h('div', { class: 'shield-line' }),
          h('div', { class: 'break-pips' }),
          h('div', { class: 'weak-line' }),
          h('div', { class: 'statuses' }),
          fx);
      } else {
        root = h('div', { class: 'unit ally', dataset: { uid: u.uid } },
          h('div', { class: 'sprite' }, svg(portraitSvg(u.color, u.glyph, u.element)), h('div', { class: 'attached' })),
          h('div', { class: 'uname' }, u.name),
          bar(u.hp, u.maxHp, 'hp', false),
          h('div', { class: 'statuses' }),
          fx);
      }
      root.addEventListener('click', () => onCardClick(u.uid));
      root.addEventListener('pointerenter', () => onCardHover(u.uid));
      root.addEventListener('pointerleave', () => { if (selecting && !armed) hint.textContent = selectHint; });
      (u.side === 'enemy' ? enemyRow : allyRow).appendChild(root);
      cards.set(u.uid, { root, fx });
    }
    syncAll();
  }

  function syncUnit(u: Unit) {
    const c = cards.get(u.uid);
    if (!c) return;
    const r = c.root;
    r.classList.toggle('dead', !u.alive);
    r.classList.toggle('current', s.current === u.uid);
    r.classList.toggle('broken', u.broken);
    r.classList.toggle('defending', u.defending);
    setBar(r.querySelector('.bar.hp'), u.hp, u.maxHp);
    const att = r.querySelector('.attached') as HTMLElement;
    clear(att);
    if (u.attached) att.appendChild(elBadge(u.attached.el));
    const st = r.querySelector('.statuses') as HTMLElement;
    clear(st);
    for (const x of u.statuses) {
      const inf = STATUS_INFO[x.id];
      st.appendChild(h('span', { class: 'st ' + (inf.good ? 'good' : 'bad'), title: `${inf.name} (${x.turns}턴)` }, inf.icon, h('small', null, x.turns)));
    }
    if (u.shield > 0) st.appendChild(h('span', { class: 'st shield', title: '보호막' }, '◇', h('small', null, Math.round(u.shield))));
    if (u.side === 'enemy') {
      const pips = r.querySelector('.break-pips') as HTMLElement;
      clear(pips);
      for (let i = 0; i < u.breakMax; i++) pips.appendChild(h('i', { class: i < u.breakCur ? 'on' : '' }));
      const wl = r.querySelector('.weak-line') as HTMLElement;
      clear(wl);
      wl.append('약점 ');
      if (u.revealed) {
        if (u.weakness.length) u.weakness.forEach((w) => wl.appendChild(elBadge(w, { small: true })));
        else wl.append('없음');
      } else wl.appendChild(h('span', { class: 'unknown' }, '?'));
      if (u.reactionImmune) wl.appendChild(h('span', { class: 'immune' }, ' 반응 면역'));
      const tele = r.querySelector('.tele') as HTMLElement;
      tele.textContent = u.telegraph ? `⚠ 예고: ${skillDef(u.telegraph).name}` : '';
      tele.classList.toggle('on', !!u.telegraph);
      const sl = r.querySelector('.shield-line') as HTMLElement;
      sl.textContent = u.shield > 0 ? `보호막 ${Math.round(u.shield)}` : '';
    }
  }

  function syncAll() {
    for (const u of s.units) syncUnit(u);
    renderTimeline();
    renderParty();
  }

  function renderTimeline() {
    clear(timeline);
    const order = previewOrder(s, 8);
    order.forEach((uid, i) => {
      const u = byUid(s, uid);
      const art = u.side === 'enemy' ? enemySvg(u.shape, u.element) : portraitSvg(u.color, u.glyph, u.element);
      timeline.appendChild(h('div', { class: `tl-chip ${u.side}` + (i === 0 && s.current ? ' now' : ''), title: u.name }, svg(art),
        i === 0 && s.current ? h('span', { class: 'tl-now' }, 'NOW') : null));
    });
  }

  function renderParty() {
    clear(partyPanel);
    for (const u of s.units.filter((x) => x.side === 'ally' && x.active)) {
      partyPanel.appendChild(h('div', { class: 'pp-row' + (s.current === u.uid ? ' current' : '') + (u.alive ? '' : ' dead'), dataset: { uid: u.uid } },
        h('div', { class: 'pp-name' }, elBadge(u.element, { small: true }), ' ', u.name, h('span', { class: 'lv' }, ` Lv${u.level}`)),
        bar(u.hp, u.maxHp, 'hp'),
        bar(u.mp, u.maxMp, 'mp')));
    }
    const bench = reserves(s);
    if (bench.length) {
      partyPanel.appendChild(h('div', { class: 'pp-bench' }, '대기: ', bench.map((b) => h('span', { class: b.alive ? '' : 'dead' }, `${b.name} ${b.hp}/${b.maxHp} `))));
    }
  }

  // ───── 연출 ─────
  function float(uid: string, text: string, cls: string, color?: string) {
    const c = cards.get(uid);
    if (!c) return;
    const f = h('div', { class: 'float ' + cls, style: color ? `color:${color}` : '' }, text);
    c.fx.appendChild(f);
    setTimeout(() => f.remove(), 1300);
  }
  function shake(uid: string) {
    const c = cards.get(uid);
    if (!c) return;
    c.root.classList.remove('shake'); void c.root.offsetWidth; c.root.classList.add('shake');
  }
  function quake() {
    root.classList.remove('quake'); void root.offsetWidth; root.classList.add('quake');
  }
  function showBanner(text: string, color: string, cls = '') {
    banner.className = 'bt-banner show ' + cls;
    banner.style.setProperty('--c', color);
    banner.textContent = text;
    setTimeout(() => { banner.className = 'bt-banner'; }, 1100 * speed());
  }

  async function play(events: BattleEvent[]) {
    for (const e of events) {
      switch (e.t) {
        case 'turn':
          for (const [uid, c] of cards) c.root.classList.toggle('current', uid === e.uid);
          renderTimeline(); renderParty();
          break;
        case 'action': {
          const u = byUid(s, e.uid);
          actionName.textContent = `${u.name} · ${e.name}`;
          actionName.className = 'bt-action-name show ' + u.side;
          const c = cards.get(e.uid);
          if (c) { c.root.classList.remove('lunge'); void c.root.offsetWidth; c.root.classList.add('lunge'); }
          if (e.name !== '공격' && e.name !== '방어') logLine(`${u.name}의 ${e.name}!`);
          if (e.name === '방어') sfx('buff');
          await wait(380);
          break;
        }
        case 'damage': {
          const u = byUid(s, e.uid);
          const c = cards.get(e.uid);
          if (c) setBar(c.root.querySelector('.bar.hp'), e.hpAfter, u.maxHp);
          const row = partyPanel.querySelector(`[data-uid="${e.uid}"] .bar.hp`);
          if (row) setBar(row, e.hpAfter, u.maxHp);
          if (e.amount === 0 && e.absorbed > 0) float(e.uid, `막음 ${e.absorbed}`, 'shield');
          else {
            const color = e.reaction ? REACTIONS[e.reaction].color : undefined;
            const txt = (e.crit ? '치명! ' : '') + e.amount + (e.resist ? ' ▽' : '') + (e.absorbed ? ` (◇${e.absorbed})` : '');
            float(e.uid, txt, [e.dot ? 'dot' : '', e.crit ? 'crit' : '', e.weak ? 'weak' : '', e.resist ? 'resist' : '', e.reaction ? 'react' : ''].join(' '), color);
          }
          if (!e.dot) { shake(e.uid); sfx(e.crit ? 'crit' : e.weak ? 'weak' : 'hit'); }
          await wait(e.dot ? 300 : 240);
          break;
        }
        case 'miss': float(e.uid, 'MISS', 'miss'); sfx('miss'); await wait(220); break;
        case 'heal': {
          const u = byUid(s, e.uid);
          const c = cards.get(e.uid);
          if (c) setBar(c.root.querySelector('.bar.hp'), e.hpAfter, u.maxHp);
          const row = partyPanel.querySelector(`[data-uid="${e.uid}"] .bar.hp`);
          if (row) setBar(row, e.hpAfter, u.maxHp);
          if (e.amount > 0) { float(e.uid, '+' + e.amount, 'heal'); sfx('heal'); }
          await wait(200);
          break;
        }
        case 'mp': {
          const u = byUid(s, e.uid);
          const row = partyPanel.querySelector(`[data-uid="${e.uid}"] .bar.mp`);
          if (row) setBar(row, e.mpAfter, u.maxMp);
          if (e.amount > 0 && e.amount !== 10 && e.amount !== 15) float(e.uid, `MP +${e.amount}`, 'mpf');
          break;
        }
        case 'shield': float(e.uid, `◇ ${e.amount}`, 'shield'); sfx('buff'); await wait(160); break;
        case 'reaction': {
          const r = REACTIONS[e.reaction];
          showBanner(r.name + '!', r.color, 'react');
          logLine(`원소 반응 「${r.name}」 — ${r.desc}`);
          quake(); sfx('reaction');
          await wait(650);
          break;
        }
        case 'break': {
          const u = byUid(s, e.uid);
          showBanner('BREAK!', '#ffe27a', 'break');
          float(e.uid, 'BREAK!', 'breakf');
          const c = cards.get(e.uid);
          if (c) { c.root.classList.add('shatter'); setTimeout(() => c.root.classList.remove('shatter'), 700); }
          logLine(`${u.name} 브레이크! 다음 행동을 건너뛰고 받는 피해 1.5배`);
          g.stats.breaks += 1;
          quake(); sfx('break');
          await wait(650);
          break;
        }
        case 'status': {
          const inf = STATUS_INFO[e.status];
          if (e.add) float(e.uid, inf.name, inf.good ? 'buff' : 'debuff');
          await wait(100);
          break;
        }
        case 'attach': syncUnit(byUid(s, e.uid)); break;
        case 'death': {
          const u = byUid(s, e.uid);
          cards.get(e.uid)?.root.classList.add('dead');
          logLine(u.side === 'enemy' ? `${u.name}을(를) 쓰러뜨렸다!` : `${u.name}이(가) 쓰러졌다…`);
          sfx('death');
          await wait(300);
          break;
        }
        case 'revive': float(e.uid, '부활!', 'heal'); cards.get(e.uid)?.root.classList.remove('dead'); sfx('heal'); await wait(300); break;
        case 'text': logLine(e.text); await wait(200); break;
        case 'telegraph': {
          const u = byUid(s, e.uid);
          syncUnit(u);
          showBanner(`⚠ ${u.name}: ${e.name} 준비`, '#ff6b6b', 'warn');
          logLine(`${u.name}이(가) 「${e.name}」을(를) 준비한다! 방어·교대·브레이크로 대응하자.`);
          sfx('warn');
          await wait(800);
          break;
        }
        case 'phase': showBanner(e.text, '#ff9bd2', 'phase'); logLine(e.text); quake(); sfx('warn'); await wait(1300); break;
        case 'summon': buildCards(); logLine(`${byUid(s, e.uid).name}이(가) 나타났다!`); await wait(300); break;
        case 'swap': buildCards(); logLine(`${byUid(s, e.outUid).name} ↔ ${byUid(s, e.inUid).name} 교대`); await wait(250); break;
        case 'element': {
          const u = byUid(s, e.uid);
          const c = cards.get(e.uid);
          if (c) {
            const sp = c.root.querySelector('.sprite .svgwrap');
            if (sp) sp.innerHTML = u.side === 'enemy' ? enemySvg(u.shape, u.element) : portraitSvg(u.color, u.glyph, u.element);
          }
          float(e.uid, `${ELEMENT_NAME[e.el]} 원소`, 'buff', ELEMENT_COLOR[e.el]);
          sfx('magic');
          await wait(250);
          break;
        }
        case 'skip': float(e.uid, e.reason, 'debuff'); logLine(`${byUid(s, e.uid).name}: ${e.reason} — 행동 불가`); await wait(450); break;
        case 'move': float(e.uid, e.dir === 'pull' ? '▶ 행동 당김' : '◀ 행동 밀림', e.dir === 'pull' ? 'buff' : 'debuff'); renderTimeline(); await wait(150); break;
      }
    }
    actionName.className = 'bt-action-name';
    syncAll();
  }

  // ───── 대상 선택 ─────
  let selectHint = '';
  function onCardHover(uid: string) {
    if (!selecting || !selecting.valid.has(uid) || !selecting.preview) return;
    hint.innerHTML = '';
    hint.append(selecting.preview(byUid(s, uid)));
  }
  function onCardClick(uid: string) {
    if (!selecting || !selecting.valid.has(uid)) return;
    // 터치 환경: 첫 탭은 미리보기, 두 번째 탭에 확정
    const touch = matchMedia('(hover: none)').matches;
    if (touch && selecting.preview && armed !== uid) {
      armed = uid;
      for (const [id, c] of cards) c.root.classList.toggle('armed', id === uid);
      hint.innerHTML = '';
      hint.append(selecting.preview(byUid(s, uid)), ' — 한 번 더 탭하면 실행');
      return;
    }
    const f = selecting.onPick;
    endSelect();
    f(uid);
  }
  function startSelect(valid: Unit[], text: string, onPick: (uid: string) => void, preview?: (u: Unit) => string) {
    selecting = { valid: new Set(valid.map((v) => v.uid)), onPick, preview };
    armed = null;
    selectHint = text;
    hint.textContent = text;
    for (const [uid, c] of cards) c.root.classList.toggle('targetable', selecting.valid.has(uid));
  }
  function endSelect() {
    selecting = null; armed = null;
    for (const [, c] of cards) c.root.classList.remove('targetable', 'armed');
    hint.textContent = '';
  }

  function previewText(a: Unit, skillId: string | 'attack', t: Unit): string {
    const p = previewHit(s, a, skillId, t);
    if (!p) return t.name;
    const parts = [t.name];
    if (p.immune) parts.push('반응 면역');
    else if (p.reaction) parts.push(`「${REACTIONS[p.reaction].name}」 반응! (${REACTIONS[p.reaction].desc})`);
    if (p.aff === 'weak') parts.push('약점 ×1.5');
    if (p.aff === 'resist') parts.push('내성 ×0.75');
    parts.push(`예상 피해 ~${p.est}`);
    if (p.breaks) parts.push('브레이크 가능!');
    return parts.join(' · ');
  }

  // ───── 플레이어 입력 ─────
  function waitAction(a: Unit): Promise<PlayerAction> {
    return new Promise((resolve) => {
      const back = () => { endSelect(); mainMenu(); };
      const backBtn = () => h('button', { class: 'cmd-btn back', onclick: back }, '← 뒤로');

      function mainMenu() {
        clear(cmd);
        const silenced = a.statuses.some((x) => x.id === 'silence');
        cmd.append(
          h('div', { class: 'cmd-who' }, elBadge(a.element, { small: true }), ` ${a.name}의 차례`),
          h('div', { class: 'cmd-grid' },
            h('button', { class: 'cmd-btn primary', onclick: pickAttack }, '공격', h('small', null, 'MP+10')),
            h('button', { class: 'cmd-btn', onclick: skillMenu, disabled: silenced }, '스킬', silenced ? h('small', null, '침묵') : null),
            h('button', { class: 'cmd-btn', onclick: () => resolve({ kind: 'defend' }) }, '방어', h('small', null, '피해-50% MP+15')),
            h('button', { class: 'cmd-btn', onclick: itemMenu }, '아이템'),
            h('button', { class: 'cmd-btn', onclick: swapMenu, disabled: s.swapsLeft <= 0 || !reserves(s).some((r) => r.alive) }, '교대', h('small', null, `${s.swapsLeft}회`)),
            h('button', { class: 'cmd-btn', onclick: () => resolve({ kind: 'flee' }), disabled: !s.canFlee }, '도망'),
            h('button', { class: 'cmd-btn ghost', onclick: () => resolve({ kind: 'analyze' }), disabled: s.analyzeUsed }, '분석', h('small', null, '무료·1회')),
          ));
      }

      function pickAttack() {
        clear(cmd);
        cmd.append(h('div', { class: 'cmd-who' }, `공격 대상 선택 (${ELEMENT_NAME[a.weaponElement]} 속성)`), backBtn());
        startSelect(sideAlive(s, 'enemy'), '공격할 적을 고르세요', (uid) => resolve({ kind: 'attack', target: uid }), (t) => previewText(a, 'attack', t));
      }

      function skillMenu() {
        clear(cmd);
        const list = h('div', { class: 'skill-list' });
        for (const id of a.skills) {
          const sk = skillDef(id);
          const c = canUseSkill(s, a, sk);
          const el = sk.element === 'self' ? a.element : sk.element === 'weapon' ? a.weaponElement : sk.element;
          list.appendChild(h('button', { class: 'skill-btn', disabled: !c.ok, onclick: () => chooseSkill(sk), title: sk.desc },
            h('div', { class: 'sk-top' }, el !== 'none' ? elBadge(el, { small: true }) : h('span', { class: 'el-badge small blank' }, '·'),
              h('b', null, sk.name), h('span', { class: 'sk-mp' }, sk.mp ? `MP ${sk.mp}` : sk.free ? '무료' : '')),
            h('div', { class: 'sk-desc' }, c.ok ? sk.desc : `${c.why} — ${sk.desc}`)));
        }
        cmd.append(h('div', { class: 'cmd-who' }, `스킬 · MP ${a.mp}/${a.maxMp}`), list, backBtn());
      }

      function chooseSkill(sk: SkillDef) {
        if (sk.id === 'hero_switch') return switchMenu();
        const t = sk.target;
        if (t === 'single_enemy') {
          clear(cmd); cmd.append(h('div', { class: 'cmd-who' }, `${sk.name} — 대상 선택`), backBtn());
          startSelect(sideAlive(s, 'enemy'), `${sk.name}: 적을 고르세요 (마우스를 올리면 반응 미리보기)`, (uid) => resolve({ kind: 'skill', skillId: sk.id, target: uid }), (u) => previewText(a, sk.id, u));
        } else if (t === 'single_ally') {
          clear(cmd); cmd.append(h('div', { class: 'cmd-who' }, `${sk.name} — 아군 선택`), backBtn());
          startSelect(sideAlive(s, 'ally'), `${sk.name}: 아군을 고르세요`, (uid) => resolve({ kind: 'skill', skillId: sk.id, target: uid }));
        } else if (t === 'dead_ally') {
          const dead = s.units.filter((u) => u.side === 'ally' && u.active && !u.alive);
          clear(cmd); cmd.append(h('div', { class: 'cmd-who' }, `${sk.name} — 쓰러진 아군 선택`), backBtn());
          startSelect(dead, '부활시킬 아군', (uid) => resolve({ kind: 'skill', skillId: sk.id, target: uid }));
        } else {
          resolve({ kind: 'skill', skillId: sk.id });
        }
      }

      function switchMenu() {
        clear(cmd);
        cmd.append(h('div', { class: 'cmd-who' }, '원소 전환 — 턴을 소모하지 않아요'),
          h('div', { class: 'cmd-grid' }, s.liberated.map((el: Element) =>
            h('button', { class: 'cmd-btn', style: `--c:${ELEMENT_COLOR[el]}`, disabled: a.element === el, onclick: () => resolve({ kind: 'switch', el }) },
              elBadge(el), ' ', ELEMENT_NAME[el]))),
          backBtn());
      }

      function itemMenu() {
        clear(cmd);
        const list = h('div', { class: 'skill-list' });
        const owned = ITEMS.filter((it) => it.kind === 'consumable' && (g.items[it.id] || 0) > 0);
        if (!owned.length) list.appendChild(h('div', { class: 'muted' }, '쓸 수 있는 아이템이 없어요.'));
        for (const it of owned) {
          list.appendChild(h('button', { class: 'skill-btn', onclick: () => chooseItem(it) },
            h('div', { class: 'sk-top' }, it.use?.element ? elBadge(it.use.element, { small: true }) : null, h('b', null, it.name), h('span', { class: 'sk-mp' }, `×${g.items[it.id]}`)),
            h('div', { class: 'sk-desc' }, it.desc)));
        }
        cmd.append(h('div', { class: 'cmd-who' }, '아이템'), list, backBtn());
      }

      function chooseItem(it: ItemDef) {
        const tgt = it.use!.target;
        clear(cmd); cmd.append(h('div', { class: 'cmd-who' }, `${it.name} — 대상 선택`), backBtn());
        if (tgt === 'enemy') {
          startSelect(sideAlive(s, 'enemy'), `${it.name}: 적을 고르세요`, (uid) => resolve({ kind: 'item', item: it, target: uid }), (u) => {
            const r = u.attached && it.use?.element && u.attached.el !== it.use.element && !u.reactionImmune;
            return `${u.name}${r ? ' · 반응 발생!' : ''}`;
          });
        } else if (tgt === 'dead_ally') {
          startSelect(s.units.filter((u) => u.side === 'ally' && u.active && !u.alive), '부활시킬 아군', (uid) => resolve({ kind: 'item', item: it, target: uid }));
        } else {
          startSelect(sideAlive(s, 'ally'), '아군을 고르세요', (uid) => resolve({ kind: 'item', item: it, target: uid }));
        }
      }

      function swapMenu() {
        clear(cmd);
        const outs = s.units.filter((u) => u.side === 'ally' && u.active);
        const ins = reserves(s).filter((u) => u.alive);
        let out: string | null = a.uid;
        const render = () => {
          clear(cmd);
          cmd.append(h('div', { class: 'cmd-who' }, `교대 — 남은 ${s.swapsLeft}회 · 턴 소모 없음`),
            h('div', { class: 'swap-cols' },
              h('div', null, h('div', { class: 'muted small' }, '내보낼 멤버'), outs.map((u) => h('button', { class: 'cmd-btn' + (out === u.uid ? ' sel' : ''), onclick: () => { out = u.uid; render(); } }, `${u.name}${u.alive ? '' : ' (전투불능)'}`))),
              h('div', null, h('div', { class: 'muted small' }, '들어올 멤버'), ins.map((u) => h('button', { class: 'cmd-btn', disabled: !out, onclick: () => resolve({ kind: 'swap', out: out!, in: u.uid }) }, `${u.name} ${u.hp}/${u.maxHp}`)))),
            backBtn());
        };
        render();
      }

      mainMenu();
    });
  }

  function idleCmd(text: string) {
    clear(cmd);
    cmd.append(h('div', { class: 'cmd-who muted' }, text));
  }

  // ───── 메인 루프 ─────
  buildCards();
  logLine('전투 시작!');
  await wait(300);
  while (!s.result) {
    const ts = beginTurn(s);
    await play(ts.events);
    if (s.result || !ts.actor || ts.skipped) continue;
    let actor = ts.actor;
    if (actor.side === 'enemy') {
      idleCmd(`${actor.name}의 차례…`);
      await wait(320);
      await play(enemyTurn(s, actor));
      continue;
    }
    // 아군 턴: 턴을 끝내는 행동이 나올 때까지
    for (;;) {
      const act = await waitAction(actor);
      endSelect();
      const res = playerAction(s, actor, act);
      if (!res.ok) { toast(res.message ?? '할 수 없어요', 'warn'); continue; }
      if (res.consumedItem) addItem(g, res.consumedItem, -1);
      idleCmd('…');
      await play(res.events);
      if (s.result || res.endsTurn) break;
      if (s.current) actor = byUid(s, s.current);
      if (!actor.alive) break;
    }
  }
  idleCmd(s.result === 'win' ? '승리!' : s.result === 'fled' ? '도망쳤다' : '패배…');
  if (s.result === 'win') { showBanner('승리!', '#ffd76b', 'win'); sfx('win'); }
  if (s.result === 'lose') { showBanner('패배…', '#888', 'lose'); sfx('lose'); }
  await wait(1100);
  void aliveOnField; void itemDef;
  return s.result!;
}
