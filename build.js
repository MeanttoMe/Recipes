
const fs = require('fs');
function getProp(page, name, type) {
  const p = page.properties[name];
  if (!p) return type==='multi' ? [] : '';
  if (type==='title') return p.title?.[0]?.plain_text || '';
  if (type==='select') return p.select?.name || '';
  if (type==='multi') return (p.multi_select||[]).map(o=>o.name);
  if (type==='text') return (p.rich_text||[]).map(t=>t.plain_text).join('') || '';
  if (type==='url') return p.url || '';
  if (type==='files') return p.files?.[0]?.file?.url || p.files?.[0]?.external?.url || '';
  return '';
}
let data;
try { data = JSON.parse(fs.readFileSync('recipes.json','utf-8')); } catch(e){ console.log('recipes.json not found'); data={results:[]}; }
const recipes = data.results.map(page => ({
  id: page.id,
  title: getProp(page,'요리명','title') || getProp(page,'이름','title') || getProp(page,'Name','title'),
  category: getProp(page,'카테고리','multi'),
  tags: getProp(page,'태그','multi'),
  level: getProp(page,'난이도','select'),
  time: getProp(page,'소요시간','select'),
  chef: getProp(page,'셰프/출처','select'),
  status: getProp(page,'상태','select'),
  ingredients: getProp(page,'재료','text'),
  steps: getProp(page,'조리법','text'),
  thumbnail: getProp(page,'썸네일','files'),
  coupang: [
    { name: getProp(page,'쿠팡제품1','text'), link: getProp(page,'쿠팡링크1','url') },
    { name: getProp(page,'쿠팡제품2','text'), link: getProp(page,'쿠팡링크2','url') },
    { name: getProp(page,'쿠팡제품3','text'), link: getProp(page,'쿠팡링크3','url') },
  ].filter(x=>x.name || x.link)
}));
fs.mkdirSync('dist',{recursive:true});
fs.writeFileSync('dist/site-data.json', JSON.stringify(recipes,null,2),'utf-8');
fs.writeFileSync('site-data.json', JSON.stringify(recipes,null,2),'utf-8');
// inject into index
let html = fs.readFileSync('index.html','utf-8');
html = html.replace('/* INJECT_DATA */', `const siteData = ${JSON.stringify(recipes)};`);
fs.writeFileSync('dist/index.html', html,'utf-8');
console.log(`✅ ${recipes.length}개 변환 완료`);
