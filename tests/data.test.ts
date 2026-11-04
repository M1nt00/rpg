import { describe, expect, it } from 'vitest';
import { CHARACTERS, ENEMIES, EVENTS, ITEMS, LEGENDARIES, QUESTS, REGIONS, SCENES, SKILLS, enemy, gameEvent, item, legendary, skill } from '../src/data';

describe('데이터 무결성', () => {
  it('id가 겹치지 않는다', () => {
    for (const list of [SKILLS, CHARACTERS, ENEMIES, ITEMS, LEGENDARIES, REGIONS, EVENTS, QUESTS] as { id: string }[][]) {
      expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
    }
  });
  it('캐릭터 스킬·스킬트리가 존재하는 스킬을 가리킨다', () => {
    for (const c of CHARACTERS) {
      for (const s of c.innate) expect(() => skill(s)).not.toThrow();
      expect(c.tree.length).toBe(3);
      for (const b of c.tree) {
        expect(b.nodes.length).toBe(4);
        expect(b.nodes[3].ultimate).toBe(true);
        for (const n of b.nodes) if (n.kind === 'skill') expect(() => skill(n.skill!)).not.toThrow();
      }
      // 전부 찍기는 불가능하게: 레벨 30에서 받는 SP(31)보다 트리 총합이 커야 한다
      const total = c.tree.flatMap((b) => b.nodes).reduce((s, n) => s + n.cost, 0);
      expect(total).toBeGreaterThan(31);
    }
  });
  it('적 AI·드롭·전설 장비 참조가 유효하다', () => {
    for (const e of ENEMIES) {
      for (const r of [...e.ai, ...(e.phases ?? []).flatMap((p) => p.ai ?? [])]) expect(() => skill(r.action)).not.toThrow();
      for (const p of e.phases ?? []) if (p.onEnter) expect(() => skill(p.onEnter!)).not.toThrow();
      for (const d of e.drops) expect(() => item(d.item)).not.toThrow();
      if (e.legendary) expect(() => legendary(e.legendary!)).not.toThrow();
    }
    for (const s of SKILLS) for (const id of s.summon ?? []) expect(() => enemy(id)).not.toThrow();
  });
  it('지역 맵: 연결이 양방향이고 보스까지 갈 수 있다', () => {
    for (const r of REGIONS) {
      const ids = new Set(r.nodes.map((n) => n.id));
      for (const n of r.nodes) {
        for (const l of n.links) { expect(ids.has(l)).toBe(true); expect(r.nodes.find((x) => x.id === l)!.links).toContain(n.id); }
        for (const e of n.encounter ?? []) expect(() => enemy(e)).not.toThrow();
        if (n.event) expect(() => gameEvent(n.event!)).not.toThrow();
        for (const it of n.chest?.items ?? []) expect(() => item(it.id)).not.toThrow();
      }
      expect(r.nodes.length).toBeGreaterThanOrEqual(10);
      expect(r.nodes.length).toBeLessThanOrEqual(15);
      const seen = new Set([r.nodes[0].id]);
      const q = [r.nodes[0]];
      while (q.length) for (const l of q.pop()!.links) if (!seen.has(l)) { seen.add(l); q.push(r.nodes.find((x) => x.id === l)!); }
      expect(seen.size).toBe(r.nodes.length);
      expect(r.nodes.some((n) => n.type === 'boss')).toBe(true);
      for (const sc of [r.introScene, r.bossPreScene, r.bossPostScene]) expect(SCENES[sc]).toBeTruthy();
      for (const p of r.pool) expect(() => enemy(p)).not.toThrow();
    }
  });
  it('이벤트·퀘스트 참조가 유효하다', () => {
    for (const e of EVENTS) for (const c of e.choices) {
      if (c.cost?.item) expect(() => item(c.cost!.item!)).not.toThrow();
      for (const o of c.outcomes) for (const it of o.items ?? []) expect(() => item(it.id)).not.toThrow();
    }
    for (const q of QUESTS) {
      if (q.target.enemy) expect(() => enemy(q.target.enemy!)).not.toThrow();
      if (q.target.item) expect(() => item(q.target.item!)).not.toThrow();
      if (q.reward.legendary) expect(() => legendary(q.reward.legendary!)).not.toThrow();
      for (const it of q.reward.items ?? []) expect(() => item(it.id)).not.toThrow();
    }
  });
});
