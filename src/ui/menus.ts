// 타이틀 · 저장 · 설정 · 퀘스트 목록
import { QUESTS, region as regionDef, quest as questDef } from '../data';
import { confirmBox, fmtTime, h, modal, toast } from '../core/dom';
import { sfx } from '../core/audio';
import { SLOT_COUNT, deleteSlot, exportJSON, importJSON, loadSlot, saveSlot, slotInfo } from '../game/save';
import { claimQuest, nodeOf, questProgress } from '../game/world';
import { app, gs, setScreen, updateSettings } from './app';
import { continueGame, refresh, startNewGame } from './flow';
import { enemySvg } from './art';

const regionName = (id: string | null) => (id ? regionDef(id).name : '월드맵');

// ───────────── 타이틀 ─────────────
export function titleScreen() {
  app.gs = null;
  const hasSave = Array.from({ length: SLOT_COUNT }, (_, i) => loadSlot(i + 1)).some(Boolean);
  const orbs = (['fire', 'water', 'wind', 'lightning', 'earth'] as const).map((e, i) =>
    h('div', { class: `orb orb-${e}`, style: `--i:${i}`, html: enemySvg('wisp', e) }));
  setScreen(h('main', { class: 'title' },
    h('div', { class: 'title-orbs' }, orbs),
    h('h1', { class: 'game-title' }, h('small', null, '판타지 턴제 RPG'), '다섯 원소의 계승자'),
    h('p', { class: 'title-sub' }, '원소를 쌓고, 반응을 터뜨리고, 적을 무너뜨려라.'),
    h('div', { class: 'title-menu' },
      h('button', { class: 'btn primary big', onclick: () => newGameDialog() }, '새 게임'),
      h('button', { class: 'btn big', disabled: !hasSave, onclick: () => loadDialog() }, '이어하기'),
      h('button', { class: 'btn', onclick: () => importDialog() }, '세이브 파일 불러오기'),
      h('button', { class: 'btn', onclick: () => settingsDialog() }, '설정')),
    h('p', { class: 'title-foot muted small' }, 'PC는 마우스, 모바일은 터치로 플레이할 수 있어요.')), { cls: 'title-screen' });
}

function slotLabel(n: number) {
  const s = slotInfo(n, regionName);
  return s ? `슬롯 ${n} — ${s.heroName} Lv${s.level} · ${s.region} · ${fmtTime(s.playTime)}` : `슬롯 ${n} — 비어 있음`;
}

function newGameDialog() {
  const input = h('input', { class: 'input', maxlength: 8, placeholder: '이안', value: '', 'aria-label': '주인공 이름' }) as HTMLInputElement;
  let slot = 1;
  for (let i = 1; i <= SLOT_COUNT; i++) if (!loadSlot(i)) { slot = i; break; }
  const slotSel = h('div', { class: 'choice-list' });
  const renderSlots = () => {
    slotSel.innerHTML = '';
    for (let i = 1; i <= SLOT_COUNT; i++) slotSel.append(h('button', { class: 'btn block' + (slot === i ? ' primary' : ''), onclick: () => { slot = i; renderSlots(); } }, slotLabel(i)));
  };
  renderSlots();
  const m = modal('새 게임', [
    h('label', { class: 'field' }, '주인공 이름', input),
    h('div', { class: 'muted small' }, '저장할 슬롯 (휴식처·여관에서 저장해요)'), slotSel,
    h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: async () => {
      if (loadSlot(slot) && !(await confirmBox('덮어쓰기', `슬롯 ${slot}의 데이터를 나중에 덮어쓰게 돼요. 괜찮을까요?`))) return;
      m.close();
      sfx('open');
      await startNewGame(input.value.trim() || '이안', slot);
    } }, '모험 시작')),
  ]);
  setTimeout(() => input.focus(), 50);
}

function loadDialog() {
  const m = modal('이어하기', h('div', { class: 'choice-list' }, Array.from({ length: SLOT_COUNT }, (_, i) => i + 1).map((n) => {
    const g = loadSlot(n);
    return h('div', { class: 'row' },
      h('button', { class: 'btn block', disabled: !g, onclick: () => { if (!g) return; m.close(); continueGame(g, n); } }, slotLabel(n)),
      g ? h('button', { class: 'btn small', 'aria-label': `슬롯 ${n} 삭제`, onclick: async () => {
        if (await confirmBox('삭제', `슬롯 ${n}을(를) 지울까요?`)) { deleteSlot(n); m.close(); titleScreen(); }
      } }, '삭제') : null);
  })));
}

function importDialog() {
  const file = h('input', { type: 'file', accept: '.json,application/json', class: 'input' }) as HTMLInputElement;
  const m = modal('세이브 파일 불러오기', [
    h('p', { class: 'muted' }, '내보낸 JSON 세이브 파일을 고르세요.'), file,
  ]);
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      const g = importJSON(await f.text());
      m.close();
      let slot = 1;
      for (let i = 1; i <= SLOT_COUNT; i++) if (!loadSlot(i)) { slot = i; break; }
      saveSlot(g, slot);
      toast(`슬롯 ${slot}에 불러왔어요.`, 'good');
      continueGame(g, slot);
    } catch (e) {
      toast((e as Error).message || '불러오기 실패', 'warn');
    }
  });
}

// ───────────── 저장 ─────────────
export function saveDialog(): Promise<void> {
  return new Promise((res) => {
    const g = gs();
    const m = modal('저장', [
      h('div', { class: 'choice-list' }, Array.from({ length: SLOT_COUNT }, (_, i) => i + 1).map((n) =>
        h('button', { class: 'btn block' + (n === app.slot ? ' primary' : ''), onclick: async () => {
          if (loadSlot(n) && n !== app.slot && !(await confirmBox('덮어쓰기', `슬롯 ${n}에 덮어쓸까요?`))) return;
          if (saveSlot(g, n)) { app.slot = n; sfx('coin'); toast(`슬롯 ${n}에 저장했어요.`, 'good'); } else toast('저장 실패 (브라우저 저장소를 쓸 수 없어요)', 'warn');
          m.close();
        } }, slotLabel(n)))),
      h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => downloadSave() }, 'JSON으로 내보내기')),
    ], { onClose: () => res() });
  });
}

function downloadSave() {
  const g = gs();
  const blob = new Blob([exportJSON(g)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `elemental-heir-${g.heroName}-lv${g.chars.hero.level}.json` });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function canSaveHere(): boolean {
  const g = gs();
  if (!g.location) return false;
  const p = g.regions[g.location];
  if (!p) return false;
  const n = nodeOf(g.location, p.current);
  return n.type === 'rest' || n.type === 'town' || n.type === 'start';
}

// ───────────── 메뉴 ─────────────
export function openMenu() {
  const g = gs();
  const here = canSaveHere();
  const m = modal('메뉴', [
    h('div', { class: 'choice-list' },
      h('button', { class: 'btn block', disabled: !here, onclick: () => { m.close(); void saveDialog(); } }, here ? '저장하기' : '저장하기 (휴식처·마을에서만)'),
      h('button', { class: 'btn block', onclick: () => downloadSave() }, '세이브 JSON 내보내기'),
      h('button', { class: 'btn block', onclick: () => { m.close(); settingsDialog(); } }, '설정'),
      h('button', { class: 'btn block', onclick: () => { m.close(); helpDialog(); } }, '전투 도움말'),
      h('button', { class: 'btn block', onclick: async () => {
        if (await confirmBox('타이틀로', '저장하지 않은 진행은 사라져요. 타이틀로 갈까요?')) { m.close(); titleScreen(); }
      } }, '타이틀로')),
    h('p', { class: 'muted small' }, `플레이 시간 ${fmtTime(g.playTime)} · 전투 ${g.stats.battles}회 · 반응 ${g.stats.reactions}회 · 브레이크 ${g.stats.breaks}회`),
  ]);
}

export function settingsDialog() {
  const render = () => [
    h('div', { class: 'choice-list' },
      h('button', { class: 'btn block', onclick: () => { updateSettings({ sound: !app.settings.sound }); m.close(); settingsDialog(); } }, `효과음: ${app.settings.sound ? '켜짐' : '꺼짐'}`),
      h('button', { class: 'btn block', onclick: () => { updateSettings({ speed: app.settings.speed === 1 ? 2 : 1 }); m.close(); settingsDialog(); } }, `전투 속도: ${app.settings.speed}배`)),
  ];
  const m = modal('설정', render());
}

export function helpDialog() {
  modal('전투 도움말', h('div', { class: 'help' },
    h('h3', null, '속도 타임라인'), h('p', null, '라운드 없이 속도(SPD)가 높을수록 자주 행동해요. 위쪽 타임라인에 다음 8번의 행동 순서가 보여요.'),
    h('h3', null, '원소 상성'), h('p', null, '물 → 불 → 바람 → 땅 → 번개 → 물 (화살표 방향이 유리). 유리하면 1.5배, 불리하면 0.75배.'),
    h('h3', null, '원소 반응'), h('p', null, '원소 스킬에 맞은 적에게는 원소가 2턴 부착돼요. 다른 원소로 맞추면 반응이 터져요.'),
    h('ul', null,
      h('li', null, '불+물 증발: 피해 2배'), h('li', null, '물+번개 감전: 적 전체 추가 피해'), h('li', null, '불+바람 화염폭풍: 광역 + 화상'),
      h('li', null, '땅+물 진흙: 속도 30% 감소'), h('li', null, '번개+불 과부하: 방어 40% 감소'), h('li', null, '바람+땅 모래폭풍: 적 명중↓ 아군 회피↑'),
      h('li', null, '땅+번개 결정화: 아군 보호막'), h('li', null, '바람+물 빙결: 1턴 행동 불가 (보스는 행동 밀기)')),
    h('h3', null, '브레이크'), h('p', null, '약점 원소로 맞출 때마다 게이지가 깎이고, 0이 되면 다음 행동을 건너뛰고 받는 피해가 1.5배가 돼요. 보스의 예고 기술도 끊을 수 있어요.'),
    h('h3', null, '행동'), h('p', null, '공격(MP+10) · 스킬 · 방어(피해 50%↓, MP+15) · 아이템 · 교대(턴 소모 없음, 전투당 2회) · 도망(보스전 불가) · 분석(무료, 전투당 1회)'),
  ), { wide: true });
}

// ───────────── 퀘스트 목록 ─────────────
export function openQuestLog(onBack: () => void) {
  const g = gs();
  const list = h('div', { class: 'quest-log' });
  const render = () => {
    list.innerHTML = '';
    list.append(h('div', { class: 'card quest main' }, h('h3', null, '[메인] ', questDef('q_main').name),
      h('p', null, questDef('q_main').desc), h('p', { class: 'small' }, `해방한 신전 ${g.liberated.length}/5${g.cleared ? ' · 공허 소멸!' : ''}`)));
    const entries = Object.entries(g.quests).filter(([id]) => id !== 'q_main');
    if (!entries.length) list.append(h('p', { class: 'muted' }, '받은 퀘스트가 없어요. 마을 게시판을 확인하세요.'));
    const orderMap = { done: 0, active: 1, claimed: 2 } as const;
    entries.sort((a, b) => orderMap[a[1].status] - orderMap[b[1].status]);
    for (const [id, st] of entries) {
      const q = QUESTS.find((x) => x.id === id)!;
      const p = questProgress(g, q);
      list.append(h('div', { class: 'card quest ' + st.status },
        h('div', { class: 'row between' }, h('h3', null, q.name), h('span', { class: 'chip' + (st.status === 'claimed' ? ' good' : '') }, st.status === 'done' ? '달성!' : st.status === 'claimed' ? '완료' : `${p.cur}/${p.need}`)),
        h('p', { class: 'small' }, q.desc),
        q.kind === 'deliver' && st.status === 'active' ? h('p', { class: 'small muted' }, `전달 장소: ${nodeLabel(q.target.node!)}`) : null,
        st.status === 'done' ? h('button', { class: 'btn small primary', onclick: () => {
          const lines = claimQuest(g, id); sfx('levelup'); toast(`보상: ${lines.join(', ')}`, 'good'); render();
        } }, '보상 받기') : null));
    }
  };
  render();
  modal('퀘스트', list, { wide: true, onClose: onBack });
  void refresh;
}

function nodeLabel(nid: string) {
  const rid = nid.split('_')[0];
  const n = nodeOf(rid, nid);
  return `${regionDef(rid).name} — ${n.label ?? '표시된 지점'}`;
}
