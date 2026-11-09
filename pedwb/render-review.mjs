// Only a small, safe Markdown subset is rendered. No HTML is interpreted.
export function renderReview(document, text) {
  const root = document.createElement('div');
  root.className = 'review-text';
  const inline = (el, value) => {
    for (const [i, part] of value.split('**').entries()) {
      if (i % 2) { const strong=document.createElement('strong'); strong.textContent=part; el.append(strong); }
      else el.append(document.createTextNode(part));
    }
  };
  const lines=text.split('\n');
  for (let i=0;i<lines.length;i++) {
    const line=lines[i];
    if (!line.trim()) continue;
    if (line.startsWith('|') && /^\|[\s:|\-]+\|$/.test(lines[i+1]||'')) {
      const wrap=document.createElement('div');wrap.className='review-table';wrap.tabIndex=0;
      wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Tabela de cálculo do bloco revisado');
      const table=document.createElement('table');
      const cells=value=>value.split('|').slice(1,-1).map(s=>s.trim());
      const head=document.createElement('thead');const row=document.createElement('tr');
      for(const value of cells(line)){const cell=document.createElement('th');cell.scope='col';inline(cell,value);row.append(cell);}
      head.append(row);table.append(head);i++;
      const body=document.createElement('tbody');
      while(lines[i+1]?.startsWith('|')) {i++;const row=document.createElement('tr');for(const value of cells(lines[i])){const cell=document.createElement('td');inline(cell,value);row.append(cell);}body.append(row);}
      table.append(body);wrap.append(table);root.append(wrap);continue;
    }
    const heading=line.match(/^(#{1,6})\s+(.+)$/);
    const element=document.createElement(heading?'h'+Math.min(heading[1].length+1,6):'p');
    inline(element,heading?heading[2]:line);root.append(element);
  }
  return root;
}
