const fs = require('fs');
const https = require('https');
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DB_ID = process.env.NOTION_DB_ID;

function notionRequest(path, method='GET', body=null){
  return new Promise((resolve, reject)=>{
    const opts={
      hostname:'api.notion.com',
      path,
      method,
      headers:{
        'Authorization':`Bearer ${NOTION_API_KEY}`,
        'Notion-Version':'2022-06-28',
        'Content-Type':'application/json'
      }
    };
    const req=https.request(opts, res=>{
      let data=''; res.on('data', d=>data+=d);
      res.on('end',()=>{ try{ resolve(JSON.parse(data)); }catch(e){ resolve({}); } });
    });
    req.on('error', reject);
    if(body) req.write(JSON.stringify(body));
    req.end();
  });
}

function blockToText(block){
  const data = block[block.type];
  if(!data ||!data.rich_text) return '';
  return data.rich_text.map(t=>t.plain_text).join('');
}

async function main(){
  console.log('Querying DB...');
  const db = await notionRequest(`/v1/databases/${NOTION_DB_ID}/query`, 'POST', {page_size:100});
  console.log(`Found ${db.results.length} pages`);

  for(const page of db.results){
    console.log(`Fetching blocks for ${page.id}...`);
    const blocks = await notionRequest(`/v1/blocks/${page.id}/children?page_size=100`);
    let text='';
    for(const b of blocks.results||[]){
      const txt=blockToText(b);
      if(!txt) continue;
      if(b.type==='heading_1') text+=`\n# ${txt}\n`;
      else if(b.type==='heading_2') text+=`\n## ${txt}\n`;
      else if(b.type==='heading_3') text+=`\n### ${txt}\n`;
      else if(b.type==='bulleted_list_item') text+=`- ${txt}\n`;
      else if(b.type==='numbered_list_item') text+=`• ${txt}\n`;
      else text+=txt+'\n\n';
    }
    page._pageContent=text;
    console.log(` -> ${text.length} chars`);
  }
  fs.writeFileSync('recipes.json', JSON.stringify(db));
  console.log('Saved recipes.json');
}
main();
