// 에셋 없이 SVG로 그리는 적 실루엣 · 캐릭터 초상화
import type { ElementOrNone } from '../types';
import { ELEMENT_COLOR } from '../data';

let seq = 0;

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

const EYES = (pts: [number, number][], r = 2.6) =>
  pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/><circle cx="${x}" cy="${y}" r="${r * 0.45}" fill="#111"/>`).join('');

const SHAPES: Record<string, string> = {
  beast: `<path d="M16 56 Q4 50 8 38" fill="none" stroke="url(#F)" stroke-width="6" stroke-linecap="round"/>
    <ellipse cx="46" cy="60" rx="30" ry="17"/><rect x="24" y="68" width="8" height="20" rx="3"/><rect x="38" y="70" width="8" height="18" rx="3"/>
    <rect x="54" y="70" width="8" height="18" rx="3"/><rect x="66" y="68" width="8" height="20" rx="3"/>
    <circle cx="74" cy="46" r="15"/><polygon points="64,36 68,20 76,34"/><polygon points="76,33 84,20 87,38"/>
    <polygon points="80,52 94,50 84,58" />${EYES([[79, 44]])}`,
  slime: `<path d="M12 84 Q8 50 50 22 Q92 50 88 84 Z"/><ellipse cx="38" cy="40" rx="8" ry="5" fill="#fff" opacity=".35"/>
    ${EYES([[38, 60], [62, 60]], 4)}<path d="M40 72 Q50 78 60 72" stroke="#111" stroke-width="2.5" fill="none"/>`,
  insect: `<g stroke="url(#F)" stroke-width="4" stroke-linecap="round"><line x1="30" y1="60" x2="14" y2="80"/><line x1="46" y1="64" x2="40" y2="88"/>
    <line x1="60" y1="64" x2="66" y2="88"/><line x1="72" y1="60" x2="88" y2="80"/><line x1="70" y1="34" x2="80" y2="14"/><line x1="76" y1="38" x2="94" y2="26"/></g>
    <ellipse cx="44" cy="54" rx="32" ry="20"/><path d="M44 34 L44 74" stroke="#000" stroke-opacity=".35" stroke-width="2"/>
    <circle cx="74" cy="44" r="12"/>${EYES([[78, 42]], 2.4)}`,
  wisp: `<path d="M50 8 C64 30 84 42 76 66 C70 88 30 88 24 66 C16 42 38 34 50 8Z"/>
    <path d="M50 34 C58 46 66 52 62 66 C58 78 42 78 38 66 C34 54 44 48 50 34Z" fill="#fff" opacity=".35"/>${EYES([[42, 60], [58, 60]], 3)}`,
  humanoid: `<circle cx="50" cy="22" r="12"/><path d="M32 38 L68 38 L64 70 L36 70 Z"/><rect x="22" y="40" width="10" height="28" rx="4"/>
    <rect x="68" y="40" width="10" height="28" rx="4"/><rect x="37" y="68" width="10" height="24" rx="3"/><rect x="53" y="68" width="10" height="24" rx="3"/>
    <line x1="80" y1="30" x2="86" y2="74" stroke="#ddd" stroke-width="3"/>${EYES([[45, 22], [55, 22]], 2)}`,
  knight: `<path d="M38 12 L62 12 L64 32 L36 32 Z"/><rect x="40" y="20" width="20" height="4" fill="#111"/><circle cx="46" cy="22" r="1.6" fill="#ff5"/><circle cx="54" cy="22" r="1.6" fill="#ff5"/>
    <path d="M28 36 L72 36 L66 72 L34 72 Z"/><rect x="38" y="70" width="10" height="22" rx="3"/><rect x="52" y="70" width="10" height="22" rx="3"/>
    <path d="M10 40 L28 40 L28 64 Q19 74 10 64 Z" stroke="#000" stroke-opacity=".3" stroke-width="2"/>
    <line x1="80" y1="14" x2="76" y2="76" stroke="#e6e6e6" stroke-width="4"/><line x1="70" y1="62" x2="86" y2="64" stroke="#e6e6e6" stroke-width="4"/>`,
  golem: `<rect x="30" y="10" width="40" height="26" rx="4"/><rect x="22" y="36" width="56" height="38" rx="6"/>
    <rect x="6" y="38" width="16" height="40" rx="5"/><rect x="78" y="38" width="16" height="40" rx="5"/>
    <rect x="28" y="74" width="16" height="18" rx="3"/><rect x="56" y="74" width="16" height="18" rx="3"/>
    <path d="M36 46 L44 56 L40 64 M60 44 L56 54 L64 62" stroke="#fff" stroke-opacity=".5" stroke-width="2" fill="none"/>
    <rect x="38" y="20" width="8" height="5" fill="#fff"/><rect x="54" y="20" width="8" height="5" fill="#fff"/>`,
  serpent: `<path d="M20 86 C10 66 40 62 46 50 C52 38 24 34 34 20 C42 10 64 12 66 24" fill="none" stroke="url(#F)" stroke-width="13" stroke-linecap="round"/>
    <ellipse cx="70" cy="24" rx="14" ry="10"/><path d="M82 26 L94 22 M82 28 L94 32" stroke="#f55" stroke-width="2"/>${EYES([[72, 20]], 2.4)}`,
  bird: `<path d="M50 44 L8 20 L22 52 Z"/><path d="M50 44 L92 20 L78 52 Z"/><ellipse cx="50" cy="56" rx="16" ry="22"/>
    <circle cx="50" cy="32" r="11"/><polygon points="46,36 54,36 50,46" fill="#f5c04a"/>
    <path d="M42 76 L38 92 M58 76 L62 92" stroke="url(#F)" stroke-width="4"/>${EYES([[45, 30], [55, 30]], 2)}`,
  ghost: `<path d="M18 88 L18 44 Q18 10 50 10 Q82 10 82 44 L82 88 L72 78 L62 88 L50 78 L38 88 L28 78 Z" opacity=".92"/>
    <ellipse cx="38" cy="42" rx="6" ry="9" fill="#111"/><ellipse cx="62" cy="42" rx="6" ry="9" fill="#111"/><ellipse cx="50" cy="62" rx="5" ry="7" fill="#111"/>`,
  mage: `<path d="M50 6 L68 34 L32 34 Z"/><circle cx="50" cy="34" r="10" fill="#222"/><circle cx="46" cy="34" r="1.8" fill="#9ff"/><circle cx="54" cy="34" r="1.8" fill="#9ff"/>
    <path d="M30 44 L70 44 L80 92 L20 92 Z"/><line x1="84" y1="22" x2="80" y2="92" stroke="#c9a46a" stroke-width="4"/>
    <circle cx="84" cy="20" r="7" fill="#fff" opacity=".8"/>`,
  witch: `<path d="M50 0 L64 26 L82 30 L18 30 L36 26 Z" fill="#2a2440"/><circle cx="50" cy="38" r="10"/>
    <path d="M38 34 Q30 60 26 70 M62 34 Q70 60 74 70" stroke="url(#F)" stroke-width="5" fill="none"/>
    <path d="M32 48 L68 48 L84 92 L16 92 Z"/><circle cx="46" cy="38" r="1.8" fill="#fff"/><circle cx="54" cy="38" r="1.8" fill="#fff"/>
    <circle cx="16" cy="56" r="7" fill="#fff" opacity=".7"/><circle cx="84" cy="56" r="7" fill="#fff" opacity=".7"/>`,
  griffon: `<path d="M48 40 L2 8 L14 50 Z"/><path d="M52 40 L98 8 L86 50 Z"/><ellipse cx="50" cy="62" rx="26" ry="18"/>
    <rect x="30" y="70" width="8" height="20" rx="3"/><rect x="62" y="70" width="8" height="20" rx="3"/>
    <circle cx="50" cy="34" r="13"/><polygon points="44,38 56,38 50,52" fill="#f5c04a"/>
    <path d="M76 60 Q94 62 92 80" fill="none" stroke="url(#F)" stroke-width="5"/>${EYES([[44, 31], [56, 31]], 2.4)}`,
  guardian: `<polygon points="30,6 38,22 24,22" /><polygon points="70,6 76,22 62,22"/><rect x="26" y="16" width="48" height="24" rx="6"/>
    <rect x="16" y="40" width="68" height="36" rx="8"/><rect x="2" y="40" width="14" height="42" rx="5"/><rect x="84" y="40" width="14" height="42" rx="5"/>
    <rect x="26" y="76" width="18" height="16" rx="3"/><rect x="56" y="76" width="18" height="16" rx="3"/>
    <circle cx="50" cy="58" r="10" fill="#fff" opacity=".85"/><circle cx="50" cy="58" r="5" fill="url(#F)"/>
    <rect x="34" y="24" width="32" height="6" rx="3" fill="#fff" opacity=".9"/>`,
  king: `<polygon points="34,6 40,16 50,4 60,16 66,6 66,22 34,22" fill="#f5c04a"/><circle cx="50" cy="30" r="11"/>
    <path d="M38 32 Q50 52 62 32" fill="#ddd"/><path d="M24 42 L76 42 L70 76 L30 76 Z"/>
    <rect x="34" y="74" width="12" height="18" rx="3"/><rect x="54" y="74" width="12" height="18" rx="3"/>
    <line x1="84" y1="20" x2="84" y2="86" stroke="#8a6a40" stroke-width="5"/><rect x="72" y="12" width="24" height="16" rx="3"/>
    <circle cx="46" cy="28" r="1.8" fill="#f33"/><circle cx="54" cy="28" r="1.8" fill="#f33"/>`,
  eye: `<path d="M20 70 Q10 90 2 88 M36 78 Q34 96 26 98 M64 78 Q66 96 74 98 M80 70 Q90 90 98 88" stroke="url(#F)" stroke-width="5" fill="none"/>
    <circle cx="50" cy="48" r="34"/><circle cx="50" cy="48" r="20" fill="#fff"/><circle cx="50" cy="48" r="11" fill="url(#F)"/><circle cx="50" cy="48" r="5" fill="#000"/>`,
  heir: `<circle cx="50" cy="50" r="46" fill="none" stroke="url(#F)" stroke-width="2" stroke-dasharray="4 6" opacity=".8"/>
    <path d="M30 34 Q20 70 14 92 L86 92 Q80 70 70 34 Z" fill="#3a3a44"/><circle cx="50" cy="24" r="12"/>
    <path d="M38 36 L62 36 L60 78 L40 78 Z"/><path d="M38 20 Q50 6 62 20" stroke="#ddd" stroke-width="3" fill="none"/>
    <circle cx="45" cy="24" r="2" fill="#fff"/><circle cx="55" cy="24" r="2" fill="#fff"/>
    <circle cx="20" cy="40" r="5"/><circle cx="80" cy="40" r="5"/><circle cx="50" cy="90" r="5"/>`,
};

export function enemySvg(shape: string | undefined, el: ElementOrNone): string {
  const id = 'g' + seq++;
  const c = ELEMENT_COLOR[el];
  const body = (SHAPES[shape ?? 'slime'] ?? SHAPES.slime).replace(/url\(#F\)/g, `url(#${id})`);
  return `<svg viewBox="0 0 100 100" class="enemy-svg" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(c, 50)}"/><stop offset=".55" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, -80)}"/></linearGradient></defs>
    <g fill="url(#${id})" stroke="${shade(c, -110)}" stroke-width="1.5" stroke-linejoin="round">${body}</g></svg>`;
}

export function portraitSvg(color: string, glyph: string, el: ElementOrNone): string {
  const id = 'p' + seq++;
  const ring = ELEMENT_COLOR[el];
  return `<svg viewBox="0 0 100 100" class="portrait-svg" aria-hidden="true">
    <defs><radialGradient id="${id}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="${shade(color, 70)}"/><stop offset=".6" stop-color="${color}"/><stop offset="1" stop-color="${shade(color, -90)}"/></radialGradient></defs>
    <circle cx="50" cy="50" r="46" fill="url(#${id})" stroke="${ring}" stroke-width="5"/>
    <path d="M22 78 Q50 58 78 78 Q72 92 50 94 Q28 92 22 78Z" fill="#000" opacity=".22"/>
    <text x="50" y="63" text-anchor="middle" font-size="40" font-weight="800" fill="#fff" style="paint-order:stroke" stroke="#0006" stroke-width="3">${glyph}</text></svg>`;
}
