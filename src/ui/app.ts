// 전역 앱 상태 · 화면 전환 · 상단 HUD
import type { GameState } from '../game/state';
import { loadSettings, saveSettings, type Settings } from '../game/save';
import { $, clear, h } from '../core/dom';
import { setSound } from '../core/audio';
import { region as regionDef } from '../data';
import { goldText } from './common';

export const app = {
  gs: null as GameState | null,
  settings: loadSettings() as Settings,
  slot: 1,
  timer: 0 as number | ReturnType<typeof setInterval>,
  busy: false,
};
setSound(app.settings.sound);

export function gs(): GameState {
  if (!app.gs) throw new Error('게임이 시작되지 않았어요');
  return app.gs;
}

export function updateSettings(p: Partial<Settings>) {
  app.settings = { ...app.settings, ...p };
  setSound(app.settings.sound);
  saveSettings(app.settings);
}

export function startClock() {
  clearInterval(app.timer as number);
  app.timer = setInterval(() => { if (app.gs && !document.hidden) app.gs.playTime += 1; }, 1000);
}

export interface HudActions {
  party: () => void;
  bag: () => void;
  quests: () => void;
  world: (() => void) | null;
  menu: () => void;
}

export function setScreen(content: HTMLElement, opts: { hud?: HudActions; cls?: string } = {}) {
  const root = $('#screen');
  clear(root);
  root.className = 'screen ' + (opts.cls ?? '');
  if (opts.hud) root.appendChild(hudBar(opts.hud));
  root.appendChild(content);
  root.scrollTop = 0;
}

function hudBar(a: HudActions) {
  const g = gs();
  const loc = g.location ? regionDef(g.location).name : '월드맵';
  return h('header', { class: 'hud' },
    h('div', { class: 'hud-left' },
      h('span', { class: 'hud-title' }, '다섯 원소의 계승자'),
      h('span', { class: 'hud-loc' }, loc)),
    h('div', { class: 'hud-right' },
      goldText(g.gold),
      h('nav', { class: 'hud-nav' },
        a.world ? h('button', { class: 'hud-btn', onclick: a.world }, '월드맵') : null,
        h('button', { class: 'hud-btn', onclick: a.party }, '파티'),
        h('button', { class: 'hud-btn', onclick: a.bag }, '가방'),
        h('button', { class: 'hud-btn', onclick: a.quests }, '퀘스트'),
        h('button', { class: 'hud-btn', onclick: a.menu, 'aria-label': '메뉴' }, '☰'))));
}
