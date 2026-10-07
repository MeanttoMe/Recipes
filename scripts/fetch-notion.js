const fs = require('fs');
const https = require('https');
const token = process.env.NOTION_API_KEY;

function fetchBlocks(id) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.notion.com',
      path: `/v1/blocks/${id}/children?page_size=100`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28' }
    }, res => {
      let body = ''; res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch(e) { resolve({results:[]}); }
      });
    });
    req.on('error', () => resolve({results:[]}));
    req.end();
  });
}

function blockToText(block) {
  const t = block[block.type];
  if (!t ||!t.rich_text) return '';
  return t.rich_text.map(x => x.plain_text).join('');
}

(async () => {
  const data = JSON.parse(fs.readFileSync('recipes.json','utf8'));
  for (const page of data.results) {
    console.log('Fetching', page.id);
    const blocks = await fetchBlocks(page.id);
    let text = '';
    for (const b of blocks.results || []) {
      const txt = blockToText(b);
      if (!txt) continue;
      if (b.type === 'heading_1') text += `\n# ${txt}\n`;
      else if (b.type === 'heading_2') text += `\n## ${txt}\n`;
      else if (b.type === 'bulleted_list_item') text += `- ${txt}\n`;
      else if (b.type === 'numbered_list_item') text += `1. ${txt}\n`;
      else text += txt + '\n\n';
    }
    page._pageContent = text;
    console.log(' -> len', text.length);
  }
  fs.writeFileSync('recipes.json', JSON.stringify(data));
  console.log('Saved');
})();
