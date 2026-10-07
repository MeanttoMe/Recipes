
const fs = require('fs');
const https = require('https');
function notionRequest(path, method, body){
  const key = process.env.NOTION_API_KEY;
  return new Promise((resolve)=>{
    const opts={hostname:'api.notion.com',path,method,headers:{'Authorization':'Bearer '+key,'Notion-Version':'2022-06-28','Content-Type':'application/json'}};
    const req=https.request(opts, res=>{
      let data=''; res.on('data', d=>data+=d);
      res.on('end',()=>{ try{ const j=JSON.parse(data); if(j.object==='error') console.log('ERROR',path,j.code,j.message,JSON.stringify(j).slice(0,500)); resolve(j);}catch(e){ console.log('parse fail',data.slice(0,2000)); resolve({results:[]}); } });
    });
    req.on('error',(e)=>{ console.log('req error',e.message); resolve(null); });
    if(body) req.write(JSON.stringify(body));
    req.end();
  });
}
function blockToText(block){
  try{
    const t=block.type; const d=block[t]; if(!d) return '';
    if(d.rich_text) return d.rich_text.map(x=>x.plain_text).join('');
    if(t==='child_page') return d.title||'';
    return '';
  }catch(e){ return ''; }
}
async function fetchAllBlocks(blockId, depth=0, visited=new Set()){
  if(!blockId || visited.has(blockId)) return '';
  visited.add(blockId);
  let allText=''; let cursor=null;
  do{
    const path='/v1/blocks/'+blockId+'/children?page_size=100'+(cursor?'&start_cursor='+cursor:'');
    const res=await notionRequest(path,'GET',null);
    if(!res || res.object==='error' || !res.results){
      if(res&&res.object==='error') console.log(`  !! blocks error ${blockId.slice(0,8)}: ${res.code} ${res.message}`);
      break;
    }
    const blocks=res.results;
    if(depth===0) console.log(`    -> got ${blocks.length} blocks for ${blockId.slice(0,8)} types: ${blocks.map(b=>b.type).join(',').slice(0,200)}`);
    for(const b of blocks){
      const txt=blockToText(b);
      if(b.type==='child_page'){
        // skip child pages when fetching a recipe page
      } else {
        if(txt){
          if(b.type==='heading_1') allText+='\n# '+txt+'\n';
          else if(b.type==='heading_2') allText+='\n## '+txt+'\n';
          else if(b.type==='heading_3') allText+='\n### '+txt+'\n';
          else if(b.type==='bulleted_list_item') allText+='- '+txt+'\n';
          else if(b.type==='numbered_list_item') allText+=txt+'\n';
          else if(b.type==='to_do') allText+='□ '+txt+'\n';
          else if(b.type==='quote') allText+=`> ${txt}\n`;
          else if(b.type==='toggle') allText+=`\n${txt}\n`;
          else allText+=txt+'\n';
        }
      }
      if(b.has_children){
        const child=await fetchAllBlocks(b.id, depth+1, visited);
        if(child) allText+=child+'\n';
      }
    }
    cursor=res.has_more?res.next_cursor:null;
    if(cursor) await new Promise(r=>setTimeout(r,150));
  }while(cursor);
  return allText;
}

async function main(){
  const parentId = (process.env.NOTION_DB_ID||'').trim() || (process.env.NOTION_PARENT_PAGE_ID||'').trim();
  const dbId = (process.env.NOTION_DB_ID||'').trim();
  console.log('Using parent ID', parentId.slice(0,8), 'len', parentId.length);
  // First try as database query (if it's a database)
  let recipes=[];
  const dbData = await notionRequest('/v1/databases/'+parentId+'/query','POST',{page_size:100});
  if(dbData && dbData.object!=='error' && dbData.results && dbData.results.length>0){
    console.log('It is a DATABASE, found', dbData.results.length, 'entries');
    // check if properties have data
    let hasPropsData=false;
    for(const p of dbData.results){
      const ing = p.properties?.['재료']?.rich_text?.[0]?.plain_text || '';
      if(ing) hasPropsData=true;
    }
    console.log('Has props data?', hasPropsData);
    if(!hasPropsData){
      console.log('Database props empty, trying as PAGE with child pages...');
    } else {
      // use database mode
      for(const page of dbData.results){
        const title = page.properties?.['요리명']?.title?.[0]?.plain_text || page.properties?.['title']?.title?.[0]?.plain_text || '제목 없음';
        const ing = page.properties?.['재료']?.rich_text?.map(t=>t.plain_text).join('\n') || '';
        const steps = page.properties?.['조리법']?.rich_text?.map(t=>t.plain_text).join('\n') || '';
        console.log(`[DB] ${title} ing:${ing.length} steps:${steps.length}`);
        recipes.push({id:page.id,title,ingredients:ing,steps,fullContent:'',cover:'',url:page.url});
      }
    }
  }
  if(recipes.length===0){
    console.log('Trying as PAGE (folder) - listing child blocks...');
    const parentBlocks = await notionRequest('/v1/blocks/'+parentId+'/children?page_size=100','GET',null);
    if(parentBlocks && parentBlocks.results){
      console.log(`Parent has ${parentBlocks.results.length} child blocks`);
      const childPages = parentBlocks.results.filter(b=>b.type==='child_page');
      console.log(`Found ${childPages.length} child pages`);
      for(let i=0;i<childPages.length;i++){
        const b=childPages[i];
        const title=b.child_page?.title||'제목 없음';
        const pageId=b.id;
        console.log(`[${i+1}/${childPages.length}] ${title} id=${pageId.slice(0,8)} fetching...`);
        const text=await fetchAllBlocks(pageId,0);
        console.log(`  -> ${text.length} chars preview: ${text.slice(0,200).replace(/\n/g,' | ')}`);
        // Parse sections
        let ingredients='', seasoning='', steps='', info='';
        // simple parsing: look for headings
        const lines=text.split('\n');
        let current='';
        for(const line of lines){
          const lower=line.toLowerCase();
          if(line.includes('재료 준비') || line.includes('재료') && (line.includes('#') || line.startsWith('🛒') || line.startsWith('🤎') || line.length<20)){
            current='ing'; continue;
          }
          if(line.includes('양념')){ current='season'; continue; }
          if(line.includes('조리') || line.includes('만드는 법') || line.includes('순서')){ current='steps'; continue; }
          if(line.includes('기본 정보') || line.includes('조리 시간') || line.includes('분량') || line.includes('난이도')){ current='info'; }
          if(current==='ing') ingredients+=line+'\n';
          else if(current==='season') seasoning+=line+'\n';
          else if(current==='steps') steps+=line+'\n';
          else if(current==='info') info+=line+'\n';
        }
        // If no sections found, use full text as ingredients+steps
        if(!ingredients && !steps) ingredients=text;
        recipes.push({id:pageId,title,ingredients:ingredients+(seasoning?'\n\n[양념]\n'+seasoning:''),steps:steps||'',fullContent:text,info,cover:'',url:'https://www.notion.so/'+pageId.replace(/-/g,'')});
        await new Promise(r=>setTimeout(r,200));
      }
    }
  }
  console.log('Total recipes:',recipes.length);
  if(!fs.existsSync('dist')) fs.mkdirSync('dist',{recursive:true});
  fs.writeFileSync('dist/site-data.json',JSON.stringify(recipes,null,2),'utf8');
  const html=`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>나의 레시피 북</title><style>*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;background:#fafaf7;color:#111}header{text-align:center;padding:40px 20px 20px}header h1{font-size:32px;margin:0}header p{color:#666;margin-top:8px}.controls{max-width:1100px;margin:0 auto;padding:0 20px 20px;display:flex;gap:10px;flex-wrap:wrap}.controls input,.controls select{padding:10px 14px;border:1px solid #ddd;border-radius:10px;font-size:14px}.controls input{flex:1;min-width:200px}.grid{max-width:1100px;margin:0 auto;padding:0 20px 80px;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px}.card{background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.06);display:flex;flex-direction:column;cursor:pointer;transition:transform .15s,box-shadow .15s}.card:hover{transform:translateY(-4px);box-shadow:0 8px 24px rgba(0,0,0,.12)}.card-cover{height:180px;background:#f1f1ef;background-size:cover;background-position:center;display:flex;align-items:center;justify-content:center;font-size:48px}.card-body{padding:16px}.badge{display:inline-block;font-size:12px;padding:4px 8px;border-radius:20px;background:#f0f0f0;margin-right:6px;margin-bottom:6px}.title{font-size:18px;font-weight:700;margin:8px 0;line-height:1.3}.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;align-items:center;justify-content:center;padding:20px}.modal-overlay.open{display:flex}.modal{background:white;border-radius:20px;max-width:720px;width:100%;max-height:90vh;overflow-y:auto;position:relative}.modal-cover{height:260px;background:#eee;background-size:cover;background-position:center}.modal-close{position:absolute;top:12px;right:12px;width:36px;height:36px;border-radius:50%;background:white;border:none;font-size:20px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.15)}.modal-body{padding:24px}.modal-body h2{margin:0 0 12px;font-size:24px}.modal-section{margin-top:20px}.modal-section h3{font-size:16px;margin:0 0 8px;border-left:4px solid #111;padding-left:8px}.modal-section pre{white-space:pre-wrap;font-family:inherit;background:#fafaf7;padding:12px;border-radius:10px;font-size:14px;line-height:1.6}.empty{grid-column:1/-1;text-align:center;padding:60px;color:#999}</style></head><body><header><h1>🍳 나의 레시피 북</h1><p>총 <span id="count">0</span>개 · 카드를 클릭해보세요!</p></header><div class="controls"><input id="search" placeholder="요리명, 재료 검색..."></div><div class="grid" id="grid"></div><div class="modal-overlay" id="modal"><div class="modal"><button class="modal-close" onclick="closeModal()">✕</button><div class="modal-cover" id="mCover"></div><div class="modal-body"><h2 id="mTitle"></h2><div class="modal-section"><h3>🥕 재료</h3><pre id="mIng"></pre></div><div class="modal-section"><h3>👩‍🍳 조리법 & 전체 내용</h3><pre id="mSteps"></pre></div><div style="margin-top:20px"><a id="mNotion" target="_blank" style="color:#666;font-size:13px">Notion에서 열기 →</a></div></div></div></div><script>let data=[];async function load(){try{const res=await fetch('site-data.json?v='+Date.now());data=await res.json();}catch(e){data=[];}render();}function render(){const q=document.getElementById('search').value.toLowerCase();const grid=document.getElementById('grid');let filtered=data.filter(d=>!q||d.title.toLowerCase().includes(q)||(d.ingredients&&d.ingredients.toLowerCase().includes(q))||(d.fullContent&&d.fullContent.toLowerCase().includes(q)));document.getElementById('count').textContent=filtered.length;if(filtered.length===0){grid.innerHTML='<div class=empty>레시피가 없습니다.</div>';return;}grid.innerHTML=filtered.map(r=>{const idx=data.indexOf(r);return \`<div class="card" onclick="openModal(\${idx})"><div class="card-cover">🍳</div><div class="card-body"><div class="title">\${r.title}</div></div></div>\`;}).join('');}function openModal(idx){const r=data[idx];document.getElementById('mTitle').textContent=r.title;document.getElementById('mIng').textContent=r.ingredients||'재료 정보 없음';document.getElementById('mSteps').textContent=r.steps||r.fullContent||'조리법 없음';document.getElementById('mNotion').href=r.url;document.getElementById('modal').classList.add('open');}function closeModal(){document.getElementById('modal').classList.remove('open');}document.getElementById('modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal();});document.getElementById('search').addEventListener('input',render);load();<\/script></body></html>`;
  fs.writeFileSync('dist/index.html',html,'utf8'); fs.writeFileSync('index.html',html,'utf8'); console.log('done');
}
main();
