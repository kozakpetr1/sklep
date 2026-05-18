/**
 * SKLEP — Main App Logic
 */

// ═══════════════════════════════════════
// STATE
// ═══════════════════════════════════════
const State = {
  items: [],
  categories: [],
  filter: { room: 'all', category: 'all', search: '', expiryOnly: false },
  editingItemId: null,
  editingCategoryId: null,
  detailItemId: null,
  selectedColor: '#e8c547',
};

const CATEGORY_COLORS = [
  '#e8c547','#4ecb8a','#54a8e8','#e85454','#b06ce8',
  '#f0943a','#e854a0','#54e8d4','#8ac7e8','#c8e854',
];

// ═══════════════════════════════════════
// INIT
// ═══════════════════════════════════════
async function init() {
  await DB.init();
  State.items = await DB.items.getAll();
  State.categories = await DB.categories.getAll();
  renderColorSwatches();
  renderCategoryOptions();
  renderItems();
  updateStats();
  bindEvents();
  registerSW();
}

// ═══════════════════════════════════════
// RENDER ITEMS
// ═══════════════════════════════════════
function getFilteredItems() {
  let items = [...State.items];

  if (State.filter.room !== 'all')
    items = items.filter(i => i.room === State.filter.room);

  if (State.filter.category !== 'all')
    items = items.filter(i => String(i.categoryId) === String(State.filter.category));

  if (State.filter.search.trim()) {
    const q = State.filter.search.toLowerCase();
    items = items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.note || '').toLowerCase().includes(q) ||
      (i.quantity || '').toLowerCase().includes(q)
    );
  }

  if (State.filter.expiryOnly)
    items = items.filter(i => i.expiry && expiryStatus(i.expiry) !== 'ok-far');

  // Sort: expired first, then expiring soon, then alpha
  items.sort((a, b) => {
    const sa = a.expiry ? expiryStatus(a.expiry) : 'z';
    const sb = b.expiry ? expiryStatus(b.expiry) : 'z';
    const order = { 'expired': 0, 'soon': 1, 'ok': 2, 'ok-far': 3, 'z': 4 };
    const d = (order[sa] ?? 9) - (order[sb] ?? 9);
    return d !== 0 ? d : a.name.localeCompare(b.name, 'cs');
  });

  return items;
}

function expiryStatus(dateStr) {
  if (!dateStr) return null;
  const now = new Date(); now.setHours(0,0,0,0);
  const exp = new Date(dateStr);
  const days = Math.floor((exp - now) / 86400000);
  if (days < 0)  return 'expired';
  if (days <= 7) return 'soon';
  if (days <= 30) return 'ok';
  return 'ok-far';
}

function expiryLabel(dateStr) {
  if (!dateStr) return null;
  const status = expiryStatus(dateStr);
  const now = new Date(); now.setHours(0,0,0,0);
  const exp = new Date(dateStr);
  const days = Math.floor((exp - now) / 86400000);
  const formatted = exp.toLocaleDateString('cs-CZ', { day:'numeric', month:'short' });
  if (status === 'expired') return { text: `Expirováno ${formatted}`, cls: 'expired' };
  if (status === 'soon')    return { text: `Exp. za ${days}d (${formatted})`, cls: 'soon' };
  return { text: `Exp. ${formatted}`, cls: 'ok' };
}

function getCategoryById(id) {
  return State.categories.find(c => c.id === id) || null;
}

function renderItems() {
  const grid = document.getElementById('itemsGrid');
  // const empty = document.getElementById('emptyState');
  const items = getFilteredItems();

  if (items.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  // Group by room if "all" filter
  let html = '';
  if (State.filter.room === 'all') {
    const rooms = ['A','B','C'];
    rooms.forEach(room => {
      const roomItems = items.filter(i => i.room === room);
      if (roomItems.length === 0) return;
      html += `<div class="group-header">📦 Sklep ${room}</div>`;
      roomItems.forEach(item => { html += renderItemCard(item); });
    });
  } else {
    items.forEach(item => { html += renderItemCard(item); });
  }

  grid.innerHTML = html;

  // Bind card clicks
  grid.querySelectorAll('.item-card').forEach(card => {
    card.addEventListener('click', () => openDetailModal(Number(card.dataset.id)));
  });
}

function renderItemCard(item) {
  const cat = item.categoryId ? getCategoryById(item.categoryId) : null;
  const exp = item.expiry ? expiryLabel(item.expiry) : null;
  const status = item.expiry ? expiryStatus(item.expiry) : '';

  const catBadge = cat
    ? `<span class="item-category-badge" style="background:${cat.color}22;color:${cat.color};border:1px solid ${cat.color}44">${cat.name}</span>`
    : '';

  const qtyBadge = item.quantity
    ? `<span class="item-quantity">${escHtml(item.quantity)}</span>`
    : '';

  const expBadge = exp
    ? `<span class="item-expiry ${exp.cls}">${exp.text}</span>`
    : '';

  const noteHtml = item.note
    ? `<div class="item-note">${escHtml(item.note)}</div>`
    : '';

  const cardCls = status === 'expired' ? 'expired' : status === 'soon' ? 'expiring-soon' : '';

  return `
    <div class="item-card ${cardCls}" data-id="${item.id}">
      <div class="item-card-top">
        <div class="item-name">${escHtml(item.name)}</div>
        <div class="item-location">${item.room} / ${escHtml(item.shelf)}</div>
      </div>
      <div class="item-card-meta">
        ${catBadge}${qtyBadge}${expBadge}
      </div>
      ${noteHtml}
    </div>`;
}

function updateStats() {
  const all = State.items;
  const expiring = all.filter(i => i.expiry && ['expired','soon'].includes(expiryStatus(i.expiry)));
  document.getElementById('statsText').textContent =
    `${all.length} položek · ${State.categories.length} kategorií`;
  const badge = document.getElementById('expiryBadge');
  if (expiring.length > 0) {
    badge.classList.remove('hidden');
    badge.textContent = `⚠ ${expiring.length} expiruje brzy`;
  } else {
    badge.classList.add('hidden');
  }
}

// ═══════════════════════════════════════
// CATEGORY OPTIONS (select)
// ═══════════════════════════════════════
function renderCategoryOptions() {
  const selects = ['itemCategory', 'categoryFilter'];
  selects.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const val = sel.value;
    if (id === 'itemCategory') {
      sel.innerHTML = `<option value="">— bez kategorie —</option>`;
    } else {
      sel.innerHTML = `<option value="all">Všechny kategorie</option>`;
    }
    State.categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      sel.appendChild(opt);
    });
    if (val) sel.value = val;
  });
}

// ═══════════════════════════════════════
// ITEM MODAL
// ═══════════════════════════════════════
function openItemModal(item = null) {
  State.editingItemId = item ? item.id : null;
  document.getElementById('itemModalTitle').textContent = item ? 'Upravit položku' : 'Nová položka';
  document.getElementById('itemName').value     = item?.name     || '';
  document.getElementById('itemRoom').value     = item?.room     || 'A';
  document.getElementById('itemShelf').value    = item?.shelf    || '';
  document.getElementById('itemCategory').value = item?.categoryId || '';
  document.getElementById('itemQuantity').value = item?.quantity || '';
  document.getElementById('itemExpiry').value   = item?.expiry   || '';
  document.getElementById('itemNote').value     = item?.note     || '';
  renderCategoryOptions();
  if (item?.categoryId) document.getElementById('itemCategory').value = item.categoryId;
  document.getElementById('itemModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('itemName').focus(), 100);
}

function closeItemModal() {
  document.getElementById('itemModal').classList.add('hidden');
  State.editingItemId = null;
}

async function saveItem() {
  const name   = document.getElementById('itemName').value.trim();
  const room   = document.getElementById('itemRoom').value;
  const shelf  = document.getElementById('itemShelf').value.trim();
  const catId  = document.getElementById('itemCategory').value;
  const qty    = document.getElementById('itemQuantity').value.trim();
  const expiry = document.getElementById('itemExpiry').value;
  const note   = document.getElementById('itemNote').value.trim();

  if (!name)  { showToast('Zadej název položky', 'error'); return; }
  if (!shelf) { showToast('Zadej číslo regálu', 'error'); return; }

  const obj = {
    name, room, shelf,
    categoryId: catId ? Number(catId) : null,
    quantity: qty,
    expiry: expiry || null,
    note,
  };

  if (State.editingItemId) {
    obj.id = State.editingItemId;
    const existing = await DB.items.getById(State.editingItemId);
    obj.createdAt = existing.createdAt;
    await DB.items.update(obj);
    State.items = State.items.map(i => i.id === obj.id ? obj : i);
    showToast('Položka uložena ✓', 'success');
  } else {
    const saved = await DB.items.add(obj);
    State.items.push(saved);
    showToast('Položka přidána ✓', 'success');
  }

  closeItemModal();
  renderItems();
  updateStats();
}

// ═══════════════════════════════════════
// DETAIL MODAL
// ═══════════════════════════════════════
function openDetailModal(id) {
  const item = State.items.find(i => i.id === id);
  if (!item) return;
  State.detailItemId = id;
  const cat = item.categoryId ? getCategoryById(item.categoryId) : null;
  const exp = item.expiry ? expiryLabel(item.expiry) : null;

  document.getElementById('detailTitle').textContent = item.name;

  const catHtml = cat
    ? `<span class="item-category-badge" style="background:${cat.color}22;color:${cat.color};border:1px solid ${cat.color}44">${cat.name}</span>`
    : '<em style="color:var(--text3)">bez kategorie</em>';

  const expHtml = exp
    ? `<span class="item-expiry ${exp.cls}">${exp.text}</span>`
    : '<em style="color:var(--text3)">—</em>';

  document.getElementById('detailBody').innerHTML = `
    <div class="detail-grid">
      <div class="detail-field">
        <div class="detail-label">Sklep</div>
        <div class="detail-value">${item.room}</div>
      </div>
      <div class="detail-field">
        <div class="detail-label">Regál</div>
        <div class="detail-value">${escHtml(item.shelf)}</div>
      </div>
      <div class="detail-field">
        <div class="detail-label">Kategorie</div>
        <div class="detail-value">${catHtml}</div>
      </div>
      <div class="detail-field">
        <div class="detail-label">Množství</div>
        <div class="detail-value">${item.quantity ? escHtml(item.quantity) : '—'}</div>
      </div>
      <div class="detail-field full">
        <div class="detail-label">Datum expirace</div>
        <div class="detail-value">${expHtml}</div>
      </div>
      ${item.note ? `
      <div class="detail-field full">
        <div class="detail-label">Poznámka</div>
        <div class="detail-value" style="white-space:pre-wrap">${escHtml(item.note)}</div>
      </div>` : ''}
      <div class="detail-field full" style="opacity:.5">
        <div class="detail-label">Přidáno</div>
        <div class="detail-value" style="font-size:12px">${new Date(item.createdAt).toLocaleString('cs-CZ')}</div>
      </div>
    </div>
  `;
  document.getElementById('detailModal').classList.remove('hidden');
}

function closeDetailModal() {
  document.getElementById('detailModal').classList.add('hidden');
  State.detailItemId = null;
}

async function deleteCurrentItem() {
  if (!State.detailItemId) return;
  const item = State.items.find(i => i.id === State.detailItemId);
  if (!confirm(`Smazat „${item?.name}"?`)) return;
  await DB.items.delete(State.detailItemId);
  State.items = State.items.filter(i => i.id !== State.detailItemId);
  closeDetailModal();
  renderItems();
  updateStats();
  showToast('Položka smazána', 'success');
}

function editCurrentItem() {
  const item = State.items.find(i => i.id === State.detailItemId);
  if (!item) return;
  closeDetailModal();
  openItemModal(item);
}

// ═══════════════════════════════════════
// CATEGORIES MODAL
// ═══════════════════════════════════════
function renderColorSwatches() {
  const wrap = document.getElementById('colorSwatches');
  wrap.innerHTML = CATEGORY_COLORS.map(c =>
    `<div class="color-swatch ${c === State.selectedColor ? 'selected' : ''}"
          data-color="${c}" style="background:${c}"></div>`
  ).join('');
  wrap.querySelectorAll('.color-swatch').forEach(el => {
    el.addEventListener('click', () => {
      State.selectedColor = el.dataset.color;
      wrap.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      el.classList.add('selected');
    });
  });
}

function openCategoriesModal() {
  renderCategoriesList();
  document.getElementById('categoriesModal').classList.remove('hidden');
}

function closeCategoriesModal() {
  document.getElementById('categoriesModal').classList.add('hidden');
  document.getElementById('newCategoryName').value = '';
  State.editingCategoryId = null;
}

function renderCategoriesList() {
  const wrap = document.getElementById('categoriesList');
  if (State.categories.length === 0) {
    wrap.innerHTML = '<p style="color:var(--text3);font-size:13px;text-align:center;padding:12px">Žádné kategorie</p>';
    return;
  }
  wrap.innerHTML = State.categories.map(cat => {
    const count = State.items.filter(i => i.categoryId === cat.id).length;
    return `
      <div class="category-item" data-id="${cat.id}">
        <div class="category-dot" style="background:${cat.color}"></div>
        <div class="category-item-name">${escHtml(cat.name)}</div>
        <div class="category-count">${count} pol.</div>
        <button class="category-edit-btn" data-id="${cat.id}">✏</button>
        <button class="category-del-btn" data-id="${cat.id}">✕</button>
      </div>`;
  }).join('');

  wrap.querySelectorAll('.category-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => startEditCategory(Number(btn.dataset.id)));
  });
  wrap.querySelectorAll('.category-del-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteCategory(Number(btn.dataset.id)));
  });
}

function startEditCategory(id) {
  const cat = State.categories.find(c => c.id === id);
  if (!cat) return;
  State.editingCategoryId = id;
  document.getElementById('newCategoryName').value = cat.name;
  State.selectedColor = cat.color;
  renderColorSwatches();
  document.getElementById('saveCategoryBtn').textContent = 'Uložit změny';
  document.getElementById('newCategoryName').focus();
}

async function saveCategory() {
  const name = document.getElementById('newCategoryName').value.trim();
  if (!name) { showToast('Zadej název kategorie', 'error'); return; }

  if (State.editingCategoryId) {
    const cat = State.categories.find(c => c.id === State.editingCategoryId);
    cat.name = name;
    cat.color = State.selectedColor;
    await DB.categories.update(cat);
    State.categories = State.categories.map(c => c.id === cat.id ? cat : c);
    State.editingCategoryId = null;
    document.getElementById('saveCategoryBtn').textContent = 'Přidat kategorii';
    showToast('Kategorie uložena ✓', 'success');
  } else {
    const saved = await DB.categories.add({ name, color: State.selectedColor });
    State.categories.push(saved);
    showToast('Kategorie přidána ✓', 'success');
  }

  document.getElementById('newCategoryName').value = '';
  renderCategoriesList();
  renderCategoryOptions();
  updateStats();
}

async function deleteCategory(id) {
  const cat = State.categories.find(c => c.id === id);
  const count = State.items.filter(i => i.categoryId === id).length;
  const msg = count > 0
    ? `Smazat kategorii „${cat?.name}"? ${count} položek ztratí kategorii.`
    : `Smazat kategorii „${cat?.name}"?`;
  if (!confirm(msg)) return;

  await DB.categories.delete(id);
  State.categories = State.categories.filter(c => c.id !== id);
  // Remove category from items
  for (const item of State.items.filter(i => i.categoryId === id)) {
    item.categoryId = null;
    await DB.items.update(item);
  }
  State.items = State.items.map(i => i.categoryId === id ? {...i, categoryId: null} : i);
  renderCategoriesList();
  renderCategoryOptions();
  renderItems();
  updateStats();
  showToast('Kategorie smazána', 'success');
}

// ═══════════════════════════════════════
// TOAST
// ═══════════════════════════════════════
let toastTimer = null;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2500);
}

// ═══════════════════════════════════════
// BIND EVENTS
// ═══════════════════════════════════════
function bindEvents() {
  // FAB
  document.getElementById('addItemBtn').addEventListener('click', () => openItemModal());

  // Item modal
  document.getElementById('itemModalClose').addEventListener('click', closeItemModal);
  document.getElementById('itemModalCancel').addEventListener('click', closeItemModal);
  document.getElementById('itemModalSave').addEventListener('click', saveItem);

  // Quick add category from item modal
  document.getElementById('quickAddCategoryBtn').addEventListener('click', () => {
    closeItemModal();
    openCategoriesModal();
  });

  // Detail modal
  document.getElementById('detailModalClose').addEventListener('click', closeDetailModal);
  document.getElementById('detailDelete').addEventListener('click', deleteCurrentItem);
  document.getElementById('detailEdit').addEventListener('click', editCurrentItem);

  // Categories modal
  document.getElementById('categoriesBtn').addEventListener('click', openCategoriesModal);
  document.getElementById('categoriesModalClose').addEventListener('click', closeCategoriesModal);
  document.getElementById('categoriesModalClose2').addEventListener('click', closeCategoriesModal);
  document.getElementById('saveCategoryBtn').addEventListener('click', saveCategory);
  document.getElementById('newCategoryName').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveCategory();
  });

  // Room filter
  document.getElementById('roomFilter').addEventListener('click', e => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    document.querySelectorAll('#roomFilter .pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    State.filter.room = pill.dataset.room;
    renderItems();
  });

  // Category filter
  document.getElementById('categoryFilter').addEventListener('change', e => {
    State.filter.category = e.target.value;
    renderItems();
  });

  // Expiry filter button
  document.getElementById('expiryFilterBtn').addEventListener('click', e => {
    State.filter.expiryOnly = !State.filter.expiryOnly;
    e.currentTarget.classList.toggle('active', State.filter.expiryOnly);
    renderItems();
  });

  // Expiry badge click
  document.getElementById('expiryBadge').addEventListener('click', () => {
    State.filter.expiryOnly = true;
    document.getElementById('expiryFilterBtn').classList.add('active');
    renderItems();
  });

  // Search toggle
  document.getElementById('searchToggleBtn').addEventListener('click', () => {
    const bar = document.getElementById('searchBar');
    const open = bar.classList.toggle('open');
    document.getElementById('searchToggleBtn').classList.toggle('active', open);
    if (open) setTimeout(() => document.getElementById('searchInput').focus(), 200);
    else {
      document.getElementById('searchInput').value = '';
      State.filter.search = '';
      renderItems();
    }
  });

  // Search input
  document.getElementById('searchInput').addEventListener('input', e => {
    State.filter.search = e.target.value;
    renderItems();
  });

  // Clear search
  document.getElementById('clearSearch').addEventListener('click', () => {
    document.getElementById('searchInput').value = '';
    State.filter.search = '';
    renderItems();
    document.getElementById('searchInput').focus();
  });

  // Close modals on overlay click
  ['itemModal','categoriesModal','detailModal'].forEach(id => {
    document.getElementById(id).addEventListener('click', e => {
      if (e.target.id === id) {
        if (id === 'itemModal') closeItemModal();
        else if (id === 'categoriesModal') closeCategoriesModal();
        else if (id === 'detailModal') closeDetailModal();
      }
    });
  });

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeItemModal();
      closeDetailModal();
      closeCategoriesModal();
    }
  });
}

// ═══════════════════════════════════════
// SERVICE WORKER
// ═══════════════════════════════════════
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ═══════════════════════════════════════
// UTILS
// ═══════════════════════════════════════
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ═══════════════════════════════════════
// START
// ═══════════════════════════════════════
document.addEventListener('DOMContentLoaded', init);
