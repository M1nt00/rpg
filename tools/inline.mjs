// dist/ 빌드 결과를 HTML 한 파일로 합친다 → 더블클릭(file://)으로도 실행되는 play.html
import fs from 'fs';
import path from 'path';

const dist = path.resolve('dist');
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet"[^>]*href="\.?\/?([^"]+\.css)"[^>]*>/g, (_, href) =>
  `<style>${fs.readFileSync(path.join(dist, href), 'utf8')}</style>`);
html = html.replace(/<script type="module"[^>]*src="\.?\/?([^"]+\.js)"[^>]*><\/script>/g, (_, src) => {
  const code = fs.readFileSync(path.join(dist, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${code}</script>`;
});
html = html.replace(/<script id="dev-guard">[\s\S]*?<\/script>/, '');
if (/src="\.?\/?assets\//.test(html) || /href="\.?\/?assets\//.test(html)) throw new Error('인라인되지 않은 에셋이 남아 있어요');
const out = process.argv[2] ?? 'play.html';
fs.writeFileSync(out, html);
console.log(`${out} (${Math.round(html.length / 1024)} KB)`);
