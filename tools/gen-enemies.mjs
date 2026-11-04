import fs from 'fs';
const WEAK = { fire: 'water', wind: 'fire', earth: 'wind', lightning: 'earth', water: 'lightning' };
const MAT = { 1: 'ember_ore', 2: 'mist_pearl', 3: 'storm_feather', 4: 'thunder_crystal', 5: 'deep_gem', 6: null };
const R = (x) => Math.round(x);
function base(L) {
  return { hp: 30 + 20 * L, atk: 12 + 3.4 * L, mag: 12 + 3.4 * L, def: 7 + 2.1 * L, res: 7 + 2.1 * L, spd: 88 + 0.6 * L };
}
const expOf = (L) => R(6 + 3 * Math.pow(L, 1.3));
const goldOf = (L) => R(6 + 2.6 * L);
const out = [];
const REG_HP = { 1: 1.0, 2: 0.9, 3: 1.25, 4: 1.5, 5: 1.7, 6: 1.8 };
const REG_ATK = { 1: 1.0, 2: 1.0, 3: 1.25, 4: 1.5, 5: 1.75, 6: 1.85 };
function E(o) {
  const L = o.level;
  const b0 = base(L);
  const b = { ...b0, hp: b0.hp * REG_HP[o.region], atk: b0.atk * REG_ATK[o.region], mag: b0.mag * REG_ATK[o.region] };
  const m = Object.assign({ hp: 1, atk: 1, mag: 1, def: 1, res: 1, spd: 1 }, o.m || {});
  const rank = o.rank || 'normal';
  const rk = { normal: { hp: 1, a: 1, d: 1, x: 1, g: 1 }, elite: { hp: 3.4, a: 1.2, d: 1.15, x: 4, g: 4 },
    boss: { hp: o.bossHp || 8, a: 1.25, d: 1.2, x: 10, g: 12 }, summon: { hp: 0.6, a: 0.9, d: 0.9, x: 0.3, g: 0.2 } }[rank];
  const stats = {
    hp: R(b.hp * m.hp * rk.hp), atk: R(b.atk * m.atk * rk.a), mag: R(b.mag * m.mag * rk.a),
    def: R(b.def * m.def * rk.d), res: R(b.res * m.res * rk.d), spd: R(b.spd * m.spd),
  };
  const drops = [];
  if (rank === 'normal') {
    if (MAT[o.region]) drops.push({ item: MAT[o.region], chance: 0.35 });
    drops.push({ item: 'enh_stone', chance: 0.22 });
    drops.push({ item: 'potion', chance: 0.1 });
    if (o.region >= 3) drops.push({ item: 'enh_stone_hi', chance: 0.05 + 0.02 * (o.region - 3) });
  } else if (rank === 'elite') {
    drops.push({ item: 'enh_stone_hi', chance: 1 }, { item: 'enh_stone', chance: 1 });
  } else if (rank === 'boss') {
    drops.push({ item: 'enh_stone_hi', chance: 1 }, { item: 'hipotion', chance: 1 });
  }
  out.push({
    id: o.id, name: o.name, region: o.region, element: o.el,
    weakness: o.weakness || (o.el === 'none' ? [] : [WEAK[o.el]]),
    level: L, rank, stats,
    breakGauge: o.bg || (rank === 'boss' ? 8 : rank === 'elite' ? 5 : rank === 'summon' ? 2 : 3),
    exp: R(expOf(L) * rk.x), gold: R(goldOf(L) * rk.g), drops,
    ai: o.ai, ...(o.phases ? { phases: o.phases } : {}),
    ...(o.apt ? { actionsPerTurn: o.apt } : {}), ...(o.immune ? { reactionImmune: true } : {}),
    shape: o.shape, desc: o.desc, ...(o.legendary ? { legendary: o.legendary } : {}),
  });
}
const A = (action, weight, extra = {}) => ({ action, weight, ...extra });

// ─── 지역 1: 잿빛 평원 ───
E({ id: 'ash_wolf', name: '잿빛 늑대', region: 1, level: 1, el: 'wind', shape: 'beast', m: { hp: 0.9, spd: 1.12 },
  desc: '재를 뒤집어쓴 들개. 빠르고 무리를 짓는다.', ai: [A('e_bite', 70), A('e_howl', 15, { cond: { minTurn: 1 } }), A('e_claw', 15)] });
E({ id: 'ember_slime', name: '불씨 슬라임', region: 1, level: 2, el: 'fire', shape: 'slime', m: { hp: 1.15, def: 0.8, spd: 0.92 },
  desc: '타다 남은 불씨가 뭉친 점액. 맞으면 화상을 입는다.', ai: [A('e_bite', 55), A('e_burn_touch', 45)] });
E({ id: 'dust_beetle', name: '먼지 딱정벌레', region: 1, level: 3, el: 'earth', shape: 'insect', m: { def: 1.5, spd: 0.85, hp: 1.05 },
  desc: '단단한 껍질의 갑충. 웅크리면 공격이 잘 안 들어간다.', ai: [A('e_slam', 60), A('e_guard', 25, { cond: { selfHpBelow: 0.6 } }), A('e_sunder', 15)] });
E({ id: 'void_wisp', name: '공허 도깨비불', region: 1, level: 4, el: 'lightning', shape: 'wisp', m: { hp: 0.8, mag: 1.2, res: 1.3 },
  desc: '공허가 새어 나온 틈에서 떠도는 불빛. 원소를 갉아먹는다.', ai: [A('e_bolt', 70, { target: 'attached' }), A('e_hex', 30)] });
E({ id: 'fallen_captain', name: '타락한 기사단장', region: 1, level: 5, el: 'wind', rank: 'elite', shape: 'knight', m: { def: 1.2 },
  desc: '공허에 삼켜진 불꽃 기사단의 단장. 카일의 옛 스승.', ai: [A('e_claw', 40), A('e_sweep', 25), A('e_sunder', 20), A('e_charge_smash', 15, { cond: { minTurn: 2 } })] });
E({ id: 'ash_golem', name: '잿불 골렘', region: 1, level: 6, el: 'fire', rank: 'boss', bossHp: 6.5, shape: 'golem', m: { def: 1.2, spd: 0.85 },
  desc: '불의 신전을 지키던 수호 골렘. 공허에 오염되어 폭주 중.', legendary: 'lg_steam_blade',
  ai: [A('golem_lava', 100, { cond: { turnEvery: 3 } }), A('golem_slam', 55), A('golem_ember', 45, { target: 'random' })],
  phases: [{ hpBelow: 0.5, message: '골렘의 균열에서 용암이 흘러넘친다!',
    ai: [A('golem_lava', 100, { cond: { turnEvery: 3 } }), A('golem_slam', 45), A('golem_ember', 35), A('e_roar', 20, { cond: { minTurn: 1 } })] }] });

// ─── 지역 2: 물안개 호수 ───
E({ id: 'mist_frog', name: '안개 두꺼비', region: 2, level: 6, el: 'water', shape: 'slime', m: { hp: 1.1 },
  desc: '안개를 뿜는 거대 두꺼비.', ai: [A('e_bite', 50), A('e_spit', 30), A('e_mire', 20)] });
E({ id: 'lake_serpent', name: '호수 뱀', region: 2, level: 7, el: 'water', shape: 'serpent', m: { atk: 1.15, spd: 1.05 },
  desc: '물속에서 튀어나와 휘감는다.', ai: [A('e_bite', 50), A('e_double', 30), A('e_bolt', 20)] });
E({ id: 'reed_sprite', name: '갈대 정령', region: 2, level: 8, el: 'wind', shape: 'wisp', m: { hp: 0.8, mag: 1.15, spd: 1.15 },
  desc: '갈대숲의 장난꾸러기 정령. 동료를 치유한다.', ai: [A('e_bolt', 55), A('e_mend', 30, { cond: { allyHpBelow: 0.5 } }), A('e_shriek', 15)] });
E({ id: 'drowned_soldier', name: '익사한 병사', region: 2, level: 9, el: 'earth', shape: 'humanoid', m: { def: 1.3, hp: 1.15, spd: 0.9 },
  desc: '호수에 가라앉았던 옛 병사. 공허가 다시 일으켜 세웠다.', ai: [A('e_claw', 50), A('e_stun_blow', 30), A('e_guard', 20, { cond: { selfHpBelow: 0.5 } })] });
E({ id: 'mist_heretic', name: '안개의 이단자', region: 2, level: 10, el: 'lightning', rank: 'elite', shape: 'mage', m: { mag: 1.2, res: 1.2 },
  desc: '신전을 버리고 공허를 숭배하게 된 대사제.', ai: [A('e_bolt', 35, { target: 'attached' }), A('e_breath', 25), A('e_hex', 20), A('e_heal', 20, { cond: { selfHpBelow: 0.4 } })] });
E({ id: 'mist_clone', name: '안개 분신', region: 2, level: 9, el: 'water', rank: 'summon', immune: true, shape: 'ghost', m: { hp: 0.9 },
  desc: '마녀의 분신. 원소 반응이 통하지 않는다.', ai: [A('e_bolt', 70), A('witch_mist', 30)] });
E({ id: 'lake_witch', name: '호수의 마녀', region: 2, level: 11, el: 'water', rank: 'boss', bossHp: 5, shape: 'witch', m: { mag: 1.2, res: 1.15, def: 0.9 },
  desc: '물의 신전을 차지한 마녀. 분신 뒤에 숨는다.', legendary: 'lg_mist_staff',
  ai: [A('witch_summon', 100, { cond: { summonsBelow: 2, minTurn: 1 } }), A('witch_tide', 100, { cond: { turnEvery: 4 } }), A('witch_lance', 55, { target: 'attached' }), A('witch_mist', 20)],
  phases: [{ hpBelow: 0.5, message: '마녀의 눈이 탁한 푸른빛으로 번뜩인다!', onEnter: 'witch_summon',
    ai: [A('witch_summon', 100, { cond: { summonsBelow: 2, minTurn: 1 } }), A('witch_tide', 100, { cond: { turnEvery: 3 } }), A('witch_lance', 60, { target: 'lowestHp' }), A('e_drain', 25)] }] });

// ─── 지역 3: 바람의 협곡 ───
E({ id: 'cliff_harpy', name: '절벽 하피', region: 3, level: 11, el: 'wind', shape: 'bird', m: { spd: 1.15, hp: 0.9 },
  desc: '절벽에 둥지를 튼 하피. 날카로운 비명을 지른다.', ai: [A('e_claw', 55), A('e_shriek', 20), A('e_double', 25)] });
E({ id: 'rock_lizard', name: '바위 도마뱀', region: 3, level: 12, el: 'earth', shape: 'beast', m: { def: 1.35, hp: 1.15, spd: 0.92 },
  desc: '바위 틈에 숨어 사는 거대 도마뱀.', ai: [A('e_bite', 55), A('e_guard', 20, { cond: { selfHpBelow: 0.6 } }), A('e_sunder', 25)] });
E({ id: 'storm_hawk', name: '폭풍매', region: 3, level: 13, el: 'lightning', shape: 'bird', m: { atk: 1.15, spd: 1.2, hp: 0.85 },
  desc: '번개를 두른 맹금.', ai: [A('e_claw', 50), A('e_bolt', 35, { target: 'attached' }), A('e_howl', 15)] });
E({ id: 'canyon_bandit', name: '협곡 도적', region: 3, level: 14, el: 'fire', shape: 'humanoid', m: { atk: 1.1 },
  desc: '공허의 혼란을 틈타 공중 다리를 약탈하는 도적.', ai: [A('e_double', 40, { target: 'lowestHp' }), A('e_burn_touch', 35), A('e_spit', 25)] });
E({ id: 'wind_wraith', name: '바람 망령', region: 3, level: 15, el: 'wind', rank: 'elite', shape: 'ghost', m: { mag: 1.2, spd: 1.1 },
  desc: '협곡에서 떨어져 죽은 이들의 원한. 아린의 아버지의 모습을 하고 있다.', ai: [A('e_breath', 35), A('e_drain', 30), A('e_shriek', 15), A('e_charge_nova', 20, { cond: { minTurn: 2 } })] });
E({ id: 'storm_griffon', name: '폭풍 그리폰', region: 3, level: 16, el: 'wind', rank: 'boss', bossHp: 8, apt: 2, shape: 'griffon', m: { spd: 1.1, atk: 1.05 },
  desc: '바람의 신전 위를 맴도는 거대한 그리폰. 한 턴에 두 번 움직인다.', legendary: 'lg_storm_bow',
  ai: [A('griffon_dive', 100, { cond: { turnEvery: 4 } }), A('griffon_talon', 55, { target: 'lowestHp' }), A('griffon_gust', 30)],
  phases: [{ hpBelow: 0.5, message: '그리폰이 분노의 포효를 내지른다! 바람이 거칠어진다.',
    ai: [A('griffon_dive', 100, { cond: { turnEvery: 3 } }), A('griffon_talon', 45, { target: 'lowestHp' }), A('griffon_gust', 35), A('e_howl', 20)] }] });

// ─── 지역 4: 뇌운 고원 ───
E({ id: 'thunder_ram', name: '뇌운 산양', region: 4, level: 15, el: 'lightning', shape: 'beast', m: { atk: 1.15 },
  desc: '번개가 내리치는 뿔을 가진 산양.', ai: [A('e_slam', 50), A('e_stun_blow', 25), A('e_bolt', 25)] });
E({ id: 'ruin_sentinel', name: '유적 파수병', region: 4, level: 16, el: 'earth', shape: 'golem', m: { def: 1.4, res: 1.2, spd: 0.85, hp: 1.1 },
  desc: '고대 유적을 지키는 자동 인형.', ai: [A('e_slam', 50), A('e_guard', 20, { cond: { selfHpBelow: 0.5 } }), A('e_charge_smash', 30, { cond: { minTurn: 1 } })] });
E({ id: 'static_imp', name: '정전기 임프', region: 4, level: 17, el: 'lightning', shape: 'wisp', m: { mag: 1.2, spd: 1.15, hp: 0.8 },
  desc: '찌릿찌릿한 장난꾸러기 마물.', ai: [A('e_bolt', 50, { target: 'attached' }), A('e_hex', 25), A('e_shriek', 25)] });
E({ id: 'cloud_jelly', name: '구름 해파리', region: 4, level: 18, el: 'water', shape: 'slime', m: { hp: 1.2, res: 1.3 },
  desc: '하늘을 떠다니는 해파리. 동료를 치유한다.', ai: [A('e_breath', 35), A('e_mend', 30, { cond: { allyHpBelow: 0.5 } }), A('e_mire', 35)] });
E({ id: 'rampant_doll', name: '폭주한 마도인형', region: 4, level: 19, el: 'fire', rank: 'elite', shape: 'golem', m: { mag: 1.2, def: 1.2 },
  desc: '도윤의 스승이 만든 마도인형. 공허의 핵이 박혀 있다.', ai: [A('e_burn_touch', 35), A('e_breath', 30), A('e_charge_nova', 20, { cond: { minTurn: 2 } }), A('e_guard', 15, { cond: { selfHpBelow: 0.5 } })] });
E({ id: 'thunder_guardian', name: '뇌신의 수호기', region: 4, level: 20, el: 'lightning', rank: 'boss', bossHp: 9, shape: 'guardian', m: { mag: 1.15, def: 1.15 },
  desc: '번개의 신전을 지키던 거대 수호기. 2페이즈에서 노심이 과열되어 불 원소로 변한다.', legendary: 'lg_thunder_ring',
  ai: [A('guardian_storm', 100, { cond: { turnEvery: 3 } }), A('guardian_beam', 60, { target: 'attached' }), A('e_sweep', 25)],
  phases: [{ hpBelow: 0.5, element: 'fire', weakness: ['water'], message: '수호기의 노심이 과열된다! 원소가 불로 바뀌었다 — 약점: 물',
    ai: [A('guardian_meltdown', 100, { cond: { turnEvery: 3 } }), A('guardian_overheat', 45), A('golem_slam', 40, { target: 'lowestHp' })] }] });

// ─── 지역 5: 대지의 심연 ───
E({ id: 'deep_mole', name: '심연 두더지', region: 5, level: 19, el: 'earth', shape: 'beast', m: { hp: 1.1, atk: 1.1 },
  desc: '갱도를 파고드는 거대 두더지.', ai: [A('e_claw', 55), A('e_sunder', 25), A('e_guard', 20, { cond: { selfHpBelow: 0.5 } })] });
E({ id: 'crystal_golem', name: '수정 골렘', region: 5, level: 20, el: 'earth', shape: 'golem', m: { def: 1.5, res: 0.8, spd: 0.8, hp: 1.2 },
  desc: '수정으로 이루어진 골렘. 마법에 약하다.', ai: [A('e_slam', 60), A('e_charge_smash', 25, { cond: { minTurn: 1 } }), A('e_guard', 15)] });
E({ id: 'magma_worm', name: '용암 벌레', region: 5, level: 21, el: 'fire', shape: 'insect', m: { mag: 1.2, hp: 1.05 },
  desc: '용암 속을 헤엄치는 벌레.', ai: [A('e_burn_touch', 45), A('e_breath', 35), A('e_bite', 20)] });
E({ id: 'fallen_miner', name: '타락한 광부', region: 5, level: 22, el: 'lightning', shape: 'humanoid', m: { atk: 1.15 },
  desc: '공허에 홀린 드워프 광부.', ai: [A('e_double', 40), A('e_stun_blow', 30), A('e_bolt', 30, { target: 'attached' })] });
E({ id: 'stone_guard', name: '돌 근위병', region: 5, level: 21, el: 'earth', shape: 'knight', m: { def: 1.4, hp: 1.1, spd: 0.9 },
  desc: '드워프 왕의 근위병. 공허에 물들었다.', ai: [A('e_claw', 50), A('e_sunder', 30), A('e_guard', 20)] });
E({ id: 'traitor_general', name: '배신자 장군 그롬', region: 5, level: 23, el: 'water', rank: 'elite', shape: 'knight', m: { atk: 1.15, def: 1.2 },
  desc: '왕을 공허에 팔아넘긴 장군. 바르크의 원수.', ai: [A('e_claw', 35), A('e_sweep', 25), A('e_stun_blow', 20), A('e_charge_smash', 20, { cond: { minTurn: 2 } })] });
E({ id: 'dwarf_king', name: '타락한 드워프 왕', region: 5, level: 24, el: 'earth', rank: 'boss', bossHp: 8, shape: 'king', m: { def: 1.2, atk: 1.1 },
  desc: '대지의 신전을 품은 왕국의 왕. 암석 갑주를 깨야 피해가 들어간다.', legendary: 'lg_king_axe',
  ai: [A('king_barrier', 100, { cond: { noShield: true, turnEvery: 3 } }), A('king_quake', 100, { cond: { turnEvery: 4 } }), A('king_hammer', 55, { target: 'attached' }), A('king_rally', 25, { cond: { summonsBelow: 2 } })],
  phases: [{ hpBelow: 0.5, message: '왕의 갑주가 검게 물든다. "이 왕국은... 영원히 내 것이다!"', onEnter: 'king_barrier',
    ai: [A('king_barrier', 100, { cond: { noShield: true, turnEvery: 2 } }), A('king_quake', 100, { cond: { turnEvery: 3 } }), A('king_hammer', 55, { target: 'lowestHp' }), A('king_rally', 30, { cond: { summonsBelow: 3 } })] }] });

// ─── 지역 6: 공허의 첨탑 ───
E({ id: 'void_hound', name: '공허 사냥개', region: 6, level: 23, el: 'wind', shape: 'beast', m: { spd: 1.15, atk: 1.1 },
  desc: '색이 빠진 사냥개. 원소 냄새를 쫓는다.', ai: [A('e_bite', 50, { target: 'attached' }), A('e_double', 30), A('e_howl', 20)] });
E({ id: 'void_knight', name: '공허 기사', region: 6, level: 24, el: 'earth', shape: 'knight', m: { def: 1.35, hp: 1.15 },
  desc: '공허에 영혼을 판 기사.', ai: [A('e_claw', 45), A('e_sunder', 30), A('e_charge_smash', 25, { cond: { minTurn: 1 } })] });
E({ id: 'void_mage', name: '공허 술사', region: 6, level: 25, el: 'water', shape: 'mage', m: { mag: 1.25, hp: 0.9, res: 1.2 },
  desc: '원소를 지우는 주문을 쓴다.', ai: [A('e_breath', 35), A('e_hex', 25), A('e_drain', 25), A('e_mend', 15, { cond: { allyHpBelow: 0.5 } })] });
E({ id: 'void_eye', name: '공허의 눈', region: 6, level: 26, el: 'lightning', shape: 'eye', m: { mag: 1.2, spd: 1.05 },
  desc: '모든 것을 지켜보는 눈. 큰 주문을 준비한다.', ai: [A('e_bolt', 45, { target: 'attached' }), A('e_shriek', 20), A('e_charge_nova', 35, { cond: { minTurn: 1 } })] });
E({ id: 'void_flame', name: '공허의 불꽃', region: 6, level: 25, el: 'fire', shape: 'wisp', m: { mag: 1.2, hp: 0.9 },
  desc: '차가운 잿빛 불꽃.', ai: [A('e_burn_touch', 50), A('e_breath', 50)] });
E({ id: 'void_herald', name: '공허의 전령', region: 6, level: 27, el: 'lightning', rank: 'elite', shape: 'eye', m: { mag: 1.25 },
  desc: '옛 계승자의 말을 전하는 존재.', ai: [A('e_breath', 30), A('e_charge_nova', 25, { cond: { minTurn: 1 } }), A('e_drain', 25), A('void_silence', 20)] });
E({ id: 'void_heir', name: '공허의 계승자 아스텔', region: 6, level: 28, el: 'water', rank: 'boss', bossHp: 10.5, bg: 10, shape: 'heir', m: { mag: 1.2, atk: 1.2, def: 1.1, res: 1.1, spd: 1.05 },
  desc: '원소의 힘을 독점하려다 공허가 된 옛 계승자. 페이즈마다 원소가 바뀌고, 아군의 반응을 따라 한다.',
  ai: [A('void_erase', 100, { cond: { turnEvery: 5 } }), A('void_mimic', 35, { cond: { minTurn: 1 } }), A('void_lance', 45, { target: 'attached' }), A('void_drain', 20)],
  phases: [
    { hpBelow: 0.66, element: 'earth', weakness: ['wind'], message: '아스텔의 몸이 대지의 색으로 물든다 — 약점: 바람',
      ai: [A('void_erase', 100, { cond: { turnEvery: 4 } }), A('void_mimic', 40), A('void_lance', 35, { target: 'attached' }), A('void_silence', 25)] },
    { hpBelow: 0.33, element: 'wind', weakness: ['fire'], actionsPerTurn: 2, message: '"이 힘은 나 하나로 충분했어!" 아스텔이 폭주한다 — 약점: 불, 2회 행동',
      ai: [A('void_erase', 100, { cond: { turnEvery: 4 } }), A('void_mimic', 40), A('void_lance', 35, { target: 'lowestHp' }), A('void_drain', 25)] }] });

fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log(out.length, 'enemies');
for (const e of out) console.log(e.id.padEnd(18), e.rank.padEnd(7), 'L' + e.level, JSON.stringify(e.stats), 'exp', e.exp, 'g', e.gold);
