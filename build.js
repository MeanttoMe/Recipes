
const fs = require('fs');

function getProp(page, name) {
  // 정확한 이름 + trim + 부분일치까지
  if (page.properties[name]) return page.properties[name];
  const key = Object.keys(page.properties).find(k => k.trim() === name.trim() || k.includes(name));
  return key ? page.properties[key] : null;
}
function extractText(prop) {
  if (!prop) return '';
  if (prop.type === 'title' && prop.title) return prop.title.map(t=>t.plain_text).join('\n');
  if (prop.type === 'rich_text' && prop.rich_text) return prop.rich_text.map(t=>t.plain_text).join('\n');
  if (prop.type === 'text' && prop.text) return prop.text.map(t=>t.plain_text).join('\n'); // old API
  if (prop.type === 'select' && prop.select) return prop.select.name || '';
  if (prop.type === 'multi_select' && prop.multi_select) return prop.multi_select.map(s=>s.name).join(', ');
  if (prop.type === 'url' && prop.url) return prop.url;
  if (prop.type === 'formula' && prop.formula) {
    if (prop.formula.string) return prop.formula.string;
    if (prop.formula.number) return String(prop.formula.number);
  }
  // fallback: any array with plain_text
  if (Array.isArray(prop)) return prop.map(t=>t.plain_text||'').join('\n');
  return '';
}
function getFiles(prop) {
  if (!prop || prop.type !== 'files' || !prop.files) return '';
  if (prop.files.length===0) return '';
  const f = prop.files[0];
  return f.file ? f.file.url : (f.external ? f.external.url : '');
}

async function main(){
  const raw = JSON.parse(fs.readFileSync('recipes.json','utf8'));
  const results = raw.results || [];
  console.log('Found', results.length);
  // debug first page props
  if(results[0]){
    console.log('Props of first:', Object.keys(results[0].properties));
    for(const k of Object.keys(results[0].properties)){
      const p = results[0].properties[k];
      console.log(k, 'type=', p.type, 'sample=', JSON.stringify(p).substring(0,200));
    }
  }

  const recipes = results.map(page=>{
    const title = extractText(getProp(page,'요리명')) || '제목 없음';
    const difficulty = extractText(getProp(page,'난이도'));
    const status = extractText(getProp(page,'상태'));
    const chef = extractText(getProp(page,'세프/출처'));
    const time = extractText(getProp(page,'소요시간'));
    const categories = (getProp(page,'카테고리')?.multi_select||[]).map(s=>s.name);
    const tags = (getProp(page,'태그')?.multi_select||[]).map(s=>s.name);
    const ing = extractText(getProp(page,'재료'));
    const steps = extractText(getProp(page,'조리법'));
    const coup1 = extractText(getProp(page,'쿠팡제품1'));
    const coup2 = extractText(getProp(page,'쿠팡제품2'));
    const coup3 = extractText(getProp(page,'쿠팡제품3'));
    const imgProp = getFiles(getProp(page,'이미지')) || getFiles(getProp(page,'사진')) || getFiles(getProp(page,'Image'));
    const cover = page.cover ? (page.cover.external?.url || page.cover.file?.url || '') : '';
    console.log('Recipe', title, 'ing len', ing.length, 'steps len', steps.length);
    return {
      id: page.id,
      title,
      difficulty,
      status,
      chef,
      time,
      categories,
      tags,
      ingredients: ing,
      steps: steps,
      coupang: [coup1,coup2,coup3].filter(Boolean),
      url: page.url,
      cover: cover || imgProp
    };
  }).filter(r=>r.title!=='제목 없음');

  fs.mkdirSync('dist',{recursive:true});
  fs.writeFileSync('dist/site-data.json', JSON.stringify(recipes,null,2),'utf8');
  console.log('Wrote', recipes.length);

  const html = fs.readFileSync('index.html','utf8'); // reuse existing index.html template if exists? We'll generate new one
  // Use the previous modal template
  const finalHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>나의 레시피 북</title>
<style>
*{box-sizing:border-box} body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; margin:0; background:#fafaf7; color:#111}
header{text-align:center; padding:40px 20px 20px} header h1{font-size:32px; margin:0} header p{color:#666; margin-top:8px}
.controls{max-width:1100px; margin:0 auto; padding:0 20px 20px; display:flex; gap:10px; flex-wrap:wrap}
.controls input, .controls select{padding:10px 14px; border:1px solid #ddd; border-radius:10px; font-size:14px} .controls input{flex:1; min-width:200px}
.grid{max-width:1100px; margin:0 auto; padding:0 20px 80px; display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:20px}
.card{background:white; border-radius:16px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,.06); display:flex; flex-direction:column; cursor:pointer; transition:transform .15s, box-shadow .15s}
.card:hover{transform:translateY(-4px); box-shadow:0 8px 24px rgba(0,0,0,.12)}
.card-cover{height:180px; background:#f1f1ef; background-size:cover; background-position:center; display:flex; align-items:center; justify-content:center; font-size:48px}
.card-body{padding:16px}
.badge{display:inline-block; font-size:12px; padding:4px 8px; border-radius:20px; background:#f0f0f0; margin-right:6px; margin-bottom:6px}
.badge.time{background:#e8f5e9} .badge.chef{background:#e3f2fd} .badge.diff{background:#fff3e0}
.title{font-size:18px; font-weight:700; margin:8px 0; line-height:1.3}
.tags{margin-top:10px}
.modal-overlay{display:none; position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:1000; align-items:center; justify-content:center; padding:20px}
.modal-overlay.open{display:flex}
.modal{background:white; border-radius:20px; max-width:720px; width:100%; max-height:90vh; overflow-y:auto; position:relative}
.modal-cover{height:260px; background:#eee; background-size:cover; background-position:center}
.modal-close{position:absolute; top:12px; right:12px; width:36px; height:36px; border-radius:50%; background:white; border:none; font-size:20px; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,.15)}
.modal-body{padding:24px} .modal-body h2{margin:0 0 12px; font-size:24px}
.modal-section{margin-top:20px} .modal-section h3{font-size:16px; margin:0 0 8px; border-left:4px solid #111; padding-left:8px}
.modal-section pre{white-space:pre-wrap; font-family:inherit; background:#fafaf7; padding:12px; border-radius:10px; font-size:14px; line-height:1.6}
.coupang a{display:inline-block; margin:6px 10px 0 0; font-size:13px; color:#fff; background:#0073e9; padding:8px 14px; border-radius:8px; text-decoration:none}
.empty{grid-column:1/-1; text-align:center; padding:60px; color:#999}
</style>
</head>
<body>
<header><h1>🍳 나의 레시피 북</h1><p>Notion에서 자동으로 업데이트됩니다 - 총 <span id="count">0</span>개 · 카드를 클릭해보세요!</p></header>
<div class="controls"><input id="search" placeholder="요리명, 재료, 셰프 검색..."><select id="filterChef"><option value="">세프/출처 전체</option></select><select id="filterTime"><option value="">소요시간 전체</option></select><select id="filterStatus"><option value="">상태 전체</option></select></div>
<div class="grid" id="grid"></div>
<div class="modal-overlay" id="modal"><div class="modal" id="modalBox"><button class="modal-close" onclick="closeModal()">✕</button><div class="modal-cover" id="mCover"></div><div class="modal-body"><div id="mBadges"></div><h2 id="mTitle"></h2><div id="mTags"></div><div class="modal-section"><h3>🥕 재료</h3><pre id="mIng"></pre></div><div class="modal-section"><h3>👩‍🍳 조리법</h3><pre id="mSteps"></pre></div><div class="modal-section" id="mCoupangWrap"><h3>🛒 쿠팡 제품</h3><div id="mCoupang" class="coupang"></div></div><div style="margin-top:20px"><a id="mNotion" target="_blank" style="color:#666; font-size:13px">Notion에서 열기 →</a></div></div></div></div>
<script>
let data=[];
async function load(){
  const res = await fetch('site-data.json?v='+Date.now());
  data = await res.json();
  initFilters(); render();
}
function initFilters(){
  const chefs=[...new Set(data.map(d=>d.chef).filter(Boolean))];
  const times=[...new Set(data.map(d=>d.time).filter(Boolean))];
  const statuses=[...new Set(data.map(d=>d.status).filter(Boolean))];
  const add=(sel,list)=>{ list.forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; sel.appendChild(o); }); };
  add(document.getElementById('filterChef'),chefs);
  add(document.getElementById('filterTime'),times);
  add(document.getElementById('filterStatus'),statuses);
}
function render(){
  const q=document.getElementById('search').value.toLowerCase();
  const chefF=document.getElementById('filterChef').value;
  const timeF=document.getElementById('filterTime').value;
  const statusF=document.getElementById('filterStatus').value;
  const grid=document.getElementById('grid');
  let filtered=data.filter(d=>{
    const matchQ=!q||d.title.toLowerCase().includes(q)||(d.ingredients&&d.ingredients.toLowerCase().includes(q))||(d.tags&&d.tags.join(' ').toLowerCase().includes(q))||(d.chef&&d.chef.toLowerCase().includes(q));
    return matchQ && (!chefF||d.chef===chefF) && (!timeF||d.time===timeF) && (!statusF||d.status===statusF);
  });
  document.getElementById('count').textContent=filtered.length;
  if(filtered.length===0){ grid.innerHTML='<div class=empty>레시피가 없습니다.</div>'; return; }
  grid.innerHTML=filtered.map((r,i)=>{
    const idx=data.indexOf(r);
    return \`<div class="card" onclick="openModal(\${idx})">\${r.cover ? \`<div class="card-cover" style="background-image:url('\${r.cover}')"></div>\` : \`<div class="card-cover">🍳</div>\`}<div class="card-body"><div>\${r.time? \`<span class="badge time">⏱ \${r.time}</span>\`:''} \${r.chef? \`<span class="badge chef">👨‍🍳 \${r.chef}</span>\`:''} \${r.difficulty? \`<span class="badge diff">⭐ \${r.difficulty}</span>\`:''} \${r.status? \`<span class="badge">\${r.status}</span>\`:''}</div><div class="title">\${r.title}</div><div class="tags">\${(r.categories||[]).map(c=>\`<span class="badge">\${c}</span>\`).join('')} \${(r.tags||[]).map(t=>\`<span class="badge" style="background:#f3e5f5">\${t}</span>\`).join('')}</div></div></div>\`;
  }).join('');
}
function openModal(idx){
  const r=data[idx];
  const coverEl=document.getElementById('mCover');
  coverEl.style.backgroundImage=r.cover? \`url('\${r.cover}')\`:'';
  coverEl.innerHTML=r.cover?'':'<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:64px">🍳</div>';
  document.getElementById('mBadges').innerHTML=\`\${r.time? \`<span class="badge time">⏱ \${r.time}</span>\`:''} \${r.chef? \`<span class="badge chef">👨‍🍳 \${r.chef}</span>\`:''} \${r.difficulty? \`<span class="badge diff">⭐ \${r.difficulty}</span>\`:''} \${r.status? \`<span class="badge">\${r.status}</span>\`:''}\`;
  document.getElementById('mTitle').textContent=r.title;
  document.getElementById('mTags').innerHTML=(r.categories||[]).map(c=>\`<span class="badge">\${c}</span>\`).join('') + (r.tags||[]).map(t=>\`<span class="badge" style="background:#f3e5f5">\${t}</span>\`).join('');
  document.getElementById('mIng').textContent=r.ingredients||'재료 정보 없음 - Notion에서 재료를 입력해주세요';
  document.getElementById('mSteps').textContent=r.steps||'조리법 정보 없음 - Notion에서 조리법을 입력해주세요';
  const cw=document.getElementById('mCoupangWrap');
  const c=document.getElementById('mCoupang');
  if(r.coupang&&r.coupang.length){ c.innerHTML=r.coupang.map((u,i)=>\`<a href="\${u}" target="_blank">🛒 쿠팡 제품 \${i+1} 보기</a>\`).join(''); cw.style.display='block'; } else { cw.style.display='none'; }
  document.getElementById('mNotion').href=r.url;
  document.getElementById('modal').classList.add('open');
}
function closeModal(){ document.getElementById('modal').classList.remove('open'); }
document.getElementById('modal').addEventListener('click', e=>{ if(e.target.id==='modal') closeModal(); });
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeModal(); });
document.getElementById('search').addEventListener('input', render);
document.getElementById('filterChef').addEventListener('change', render);
document.getElementById('filterTime').addEventListener('change', render);
document.getElementById('filterStatus').addEventListener('change', render);
load();
</script>
</body>
</html>`;

  fs.writeFileSync('dist/index.html', finalHtml,'utf8');
  fs.writeFileSync('index.html', finalHtml,'utf8');
  console.log('done');
}
main();
