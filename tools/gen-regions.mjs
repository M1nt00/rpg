import fs from 'fs';
const LINKS = [[0,1],[0,2],[1,3],[1,4],[2,4],[2,5],[3,6],[4,6],[4,7],[5,7],[6,8],[6,9],[7,9],[7,10],[8,11],[9,11],[9,12],[10,12],[11,13],[12,13],[13,14]];
const POS = [[0,2],[1,1],[1,3],[2,0],[2,2],[2,4],[3,1],[3,3],[4,0],[4,2],[4,4],[5,1],[5,3],[6,2],[7,2]];
const TYPES = ['town','battle','battle','chest','battle','event','battle','rest','elite','event','battle','battle','chest','rest','boss'];
function build(rid, { flip = false, types = {}, enc, chests, events, labels = {} }) {
  const nodes = POS.map(([x, y], i) => {
    const id = `${rid}_n${i}`;
    const type = types[i] || TYPES[i];
    const n = { id, type, x, y: flip ? 4 - y : y, links: [] };
    if (enc[i]) n.encounter = enc[i];
    if (chests[i]) n.chest = chests[i];
    if (events[i]) n.event = events[i];
    if (labels[i]) n.label = labels[i];
    return n;
  });
  for (const [a, b] of LINKS) { nodes[a].links.push(nodes[b].id); nodes[b].links.push(nodes[a].id); }
  for (const n of nodes) if ((n.type === 'battle' || n.type === 'elite' || n.type === 'boss') && !n.encounter) throw new Error('no enc ' + n.id);
  for (const n of nodes) if (n.type === 'event' && !n.event) throw new Error('no event ' + n.id);
  for (const n of nodes) if (n.type === 'chest' && !n.chest) throw new Error('no chest ' + n.id);
  return nodes;
}
const regions = [
  { id: 'r1', index: 1, name: '잿빛 평원', element: 'fire', mood: '불타버린 초원', town: '잿골 마을', ally: 'kyle', material: 'ember_ore', levelRange: [1, 6],
    pool: ['ash_wolf', 'ember_slime', 'dust_beetle', 'void_wisp'], color: '#c8643c', wx: 14, wy: 70,
    introScene: 'r1_intro', bossPreScene: 'r1_boss_pre', bossPostScene: 'r1_boss_post',
    nodes: build('r1', {
      labels: { 0: '잿골 마을', 14: '불의 신전' },
      enc: { 1: ['ash_wolf', 'ash_wolf'], 2: ['ember_slime'], 4: ['ember_slime', 'ash_wolf'], 6: ['dust_beetle', 'ash_wolf'], 8: ['fallen_captain'],
        10: ['void_wisp', 'ember_slime'], 11: ['dust_beetle', 'void_wisp', 'ash_wolf'], 14: ['ash_golem'] },
      chests: { 3: { gold: 60, items: [{ id: 'potion', n: 2 }] }, 12: { gold: 40, items: [{ id: 'stone_water', n: 2 }], equip: 'rare' } },
      events: { 5: 'ev_traveler', 9: 'ev_altar' } }) },
  { id: 'r2', index: 2, name: '물안개 호수', element: 'water', mood: '수상 마을, 안개 미궁', town: '안개나루', ally: 'serin', material: 'mist_pearl', levelRange: [6, 11],
    pool: ['mist_frog', 'lake_serpent', 'reed_sprite', 'drowned_soldier'], color: '#4a8fc8', wx: 30, wy: 40,
    introScene: 'r2_intro', bossPreScene: 'r2_boss_pre', bossPostScene: 'r2_boss_post',
    nodes: build('r2', { flip: true,
      labels: { 0: '안개나루', 9: '호숫가 오두막', 14: '물의 신전' },
      enc: { 1: ['mist_frog', 'mist_frog'], 2: ['lake_serpent', 'mist_frog'], 4: ['reed_sprite', 'lake_serpent'], 6: ['drowned_soldier', 'reed_sprite'],
        8: ['mist_heretic', 'reed_sprite'], 10: ['drowned_soldier', 'lake_serpent', 'mist_frog'], 11: ['reed_sprite', 'drowned_soldier', 'lake_serpent'], 14: ['lake_witch'] },
      chests: { 3: { gold: 120, items: [{ id: 'ether', n: 1 }, { id: 'stone_lightning', n: 2 }] }, 12: { gold: 90, items: [{ id: 'stone_lightning', n: 2 }], equip: 'rare' } },
      events: { 5: 'ev_spring', 9: 'ev_hut' } }) },
  { id: 'r3', index: 3, name: '바람의 협곡', element: 'wind', mood: '절벽 위 공중 다리', town: '구름다리 마을', ally: 'arin', material: 'storm_feather', levelRange: [11, 16],
    pool: ['cliff_harpy', 'rock_lizard', 'storm_hawk', 'canyon_bandit'], color: '#5fb98a', wx: 50, wy: 20,
    introScene: 'r3_intro', bossPreScene: 'r3_boss_pre', bossPostScene: 'r3_boss_post',
    nodes: build('r3', {
      labels: { 0: '구름다리 마을', 14: '바람의 신전' },
      enc: { 1: ['cliff_harpy', 'cliff_harpy'], 2: ['rock_lizard', 'cliff_harpy'], 4: ['storm_hawk', 'rock_lizard'], 6: ['canyon_bandit', 'canyon_bandit'],
        8: ['wind_wraith', 'cliff_harpy'], 10: ['storm_hawk', 'canyon_bandit', 'cliff_harpy'], 11: ['rock_lizard', 'storm_hawk', 'canyon_bandit'], 14: ['storm_griffon'] },
      chests: { 3: { gold: 200, items: [{ id: 'hipotion', n: 1 }, { id: 'stone_fire', n: 2 }] }, 12: { gold: 160, items: [{ id: 'feather', n: 1 }], equip: 'rare' } },
      events: { 5: 'ev_merchant', 9: 'ev_mushroom' } }) },
  { id: 'r4', index: 4, name: '뇌운 고원', element: 'lightning', mood: '폭풍 치는 고지대 유적', town: '뇌운 요새', ally: 'doyun', material: 'thunder_crystal', levelRange: [15, 20],
    pool: ['thunder_ram', 'ruin_sentinel', 'static_imp', 'cloud_jelly'], color: '#9a7ce0', wx: 72, wy: 30,
    introScene: 'r4_intro', bossPreScene: 'r4_boss_pre', bossPostScene: 'r4_boss_post',
    nodes: build('r4', { flip: true,
      labels: { 0: '뇌운 요새', 14: '번개의 신전' },
      enc: { 1: ['thunder_ram', 'static_imp'], 2: ['ruin_sentinel', 'thunder_ram'], 4: ['cloud_jelly', 'static_imp', 'thunder_ram'], 6: ['ruin_sentinel', 'cloud_jelly'],
        8: ['rampant_doll', 'static_imp'], 10: ['thunder_ram', 'ruin_sentinel', 'static_imp'], 11: ['cloud_jelly', 'ruin_sentinel', 'static_imp', 'thunder_ram'], 14: ['thunder_guardian'] },
      chests: { 3: { gold: 300, items: [{ id: 'enh_stone_hi', n: 1 }, { id: 'stone_earth', n: 2 }] }, 12: { gold: 260, items: [{ id: 'hipotion', n: 2 }], equip: 'epic' } },
      events: { 5: 'ev_tablet', 9: 'ev_rift' } }) },
  { id: 'r5', index: 5, name: '대지의 심연', element: 'earth', mood: '지하 드워프 왕국', town: '돌망치 성채', ally: 'bark', material: 'deep_gem', levelRange: [19, 24],
    pool: ['deep_mole', 'crystal_golem', 'magma_worm', 'fallen_miner'], color: '#b08850', wx: 84, wy: 66,
    introScene: 'r5_intro', bossPreScene: 'r5_boss_pre', bossPostScene: 'r5_boss_post',
    nodes: build('r5', {
      labels: { 0: '돌망치 성채', 10: '무너진 갱도', 14: '대지의 신전' },
      enc: { 1: ['deep_mole', 'magma_worm'], 2: ['crystal_golem', 'deep_mole'], 4: ['fallen_miner', 'magma_worm', 'deep_mole'], 6: ['crystal_golem', 'fallen_miner'],
        8: ['traitor_general', 'stone_guard'], 10: ['magma_worm', 'fallen_miner', 'crystal_golem'], 11: ['deep_mole', 'stone_guard', 'fallen_miner', 'magma_worm'], 14: ['dwarf_king'] },
      chests: { 3: { gold: 420, items: [{ id: 'enh_stone_hi', n: 2 }, { id: 'stone_wind', n: 2 }] }, 12: { gold: 380, items: [{ id: 'feather', n: 1 }, { id: 'ether', n: 2 }], equip: 'epic' } },
      events: { 5: 'ev_lost_miner', 9: 'ev_chest_mimic' } }) },
  { id: 'r6', index: 6, name: '공허의 첨탑', element: 'none', mood: '색이 빠진 세계', levelRange: [23, 28],
    pool: ['void_hound', 'void_knight', 'void_mage', 'void_eye', 'void_flame'], color: '#8a8a96', wx: 56, wy: 62,
    introScene: 'r6_intro', bossPreScene: 'r6_boss_pre', bossPostScene: 'ending',
    nodes: build('r6', { flip: true,
      types: { 0: 'start' },
      labels: { 0: '최후의 야영지', 14: '첨탑 꼭대기' },
      enc: { 1: ['void_hound', 'void_flame'], 2: ['void_knight', 'void_hound'], 4: ['void_mage', 'void_knight', 'void_hound'], 6: ['void_eye', 'void_flame'],
        8: ['void_herald', 'void_mage'], 10: ['void_knight', 'void_eye', 'void_flame'], 11: ['void_hound', 'void_mage', 'void_eye', 'void_knight'], 14: ['void_heir'] },
      chests: { 3: { gold: 500, items: [{ id: 'hipotion', n: 2 }, { id: 'feather', n: 1 }] }, 12: { gold: 500, items: [{ id: 'ether', n: 3 }], equip: 'epic' } },
      events: { 5: 'ev_rift', 9: 'ev_memory' } }) },
];
fs.writeFileSync(process.argv[2], JSON.stringify(regions, null, 1));
console.log('ok', regions.length);
