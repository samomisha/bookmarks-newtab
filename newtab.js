const ARCHIVE = 'Архів';
const $ = s => document.querySelector(s);
const board = $('#board'), q = $('#q');
let groups = [], archive = null, defaultParent = '1', sel = 0, visible = [];
const HELP = {id: '__help', title: 'Інструкція', url: 'help.html', isHelp: true};
const HELP_ICON = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#2383e2' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M4 19.5V5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zm0 0A2 2 0 006 22h13'/><path d='M9 8h6M9 12h4'/></svg>`);
let helpHidden = false, archiveOpen = false, colOrder = [], seen = new Set(), favs = [], linkById = new Map();
try { archiveOpen = localStorage.archiveOpen === '1'; } catch {}

/* ---------- theme ---------- */
const media = matchMedia('(prefers-color-scheme: dark)');
function applyTheme(t){
  const mode = t === 'system' ? (media.matches ? 'dark' : 'light') : t;
  document.documentElement.dataset.theme = mode;
  $('#theme').textContent = t === 'system' ? '◐' : t === 'dark' ? '☾' : '☀';
  $('#theme').title = 'Тема: ' + ({system:'як у системі',dark:'темна',light:'світла'})[t];
}
let theme = 'system'; try { theme = localStorage.theme || 'system'; } catch {}
applyTheme(theme);
chrome.storage.sync.get('theme', r => { if (r.theme) { theme = r.theme; try{localStorage.theme = theme;}catch{} applyTheme(theme); }});
media.addEventListener('change', () => applyTheme(theme));
$('#theme').onclick = () => {
  theme = ({system:'light',light:'dark',dark:'system'})[theme];
  try{localStorage.theme = theme;}catch{} chrome.storage.sync.set({theme}); applyTheme(theme);
};

/* ---------- data ---------- */
const fav = (url, size = 32) => (window.FAVICON ? FAVICON(url) :
  `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=${size}`);
const host = u => { try { return new URL(u).hostname.replace(/^www\./,''); } catch { return ''; } };
const shortUrl = u => { try { const x = new URL(u); let p = (x.hostname.replace(/^www\./,'') + x.pathname).replace(/\/$/,'');
  return p.length > 70 ? p.slice(0, 67) + '…' : p; } catch { return u; } };
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
const flatten = (n, out = []) => { for (const c of n.children || []) c.url ? out.push(c) : flatten(c, out); return out; };

async function load(){
  const [top] = await chrome.bookmarks.getTree();
  const roots = top.children;              // Панель закладок, Інші закладки, Мобільні
  defaultParent = roots[0]?.id || '1';
  archive = null; groups = [];
  const walk = (node, path, isRoot) => {
    if (!node.url && node.title === ARCHIVE && !isRoot){ archive = {id: node.id, title: ARCHIVE, parentId: node.parentId, links: flatten(node), isArchive: true}; return; }
    const links = (node.children || []).filter(c => c.url);
    const subs = (node.children || []).filter(c => !c.url);
    const empty = !links.length && !subs.length;
    if (links.length || (empty && !isRoot))
      groups.push({id: node.id, title: node.title || 'Без назви', path, links, isRoot, parentId: node.parentId});
    for (const s of subs) walk(s, path ? `${path} / ${node.title}` : node.title, false);
  };
  for (const r of roots) walk(r, '', true);
  const st = await chrome.storage.local.get(['colOrder', 'seen', 'favs', 'helpHidden']);
  helpHidden = !!st.helpHidden;
  colOrder = st.colOrder || [];
  const allLinks = flatten(top);
  linkById = new Map(allLinks.map(l => [l.id, l]));
  // «Не розібрані»: усе, чого розширення ще не бачило. Перший запуск — усе вважаємо розібраним.
  if (!st.seen){ seen = new Set(allLinks.map(l => l.id)); chrome.storage.local.set({seen: [...seen]}); }
  else seen = new Set(st.seen.filter(id => linkById.has(id)));
  favs = (st.favs || []).filter(id => linkById.has(id));
  const unsorted = allLinks.filter(l => !seen.has(l.id));
  if (unsorted.length){
    const u = new Set(unsorted.map(l => l.id));
    for (const g of groups) g.links = g.links.filter(l => !u.has(l.id));
    if (archive) archive.links = archive.links.filter(l => !u.has(l.id));
  }
  const pos = id => { const i = colOrder.indexOf(id); return i < 0 ? 1e6 : i; };
  groups = groups.map((g, i) => [g, i]).sort((a, b) => (pos(a[0].id) - pos(b[0].id)) || (a[1] - b[1])).map(x => x[0]);
  groups = groups.filter(g => g.links.length || !g.isRoot);
  if (helpHidden){
    if (!archive) archive = {id: null, title: ARCHIVE, links: [], isArchive: true};
    archive.links = [HELP, ...archive.links];
  }
  if (unsorted.length) groups.unshift({id: '__unsorted', title: 'Не розібрані', links: unsorted, isUnsorted: true});
  render();
}
function markSeen(...ids){
  ids.forEach(id => seen.add(id));
  return chrome.storage.local.set({seen: [...seen]});
}
function isFavd(l){ return l.isHelp ? !helpHidden : favs.includes(l.id); }
function showDock(l){
  $('#dock').classList.add('show');
  const fz = $('#dock .fav-zone'), f = isFavd(l);
  fz.querySelector('.ico').textContent = f ? '☆' : '★';
  fz.querySelector('.lbl').textContent = f ? 'Прибрати з улюблених' : 'В улюблені';
}
function setHelp(hidden){
  helpHidden = hidden; chrome.storage.local.set({helpHidden: hidden}); load();
  toast(hidden ? 'Інструкція в архіві. Повернути — правий клік → «★ В улюблені»' : '★ Інструкція знову в улюблених');
}
function setFavs(list){ favs = list; return chrome.storage.local.set({favs}).then(render); }
function toggleFav(l){
  if (l.isHelp) return setHelp(!helpHidden);
  if (favs.includes(l.id)) { setFavs(favs.filter(x => x !== l.id)); toast(`Прибрано з улюблених`); }
  else { markSeen(l.id); setFavs([...favs, l.id]); toast(`★ «${esc(l.title || host(l.url))}» в улюблених`); }
}
async function ensureArchive(){
  if (archive?.id) return archive.id;
  const f = await chrome.bookmarks.create({parentId: defaultParent, title: ARCHIVE});
  return f.id;
}

/* ---------- render ---------- */
function hl(text, terms){
  let s = esc(text);
  for (const t of terms) s = s.replace(new RegExp(esc(t).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'), m => `<mark>${m}</mark>`);
  return s;
}
function linkEl(l, terms, inArchive){
  const a = document.createElement('a');
  a.className = 'link'; a.href = l.url; a.draggable = true; a.dataset.id = l.id; a.dataset.index = l.index; a.dataset.parent = l.parentId; a.title = (l.title ? l.title + '\n' : '') + shortUrl(l.url);
  a.innerHTML = `<img src="${l.isHelp ? HELP_ICON : fav(l.url)}" alt=""><span class="t">${hl(l.title || host(l.url), terms)}</span>
    ${favs.includes(l.id) ? '<span class="star" title="В улюблених">★</span>' : ''}`;
  a.addEventListener('contextmenu', e => { e.preventDefault(); openMenu(e, l, a, inArchive); });
  a.addEventListener('click', e => { if (a.classList.contains('editing')) e.preventDefault(); });
  a.addEventListener('dragstart', e => { e.dataTransfer.setData('text/id', l.id); a.classList.add('dragging'); dragging = l; $('#dock').classList.add('show');
    showDock(l);
    const bar = $('#favs'); bar.classList.add('target'); if (!q.value.trim()) bar.hidden = false; });
  a.addEventListener('dragend', () => { a.classList.remove('dragging'); dragging = null; $('#dock').classList.remove('show');
    const bar = $('#favs'); bar.classList.remove('target', 'drop'); favLine.remove(); if (!favs.length && helpHidden) bar.hidden = true; });
  return a;
}
function render(){
  const terms = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const match = l => terms.every(t => (l.title + ' ' + l.url).toLowerCase().includes(t));
  board.innerHTML = ''; visible = [];
  let total = 0;
  renderFavs(terms.length > 0);
  $('#quote').hidden = terms.length > 0 || !quotesReady;
  const all = archive ? [...groups, archive] : groups;
  for (const g of all){
    const links = g.links.filter(match);
    if (terms.length && !links.length) continue;
    total += links.length;
    const collapsed = g.isArchive && !archiveOpen && !terms.length;
    const col = document.createElement('section');
    col.className = 'col' + (g.isArchive ? ' archive' : '') + (g.isUnsorted ? ' unsorted' : '') + (collapsed ? ' collapsed' : '');
    col.dataset.id = g.id;
    if (collapsed){
      col.innerHTML = `<button class="arch-pill" title="Розгорнути архів"><span>🗄</span><span class="v">${ARCHIVE}</span><span class="col-count">${g.links.length}</span></button>`;
      col.querySelector('button').onclick = () => setArchive(true);
      wireDrop(col, g); board.appendChild(col); continue;
    }
    col.innerHTML = `<div class="col-head" ${g.isArchive || g.isUnsorted ? '' : 'draggable="true"'} title="${esc(g.path ? g.path + ' / ' + g.title : g.title)}">
      ${g.isArchive ? '<span>🗄</span>' : g.isUnsorted ? '<span class="dot"></span>' : ''}
      <span class="col-title">${esc(g.title)}</span>
      <span class="col-count">${links.length}</span>
      ${g.isArchive ? '<button class="col-btn" title="Згорнути">‹</button>' : g.isUnsorted ? '<button class="col-btn ok-all" title="Залишити все там, де лежить">✓ все</button>' : g.isRoot ? '' : '<button class="col-btn col-del" title="Видалити групу">✕</button>'}</div>`;
    for (const l of links){ const a = linkEl(l, terms, g.isArchive); col.appendChild(a); visible.push(a); }
    if (!links.length) col.insertAdjacentHTML('beforeend', `<div class="col-empty">${g.isArchive ? 'Перетягніть сюди те, що не потрібно щодня' : 'Перетягніть сюди посилання'}</div>`);
    if (g.isArchive) col.querySelector('.col-btn').onclick = () => setArchive(false);
    if (g.isUnsorted){
      col.querySelector('.ok-all').onclick = () => markSeen(...g.links.map(l => l.id)).then(load);
      board.appendChild(col); continue;
    }
    wireDrop(col, g); if (!g.isArchive && !g.isRoot) wireGroup(col, g);
    if (!g.isArchive) wireColDrag(col, g);
    board.appendChild(col);
  }
  if (!archive && !terms.length){
    const col = document.createElement('section');
    col.className = 'col archive collapsed';
    col.innerHTML = `<button class="arch-pill" title="Перетягніть сюди посилання, щоб створити архів"><span>🗄</span><span class="v">${ARCHIVE}</span><span class="col-count">0</span></button>`;
    wireDrop(col, null); board.appendChild(col);
  }
  $('#count').textContent = terms.length ? `${total}` : '';
  sel = 0; markSel();
  $('#empty').hidden = !(terms.length && !total);
  $('#empty').textContent = 'Нічого не знайдено';
}
function renderFavs(searching){
  const bar = $('#favs');
  const list = favs.map(id => linkById.get(id)).filter(Boolean);
  bar.hidden = searching || (!list.length && helpHidden && !bar.classList.contains('target'));
  bar.innerHTML = '';
  if (!helpHidden){
    const h = document.createElement('a');
    h.className = 'fav help-tile'; h.href = 'help.html'; h.title = 'Як користуватись закладками';
    h.innerHTML = `<span class="fav-ico"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5V5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zm0 0A2 2 0 006 22h13"/><path d="M9 8h6M9 12h4"/></svg></span><span class="fav-t">Інструкція</span>`;
    h.draggable = true;
    h.addEventListener('contextmenu', e => { e.preventDefault(); openHelpMenu(e); });
    h.addEventListener('dragstart', e => { e.dataTransfer.setData('text/id', HELP.id); h.classList.add('dragging'); dragging = HELP; showDock(HELP); });
    h.addEventListener('dragend', () => { h.classList.remove('dragging'); dragging = null; $('#dock').classList.remove('show'); });
    bar.appendChild(h);
  }
  if (!list.length) bar.insertAdjacentHTML('beforeend', '<div class="favs-hint">★ Перетягніть сюди закладку, щоб додати в улюблені</div>');
  for (const l of list){
    const a = document.createElement('a');
    a.className = 'fav'; a.href = l.url; a.draggable = true; a.dataset.id = l.id; a.title = (l.title ? l.title + '\n' : '') + shortUrl(l.url);
    a.innerHTML = `<span class="fav-ico"><img src="${fav(l.url, 64)}" alt=""></span><span class="fav-t">${esc(l.title || host(l.url))}</span>`;
    a.addEventListener('contextmenu', e => { e.preventDefault(); openMenu(e, l, a, false, true); });
    a.addEventListener('dragstart', e => { e.dataTransfer.setData('text/fav', l.id); a.classList.add('dragging'); });
    a.addEventListener('dragend', () => a.classList.remove('dragging'));
    bar.appendChild(a);
  }
}
function openHelpMenu(e){
  menu.innerHTML = '<button data-a="open">📖 Відкрити інструкцію</button><button data-a="hide">🗄 Прибрати в архів</button>';
  menu.hidden = false;
  menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px';
  menu.onclick = ev => {
    const act = ev.target.closest('button')?.dataset.a; if (!act) return;
    menu.hidden = true;
    if (act === 'open') location.href = 'help.html';
    if (act === 'hide') setHelp(true);
  };
}
const favLine = document.createElement('div'); favLine.className = 'fav-line';
{
  const bar = $('#favs');
  const ok = e => e.dataTransfer.types.includes('text/id') || e.dataTransfer.types.includes('text/fav');
  bar.addEventListener('dragover', e => {
    if (!ok(e)) return; e.preventDefault(); bar.classList.add('drop');
    const tiles = [...bar.querySelectorAll('.fav:not(.dragging)')];
    const before = tiles.find(t => e.clientX < t.getBoundingClientRect().left + t.offsetWidth / 2) || null;
    if (favLine.nextSibling !== before || favLine.parentNode !== bar) bar.insertBefore(favLine, before);
  });
  bar.addEventListener('dragleave', e => { if (!bar.contains(e.relatedTarget)) { bar.classList.remove('drop'); favLine.remove(); } });
  bar.addEventListener('drop', e => {
    if (!ok(e)) return; e.preventDefault(); e.stopPropagation(); bar.classList.remove('drop');
    const id = e.dataTransfer.getData('text/fav') || e.dataTransfer.getData('text/id');
    if (id === HELP.id){ favLine.remove(); if (helpHidden) setHelp(false); return; }
    const order = [...bar.children].filter(n => n === favLine || n.classList.contains('fav'))
      .map(n => n === favLine ? '__line' : n.dataset.id).filter(x => x !== id);
    favLine.remove();
    const i = order.indexOf('__line'); order.splice(i < 0 ? order.length : i, i < 0 ? 0 : 1, id);
    markSeen(id); setFavs(order);
  });
}
function setArchive(v){ archiveOpen = v; try{localStorage.archiveOpen = v ? '1' : '0';}catch{} render(); }
function markSel(){
  visible.forEach((a,i) => a.classList.toggle('sel', !!q.value.trim() && i === sel));
  if (q.value.trim()) visible[sel]?.scrollIntoView({block:'nearest', inline:'nearest'});
}

/* ---------- drag dock: Архів / Видалити ---------- */
let dragging = null;
document.querySelectorAll('#dock .zone').forEach(z => {
  z.addEventListener('dragover', e => { e.preventDefault(); z.classList.add('over'); });
  z.addEventListener('dragleave', () => z.classList.remove('over'));
  z.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation(); z.classList.remove('over');
    const l = dragging; $('#dock').classList.remove('show'); if (!l) return;
    if (l.isHelp){ setHelp(z.dataset.act !== 'fav' ? true : !helpHidden); return; }
    if (z.dataset.act === 'fav') toggleFav(l);
    else z.dataset.act === 'delete' ? removeLink(l) : toArchive(l);
  });
});

/* ---------- actions ---------- */
let toastTimer;
function toast(html, undo){
  const t = $('#toast');
  t.innerHTML = html + (undo ? ' <button class="btn">Повернути</button>' : '');
  t.hidden = false;
  if (undo) t.querySelector('button').onclick = async () => { t.hidden = true; await undo(); };
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 6000);
}
async function removeLink(l){
  const backup = {parentId: l.parentId, index: l.index, title: l.title, url: l.url};
  await chrome.bookmarks.remove(l.id);
  const wasFav = favs.indexOf(l.id);
  toast(`Видалено «${esc(l.title || host(l.url))}»`, async () => {
    const n = await chrome.bookmarks.create(backup); await markSeen(n.id);
    if (wasFav >= 0){ const f = [...favs]; f.splice(wasFav, 0, n.id); setFavs(f); }
  });
}
async function toArchive(l){
  const from = {parentId: l.parentId, index: l.index};
  await markSeen(l.id);
  await chrome.bookmarks.move(l.id, {parentId: await ensureArchive()});
  toast(`«${esc(l.title || host(l.url))}» в архіві`, () => chrome.bookmarks.move(l.id, from));
}
const line = document.createElement('div'); line.className = 'drop-line';
const isLink = e => e.dataTransfer.types.includes('text/id');
function dropTarget(col, y){
  const items = [...col.querySelectorAll('.link:not(.dragging)')];
  return items.find(a => y < a.getBoundingClientRect().top + a.offsetHeight / 2) || null;
}
function wireDrop(col, g){
  col.addEventListener('dragover', e => {
    if (!isLink(e)) return;
    e.preventDefault(); col.classList.add('drop');
    if (col.classList.contains('collapsed')) return;
    const after = dropTarget(col, e.clientY);
    if (after) { if (line.nextSibling !== after) col.insertBefore(line, after); }
    else {
      const last = [...col.querySelectorAll('.link')].pop();
      const ref = last ? last.nextSibling : null;
      if (line.parentNode !== col || line.nextSibling !== ref) col.insertBefore(line, ref);
    }
  });
  col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) { col.classList.remove('drop'); line.remove(); } });
  col.addEventListener('drop', async e => {
    if (!isLink(e)) return;
    e.preventDefault(); col.classList.remove('drop');
    const after = line.parentNode === col ? line.nextElementSibling : null;
    line.remove();
    const id = e.dataTransfer.getData('text/id'); if (!id) return;
    if (id === HELP.id){ if (!g || g.isArchive) setHelp(true); return; }
    const parentId = g && g.id ? g.id : await ensureArchive();
    const dest = {parentId};
    await markSeen(id);
    if (after && after.classList.contains('link') && after.dataset.parent === parentId) dest.index = +after.dataset.index;
    await chrome.bookmarks.move(id, dest);
  });
}
document.addEventListener('dragend', () => { line.remove(); colLine.remove(); document.querySelectorAll('.drop').forEach(c => c.classList.remove('drop')); });

/* ---------- column reorder ---------- */
const colLine = document.createElement('div'); colLine.className = 'col-line';
const isCol = e => e.dataTransfer.types.includes('text/col');
function wireColDrag(col, g){
  const head = col.querySelector('.col-head');
  head.addEventListener('dragstart', e => {
    if (head.querySelector('[contenteditable=true]')) { e.preventDefault(); return; }
    e.dataTransfer.setData('text/col', g.id); e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setDragImage(col, 20, 16);
    setTimeout(() => col.classList.add('col-dragging'));
  });
  head.addEventListener('dragend', () => col.classList.remove('col-dragging'));
}
function colTarget(x){
  const cols = [...board.querySelectorAll('.col:not(.archive):not(.col-dragging)')];
  return cols.find(c => x < c.getBoundingClientRect().left + c.offsetWidth / 2) || board.querySelector('.col.archive');
}
board.addEventListener('dragover', e => {
  if (!isCol(e)) return;
  e.preventDefault();
  const before = colTarget(e.clientX);
  if (colLine.nextSibling !== before || colLine.parentNode !== board) board.insertBefore(colLine, before);
});
board.addEventListener('drop', async e => {
  if (!isCol(e)) return;
  e.preventDefault();
  const id = e.dataTransfer.getData('text/col');
  const ids = [...board.children].filter(n => n === colLine || (n.classList.contains('col') && !n.classList.contains('archive')))
    .map(n => n === colLine ? '__line' : n.dataset.id).filter(x => x !== id);
  colLine.remove();
  ids.splice(Math.max(0, ids.indexOf('__line')), 1, id);
  const shown = new Set(ids);
  colOrder = [...ids, ...groups.map(g => g.id).filter(x => !shown.has(x))];
  await chrome.storage.local.set({colOrder});
  load();
});

/* ---------- context menu & rename ---------- */
const menu = document.createElement('div'); menu.className = 'menu'; menu.hidden = true; document.body.appendChild(menu);
function openMenu(e, l, a, inArchive, isFavTile){
  if (l.isHelp){
    menu.innerHTML = '<button data-a="open">📖 Відкрити інструкцію</button><button data-a="fav">★ В улюблені</button>';
    menu.hidden = false; menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px';
    menu.onclick = ev => { const act = ev.target.closest('button')?.dataset.a; if (!act) return; menu.hidden = true;
      if (act === 'open') location.href = 'help.html'; if (act === 'fav') setHelp(false); };
    return;
  }
  const isFav = favs.includes(l.id), isNew = !seen.has(l.id);
  menu.innerHTML = `<button data-a="fav">${isFav ? '☆ Прибрати з улюблених' : '★ В улюблені'}</button>
    ${isNew ? '<button data-a="seen">✓ Залишити тут (розібрано)</button>' : ''}
    ${isFavTile ? '' : '<button data-a="rename">✎ Перейменувати</button>'}
    <button data-a="tab">↗ Відкрити в новій вкладці</button>
    <div class="sep"></div>
    ${inArchive ? '' : '<button data-a="archive">🗄 В архів</button>'}
    <button data-a="delete" class="danger">🗑 Видалити</button>`;
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(e.clientX, innerWidth - r.width - 8) + 'px';
  menu.style.top = Math.min(e.clientY, innerHeight - r.height - 8) + 'px';
  menu.onclick = ev => {
    const act = ev.target.closest('button')?.dataset.a; if (!act) return;
    menu.hidden = true;
    if (act === 'fav') toggleFav(l);
    if (act === 'seen') markSeen(l.id).then(load);
    if (act === 'rename') renameLink(l, a);
    if (act === 'tab') window.open(l.url, '_blank');
    if (act === 'archive') toArchive(l);
    if (act === 'delete') removeLink(l);
  };
}
document.addEventListener('mousedown', e => { if (!menu.contains(e.target)) menu.hidden = true; });
addEventListener('blur', () => menu.hidden = true);
function renameLink(l, a){
  const t = a.querySelector('.t');
  a.classList.add('editing'); a.draggable = false;
  t.textContent = l.title; t.contentEditable = true; t.focus();
  document.getSelection().selectAllChildren(t);
  let done = false;
  const finish = save => {
    if (done) return; done = true;
    t.contentEditable = false; a.classList.remove('editing'); a.draggable = true;
    const v = t.textContent.trim();
    if (save && v && v !== l.title) markSeen(l.id).then(() => chrome.bookmarks.update(l.id, {title: v})); else render();
  };
  t.addEventListener('blur', () => finish(true));
  t.addEventListener('keydown', ev => {
    if (ev.key === 'Enter'){ ev.preventDefault(); finish(true); }
    if (ev.key === 'Escape'){ ev.preventDefault(); finish(false); }
  });
}

function wireGroup(col, g){
  const title = col.querySelector('.col-title');
  title.title = 'Двічі клацніть, щоб перейменувати';
  title.addEventListener('dblclick', () => {
    title.contentEditable = true; title.focus(); document.getSelection().selectAllChildren(title);
    col.querySelector('.col-head').draggable = false;
  });
  const save = () => {
    if (title.contentEditable !== 'true') return;
    title.contentEditable = false; col.querySelector('.col-head').draggable = true;
    const t = title.textContent.trim();
    if (t && t !== g.title) chrome.bookmarks.update(g.id, {title: t}); else title.textContent = g.title;
  };
  title.addEventListener('blur', save);
  title.addEventListener('keydown', e => {
    if (e.key === 'Enter'){ e.preventDefault(); title.blur(); }
    if (e.key === 'Escape'){ title.textContent = g.title; title.contentEditable = false; }
  });
  col.querySelector('.col-del').onclick = () => confirmBox(
    `Видалити групу «${esc(g.title)}»?<br><span class="muted">Посилання з неї перейдуть в «${ARCHIVE}».</span>`,
    async () => {
      const arc = await ensureArchive();
      const [node] = await chrome.bookmarks.getSubTree(g.id);
      for (const c of node.children || []) await chrome.bookmarks.move(c.id, c.url ? {parentId: arc} : {parentId: g.parentId});
      await chrome.bookmarks.remove(g.id);
    });
}
function confirmBox(html, ok){
  const d = $('#dialog');
  d.querySelector('.msg').innerHTML = html; d.hidden = false;
  d.querySelector('.ok').onclick = () => { d.hidden = true; ok(); };
  d.querySelector('.cancel').onclick = () => d.hidden = true;
}
$('#addGroup').onclick = async () => {
  const f = await chrome.bookmarks.create({parentId: defaultParent, title: 'Нова група'});
  setTimeout(() => {
    const t = board.querySelector(`.col[data-id="${f.id}"] .col-title`);
    if (t){ t.scrollIntoView({inline:'center'}); t.dispatchEvent(new MouseEvent('dblclick')); }
  }, 150);
};

/* ---------- search & keys ---------- */
q.addEventListener('input', render);
q.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown'){ e.preventDefault(); sel = Math.min(sel + 1, visible.length - 1); markSel(); }
  if (e.key === 'ArrowUp'){ e.preventDefault(); sel = Math.max(sel - 1, 0); markSel(); }
  if (e.key === 'Enter' && visible[sel] && q.value.trim()){
    const url = visible[sel].href;
    if (e.metaKey || e.ctrlKey) window.open(url, '_blank'); else location.href = url;
  }
  if (e.key === 'Escape'){ q.value = ''; render(); }
});
document.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement !== q && !document.activeElement.isContentEditable && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)){ e.preventDefault(); q.focus(); }
});

/* ---------- live updates ---------- */
let t; const reload = () => { clearTimeout(t); t = setTimeout(load, 80); };
['onCreated','onRemoved','onChanged','onMoved','onChildrenReordered'].forEach(ev => chrome.bookmarks[ev].addListener(reload));
load();

/* ---------- dark favicons: light plate in dark theme ---------- */
const iconTone = new Map();
const cv = document.createElement('canvas'); cv.width = cv.height = 24;
let cx = null; try { cx = cv.getContext('2d', {willReadFrequently: true}); } catch {}
function toneOf(img){
  try {
    cx.clearRect(0, 0, 24, 24); cx.drawImage(img, 0, 0, 24, 24);
    const d = cx.getImageData(0, 0, 24, 24).data;
    let sum = 0, w = 0;
    for (let i = 0; i < d.length; i += 4){
      const a = d[i+3] / 255; if (a < .1) continue;
      sum += a * (0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2]) / 255; w += a;
    }
    return w && sum / w < 0.42 ? 'dark' : 'light';
  } catch { return 'light'; }
}
document.addEventListener('load', e => {
  const img = e.target;
  if (img.tagName !== 'IMG' || !img.closest('.link, .fav')) return;
  let t = iconTone.get(img.src);
  if (!t){ t = toneOf(img); iconTone.set(img.src, t); }
  img.classList.toggle('dark-icon', t === 'dark');
}, true);

/* ---------- quotes ---------- */
let quotes = [], quotesReady = false, qEditing = null;
const SEED = [{id: 'q1', text: 'Люди залучені, коли знають те, що знає CEO', author: 'CEO Київстар'}];
const dayNum = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
let qPick = null; // {day, id} — цитата дня не змінюється, навіть якщо додаєш нові
function todayIdx(){
  if (!quotes.length) return -1;
  const day = dayNum();
  let i = qPick ? quotes.findIndex(x => x.id === qPick.id) : -1;
  if (qPick && qPick.day === day && i >= 0) return i;
  i = i >= 0 ? (i + 1) % quotes.length : (qPick ? 0 : day % quotes.length);
  qPick = {day, id: quotes[i].id}; chrome.storage.local.set({qPick});
  return i;
}
async function loadQuotes(){
  const s = await chrome.storage.local.get(['quotes', 'qPick']);
  quotes = s.quotes ?? SEED; qPick = s.qPick || null;
  // одноразовий імпорт бібліотеки з quotes.json (якщо файл є в папці розширення)
  const imp = await chrome.storage.local.get('quotesImported');
  if (!imp.quotesImported){
    try {
      const pack = await (await fetch('quotes.json')).json();
      const norm = t => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
      const have = new Set(quotes.map(x => norm(x.text)));
      for (const it of pack) if (!have.has(norm(it.text))) { quotes.push(it); have.add(norm(it.text)); }
    } catch {}
    chrome.storage.local.set({quotesImported: true});
  }
  chrome.storage.local.set({quotes});
  quotesReady = true; renderQuote();
}
function saveQuotes(){ chrome.storage.local.set({quotes}); renderQuote(); renderQList(); }
function renderQuote(){
  const box = $('#quote');
  box.hidden = !!q.value.trim();
  if (!quotes.length){
    box.innerHTML = '<button class="q-empty">❝ Додати цитату дня</button>';
  } else {
    const it = quotes[todayIdx()];
    box.innerHTML = `<blockquote>${esc(it.text)}</blockquote>${it.author ? `<div class="q-author">— ${esc(it.author)}</div>` : ''}
      <span class="q-tools-top"><button class="q-btn q-next" title="Інша цитата">↻</button><button class="q-btn q-lib" title="Бібліотека цитат">❝ ${quotes.length}</button></span>`;
  }
  (box.querySelector('.q-lib') || box.querySelector('button')).onclick = openQuotes;
  const nx = box.querySelector('.q-next');
  if (nx) nx.onclick = () => {
    const i = (todayIdx() + 1) % quotes.length;
    qPick = {day: dayNum(), id: quotes[i].id}; chrome.storage.local.set({qPick});
    renderQuote();
    const bq = $('#quote blockquote'); bq?.animate([{opacity: 0, transform: 'translateY(4px)'}, {opacity: 1, transform: 'none'}], {duration: 220, easing: 'ease-out'});
  };
}
function parseQuote(s){
  s = s.trim().replace(/^["«“„]+|["»”]+$/g, '');
  const m = s.match(/^([\s\S]+?)\s+[—–-]\s+([^—–]+)$/);
  let text = m ? m[1] : s, author = m ? m[2].trim() : '';
  text = text.trim().replace(/^["«“„]+|["»”]+$/g, '').trim();
  return {text, author};
}
function openQuotes(){ $('#quotes').hidden = false; resetQForm(); renderQList(); setTimeout(() => $('#qtext').focus(), 30); }
function closeQuotes(){ $('#quotes').hidden = true; }
function resetQForm(){ qEditing = null; $('#qtext').value = ''; $('.q-submit').textContent = 'Додати'; $('.q-cancel').hidden = true; }
function renderQList(){
  const list = $('#qlist'), ti = todayIdx();
  $('#qcount').textContent = quotes.length ? `${quotes.length}` : '';
  list.innerHTML = quotes.length ? '' : '<div class="muted q-none">Поки порожньо. Додай першу цитату вище.</div>';
  quotes.forEach((it, i) => {
    const row = document.createElement('div');
    row.className = 'q-item' + (qEditing === it.id ? ' editing' : '');
    row.innerHTML = `<div class="q-body"><div class="q-t">${esc(it.text)}</div>
      <div class="q-a">${it.author ? '— ' + esc(it.author) : ''}${i === ti ? '<span class="q-today">сьогодні</span>' : ''}</div></div>
      <div class="q-tools"><button class="tool" data-a="edit" title="Редагувати">✎</button><button class="tool del" data-a="del" title="Видалити">✕</button></div>`;
    row.onclick = e => {
      const act = e.target.closest('button')?.dataset.a;
      if (act === 'del'){
        const [removed] = quotes.splice(i, 1); if (qEditing === it.id) resetQForm(); saveQuotes();
        toast('Цитату видалено', () => { quotes.splice(i, 0, removed); saveQuotes(); });
      } else if (act === 'edit' || !act){
        qEditing = it.id; $('#qtext').value = it.author ? `${it.text} — ${it.author}` : it.text;
        $('.q-submit').textContent = 'Зберегти'; $('.q-cancel').hidden = false; $('#qtext').focus(); renderQList();
      }
    };
    list.appendChild(row);
  });
}
$('#qform').addEventListener('submit', e => {
  e.preventDefault();
  const {text, author} = parseQuote($('#qtext').value);
  if (!text) return;
  if (qEditing){ const it = quotes.find(x => x.id === qEditing); if (it) Object.assign(it, {text, author}); }
  else quotes.push({id: 'q' + Date.now().toString(36), text, author});
  resetQForm(); saveQuotes(); $('#qtext').focus();
});
$('#qtext').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)){ e.preventDefault(); $('#qform').requestSubmit(); }
});
$('.q-cancel').onclick = () => { resetQForm(); renderQList(); };
$('.q-close').onclick = closeQuotes;
$('#quotes').addEventListener('mousedown', e => { if (e.target.id === 'quotes') closeQuotes(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#quotes').hidden){ e.stopPropagation(); closeQuotes(); } }, true);
loadQuotes();
