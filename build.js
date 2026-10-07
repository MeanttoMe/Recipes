const fs = require('fs');

function getProp(page, name) {
  return page.properties[name] || null;
}
function getTitle(prop) {
  if (!prop || prop.type !== 'title') return '';
  return prop.title.map(t => t.plain_text).join('');
}
function getSelect(prop) {
  if (!prop || prop.type !== 'select' || !prop.select) return '';
  return prop.select.name || '';
}
function getMultiSelect(prop) {
  if (!prop || prop.type !== 'multi_select') return [];
  return prop.multi_select.map(s => s.name);
}
function getRich(prop) {
  if (!prop || prop.type !== 'rich_text') return '';
  return prop.rich_text.map(t => t.plain_text).join('\n');
}
function getUrl(prop) {
  if (!prop || prop.type !== 'url') return '';
  return prop.url || '';
}

async function main() {
  const raw = JSON.parse(fs.readFileSync('recipes.json', 'utf8'));
  const results = raw.results || [];
  console.log(`Found ${results.length} pages`);

  const recipes = results.map(page => {
    const 요리명 = getTitle(getProp(page, '요리명'));
    const 난이도 = getSelect(getProp(page, '난이도'));
    const 상태 = getSelect(getProp(page, '상태'));
    const 세프 = getSelect(getProp(page, '세프/출처')) || getMultiSelect(getProp(page, '세프/출처')).join(',');
    const 소요시간 = getSelect(getProp(page, '소요시간'));
    const 카테고리 = getMultiSelect(getProp(page, '카테고리'));
    const 태그 = getMultiSelect(getProp(page, '태그'));
    const 재료 = getRich(getProp(page, '재료'));
    const 조리법 = getRich(getProp(page, '조리법'));
    const 쿠팡1 = getUrl(getProp(page, '쿠팡제품1')) || getRich(getProp(page, '쿠팡제품1'));
    const 쿠팡2 = getProp(page, '쿠팡제품2') ? (getUrl(getProp(page, '쿠팡제품2')) || getRich(getProp(page, '쿠팡제품2'))) : '';
    const 쿠팡3 = getProp(page, '쿠팡제품3') ? (getUrl(getProp(page, '쿠팡제품3')) || getRich(getProp(page, '쿠팡제품3'))) : '';

    // 상태 필터 - 원하면 주석 처리
    // if (상태 && 상태 !== '즐겨찾기' && 상태 !== '도전예정') -> 전부 보여주기로

    return {
      id: page.id,
      title: 요리명 || '제목 없음',
      difficulty: 난이도,
      status: 상태,
      chef: 세프,
      time: 소요시간,
      categories: 카테고리,
      tags: 태그,
      ingredients: 재료,
      steps: 조리법,
      coupang: [쿠팡1, 쿠팡2, 쿠팡3].filter(Boolean),
      url: page.url,
      cover: page.cover ? (page.cover.external ? page.cover.external.url : (page.cover.file ? page.cover.file.url : '')) : ''
    };
  }).filter(r => r.title !== '제목 없음');

  if (!fs.existsSync('dist')) fs.mkdirSync('dist', {recursive:true});
  fs.writeFileSync('dist/site-data.json', JSON.stringify(recipes, null, 2), 'utf8');
  console.log(`Wrote ${recipes.length} recipes to dist/site-data.json`);

  // index.html 생성
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>나의 레시피 북 - Notion 연동</title>
<style>
  *{box-sizing:border-box} body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; margin:0; background:#fafaf7; color:#111}
  header{text-align:center; padding:40px 20px 20px}
  header h1{font-size:32px; margin:0}
  header p{color:#666; margin-top:8px}
  .controls{max-width:1100px; margin:0 auto; padding:0 20px 20px; display:flex; gap:10px; flex-wrap:wrap}
  .controls input, .controls select{padding:10px 14px; border:1px solid #ddd; border-radius:10px; font-size:14px}
  .controls input{flex:1; min-width:200px}
  .grid{max-width:1100px; margin:0 auto; padding:0 20px 80px; display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:20px}
  .card{background:white; border-radius:16px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.06); display:flex; flex-direction:column}
  .card-cover{height:180px; background:#eee; background-size:cover; background-position:center}
  .card-body{padding:16px}
  .badge{display:inline-block; font-size:12px; padding:4px 8px; border-radius:20px; background:#f0f0f0; margin-right:6px; margin-bottom:6px}
  .badge.time{background:#e8f5e9} .badge.chef{background:#e3f2fd} .badge.diff{background:#fff3e0}
  .title{font-size:18px; font-weight:700; margin:8px 0}
  .desc{font-size:13px; color:#555; white-space:pre-wrap; line-height:1.5; max-height:80px; overflow:hidden}
  .tags{margin-top:10px}
  .coupang{margin-top:12px}
  .coupang a{display:inline-block; font-size:12px; color:#0b5fff; text-decoration:none; margin-right:10px}
  .empty{grid-column:1/-1; text-align:center; padding:60px; color:#999}
</style>
</head>
<body>
<header>
  <h1>🍳 나의 레시피 북</h1>
  <p>Notion에서 자동으로 업데이트됩니다 - 총 <span id="count">0</span>개</p>
</header>
<div class="controls">
  <input id="search" placeholder="요리명, 재료, 셰프 검색...">
  <select id="filterChef"><option value="">세프/출처 전체</option></select>
  <select id="filterTime"><option value="">소요시간 전체</option></select>
  <select id="filterStatus"><option value="">상태 전체</option></select>
</div>
<div class="grid" id="grid"></div>
<script>
let data=[];
async function load(){
  const res = await fetch('site-data.json');
  data = await res.json();
  initFilters();
  render();
}
function initFilters(){
  const chefs = [...new Set(data.map(d=>d.chef).filter(Boolean))];
  const times = [...new Set(data.map(d=>d.time).filter(Boolean))];
  const statuses = [...new Set(data.map(d=>d.status).filter(Boolean))];
  const chefSel = document.getElementById('filterChef');
  const timeSel = document.getElementById('filterTime');
  const statusSel = document.getElementById('filterStatus');
  chefs.forEach(c=>{ const o=document.createElement('option'); o.value=c; o.textContent=c; chefSel.appendChild(o); });
  times.forEach(t=>{ const o=document.createElement('option'); o.value=t; o.textContent=t; timeSel.appendChild(o); });
  statuses.forEach(s=>{ const o=document.createElement('option'); o.value=s; o.textContent=s; statusSel.appendChild(o); });
}
function render(){
  const q = document.getElementById('search').value.toLowerCase();
  const chefF = document.getElementById('filterChef').value;
  const timeF = document.getElementById('filterTime').value;
  const statusF = document.getElementById('filterStatus').value;
  const grid = document.getElementById('grid');
  let filtered = data.filter(d=>{
    const matchQ = !q || d.title.toLowerCase().includes(q) || (d.ingredients && d.ingredients.toLowerCase().includes(q)) || (d.tags && d.tags.join(' ').toLowerCase().includes(q)) || (d.chef && d.chef.toLowerCase().includes(q));
    const matchChef = !chefF || d.chef===chefF;
    const matchTime = !timeF || d.time===timeF;
    const matchStatus = !statusF || d.status===statusF;
    return matchQ && matchChef && matchTime && matchStatus;
  });
  document.getElementById('count').textContent = filtered.length;
  if(filtered.length===0){ grid.innerHTML='<div class=empty>레시피가 없습니다. Notion에 재료를 추가해보세요!</div>'; return; }
  grid.innerHTML = filtered.map(r=>\`
    <div class="card">
      \${r.cover ? \`<div class="card-cover" style="background-image:url('\${r.cover}')"></div>\` : '<div class="card-cover" style="display:flex;align-items:center;justify-content:center;font-size:48px">🍳</div>'}
      <div class="card-body">
        <div>
          \${r.time ? \`<span class="badge time">⏱ \${r.time}</span>\` : ''}
          \${r.chef ? \`<span class="badge chef">👨‍🍳 \${r.chef}</span>\` : ''}
          \${r.difficulty ? \`<span class="badge diff">\${r.difficulty}</span>\` : ''}
          \${r.status ? \`<span class="badge">\${r.status}</span>\` : ''}
        </div>
        <div class="title">\${r.title}</div>
        <div class="desc">\${(r.ingredients || r.steps || '').substring(0,120)}</div>
        <div class="tags">\${(r.categories||[]).map(c=>\`<span class="badge">\${c}</span>\`).join('')} \${(r.tags||[]).map(t=>\`<span class="badge" style="background:#f3e5f5">\${t}</span>\`).join('')}</div>
        \${r.coupang && r.coupang.length ? \`<div class="coupang">\${r.coupang.map((u,i)=>\`<a href="\${u}" target="_blank">🛒 쿠팡 \${i+1}</a>\`).join('')}</div>\` : ''}
      </div>
    </div>
  \`).join('');
}
document.getElementById('search').addEventListener('input', render);
document.getElementById('filterChef').addEventListener('change', render);
document.getElementById('filterTime').addEventListener('change', render);
document.getElementById('filterStatus').addEventListener('change', render);
load();
</script>
</body>
</html>`;
  fs.writeFileSync('dist/index.html', html, 'utf8');
  // 루트에도 복사 (gh-pages에서)
  fs.writeFileSync('index.html', html, 'utf8');
  console.log('index.html created');
}
main();
