/* ================================================================
   VMTOP Catálogo – app.js
   Sin dependencias externas. Funciona en GitHub Pages (file:// + https://)
   Preparado para +5000 productos con renderizado virtual por lotes.
   ================================================================ */

'use strict';

/* ─── Configuración ─────────────────────────────────────────────── */
const CONFIG = {
  dataUrl:       'productos.json',
  batchSize:     40,          // productos por lote (infinite scroll)
  debounceMs:    220,         // delay búsqueda
  imgPlaceholder:'📦',
  currency:      'MXN',
  currencyLocale:'es-MX',
};

/* ─── Estado global ──────────────────────────────────────────────── */
const STATE = {
  all:            [],   // todos los productos originales
  filtered:       [],   // resultado de búsqueda/filtro/sort
  rendered:       0,    // cuántos ya se pintaron
  loading:        false,
  search:         '',
  category:       '',
  sort:           'default',
};

/* ─── Elementos del DOM ──────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const DOM = {
  grid:          $('productGrid'),
  searchInput:   $('searchInput'),
  searchClear:   $('searchClear'),
  productCount:  $('productCount'),
  categoryList:  $('categoryList'),
  clearCategory: $('clearCategory'),
  sortSelect:    $('sortSelect'),
  emptyState:    $('emptyState'),
  activeFilters: $('activeFilters'),
  loader:        $('loader'),
  sentinel:      $('scrollSentinel'),
  filterToggle:  $('filterToggle'),
  sidebar:       $('sidebar'),
  resetSearch:   $('resetSearch'),
  modalOverlay:  $('modalOverlay'),
  modalContent:  $('modalContent'),
  modalClose:    $('modalClose'),
};

/* ─── Utilidades ─────────────────────────────────────────────────── */
const fmt = (n) => {
  const num = parseFloat(n);
  if (isNaN(num)) return '—';
  return num.toLocaleString(CONFIG.currencyLocale, {
    style: 'currency',
    currency: CONFIG.currency,
    minimumFractionDigits: 2,
  });
};

const escHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const debounce = (fn, ms) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

const normalize = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

/* ─── Formateador de precio sin símbolo para tarjeta compacta ────── */
const fmtShort = (n) => {
  const num = parseFloat(n);
  if (isNaN(num)) return '—';
  return '$' + num.toLocaleString(CONFIG.currencyLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/* ─── Carga de datos ─────────────────────────────────────────────── */
async function loadData() {
  setLoader(true);
  try {
    const res = await fetch(CONFIG.dataUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    STATE.all = Array.isArray(data) ? data : (data.productos ?? []);
    init();
  } catch (e) {
    DOM.grid.innerHTML = `<p style="color:#f87171;padding:32px">
      Error al cargar productos.json: ${escHtml(e.message)}</p>`;
  } finally {
    setLoader(false);
  }
}

/* ─── Inicialización post-carga ──────────────────────────────────── */
function init() {
  buildCategories();
  applyFilters();
  setupObserver();
}

/* ─── Categorías ─────────────────────────────────────────────────── */
function buildCategories() {
  const counts = {};
  STATE.all.forEach((p) => {
    const cat = p.categoria ?? p.Categoria ?? p.CATEGORIA ?? 'Sin categoría';
    counts[cat] = (counts[cat] ?? 0) + 1;
  });

  const sorted = Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
  DOM.categoryList.innerHTML = sorted.map(([cat, n]) => `
    <li class="category-item" data-cat="${escHtml(cat)}" role="button" tabindex="0">
      <span>${escHtml(cat)}</span>
      <span class="category-count">${n}</span>
    </li>`).join('');

  DOM.categoryList.querySelectorAll('.category-item').forEach((li) => {
    const handler = () => selectCategory(li.dataset.cat);
    li.addEventListener('click', handler);
    li.addEventListener('keydown', (e) => e.key === 'Enter' && handler());
  });
}

function selectCategory(cat) {
  STATE.category = STATE.category === cat ? '' : cat;
  // Actualizar UI sidebar
  DOM.categoryList.querySelectorAll('.category-item').forEach((li) => {
    li.classList.toggle('active', li.dataset.cat === STATE.category);
  });
  applyFilters();
  closeSidebar();
}

/* ─── Filtros, búsqueda y ordenación ────────────────────────────── */
function applyFilters() {
  const q = normalize(STATE.search);
  const cat = STATE.category;

  STATE.filtered = STATE.all.filter((p) => {
    const sku  = normalize(p.sku ?? p.SKU ?? '');
    const name = normalize(p.nombre ?? p.Nombre ?? p.NOMBRE ?? '');
    const pcat = p.categoria ?? p.Categoria ?? p.CATEGORIA ?? '';

    const matchQ   = !q || sku.includes(q) || name.includes(q);
    const matchCat = !cat || pcat === cat;
    return matchQ && matchCat;
  });

  applySort();
  renderReset();
  updateCountAndFilters();
}

function applySort() {
  const s = STATE.sort;
  if (s === 'default') return;

  STATE.filtered.sort((a, b) => {
    const nameA = (a.nombre ?? a.Nombre ?? '').toLowerCase();
    const nameB = (b.nombre ?? b.Nombre ?? '').toLowerCase();
    const skuA  = (a.sku ?? a.SKU ?? '').toLowerCase();
    const skuB  = (b.sku ?? b.SKU ?? '').toLowerCase();
    const pA    = parseFloat(a.precio_publico ?? a.PrecioPublico ?? 0);
    const pB    = parseFloat(b.precio_publico ?? b.PrecioPublico ?? 0);

    switch (s) {
      case 'name_asc':   return nameA.localeCompare(nameB);
      case 'name_desc':  return nameB.localeCompare(nameA);
      case 'price_asc':  return pA - pB;
      case 'price_desc': return pB - pA;
      case 'sku_asc':    return skuA.localeCompare(skuB);
      default:           return 0;
    }
  });
}

function updateCountAndFilters() {
  DOM.productCount.textContent = STATE.filtered.length.toLocaleString();
  DOM.emptyState.hidden = STATE.filtered.length > 0;

  // Chips de filtros activos
  const chips = [];
  if (STATE.search)   chips.push({ label: `"${STATE.search}"`, clear: () => { STATE.search = ''; DOM.searchInput.value = ''; DOM.searchClear.hidden = true; applyFilters(); } });
  if (STATE.category) chips.push({ label: STATE.category, clear: () => { STATE.category = ''; DOM.categoryList.querySelectorAll('.category-item').forEach(li => li.classList.remove('active')); applyFilters(); } });

  DOM.activeFilters.innerHTML = chips.map((c, i) =>
    `<span class="filter-chip">${escHtml(c.label)}<button data-idx="${i}" aria-label="Quitar filtro">✕</button></span>`
  ).join('');

  DOM.activeFilters.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => chips[+btn.dataset.idx].clear());
  });
}

/* ─── Renderizado por lotes ──────────────────────────────────────── */
function renderReset() {
  DOM.grid.innerHTML = '';
  STATE.rendered = 0;
  renderBatch();
}

function renderBatch() {
  if (STATE.loading) return;
  const { filtered, rendered } = STATE;
  if (rendered >= filtered.length) return;

  STATE.loading = true;
  const batch = filtered.slice(rendered, rendered + CONFIG.batchSize);

  // Usar fragment para minimizar reflows
  const frag = document.createDocumentFragment();
  batch.forEach((p) => frag.appendChild(createCard(p)));
  DOM.grid.appendChild(frag);

  STATE.rendered += batch.length;
  STATE.loading = false;
}

/* ─── Tarjeta de producto ────────────────────────────────────────── */
function getField(p, ...keys) {
  for (const k of keys) if (p[k] !== undefined && p[k] !== null && p[k] !== '') return p[k];
  return null;
}

function createCard(p) {
  const sku    = getField(p, 'sku', 'SKU') ?? '';
  const name   = getField(p, 'nombre', 'Nombre', 'NOMBRE') ?? 'Sin nombre';
  const cat    = getField(p, 'categoria', 'Categoria', 'CATEGORIA') ?? 'Sin categoría';
  const img    = getField(p, 'imagen', 'Imagen', 'IMAGEN', 'image', 'img') ?? '';
  const pPub   = getField(p, 'precio_publico', 'PrecioPublico', 'precio_público', 'Precio Público');
  const pMay   = getField(p, 'precio_mayoreo', 'PrecioMayoreo', 'Precio Mayoreo');
  const pDist  = getField(p, 'precio_distribuidor', 'PrecioDistribuidor', 'Precio Distribuidor');
  const pCaja  = getField(p, 'precio_caja', 'PrecioCaja', 'Precio Caja');
  const piezas = getField(p, 'piezas_caja', 'PiezasCaja', 'Piezas por Caja', 'piezas');
  const desc   = getField(p, 'descuento', 'Descuento');

  const card = document.createElement('article');
  card.className = 'product-card';
  card.setAttribute('role', 'listitem');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', name);

  card.innerHTML = `
    ${desc ? `<span class="discount-badge">${escHtml(String(desc))}%</span>` : ''}
    <div class="card-img-wrap">
      <span class="img-placeholder">${CONFIG.imgPlaceholder}</span>
      ${img ? `<img class="card-img" data-src="${escHtml(img)}" alt="${escHtml(name)}" loading="lazy" />` : ''}
    </div>
    <div class="card-body">
      <span class="card-sku">${escHtml(sku)}</span>
      <span class="card-name">${escHtml(name)}</span>
      <span class="card-category">${escHtml(cat)}</span>
      <div class="card-prices">
        <div class="price-row public">
          <span class="price-label">Público</span>
          <span class="price-value">${fmtShort(pPub)}</span>
        </div>
        <div class="price-row mayoreo">
          <span class="price-label">Mayoreo</span>
          <span class="price-value">${fmtShort(pMay)}</span>
        </div>
        <div class="price-row dist">
          <span class="price-label">Distribuidor</span>
          <span class="price-value">${fmtShort(pDist)}</span>
        </div>
        <div class="price-row caja">
          <span class="price-label">Caja</span>
          <span class="price-value">${fmtShort(pCaja)}</span>
        </div>
      </div>
    </div>
    <div class="card-footer">
      <span>Piezas/caja</span>
      <span>${escHtml(String(piezas ?? '—'))}</span>
    </div>`;

  // Lazy load imagen con IntersectionObserver
  const imgEl = card.querySelector('.card-img');
  if (imgEl) {
    imgObserver.observe(imgEl);
    imgEl.addEventListener('load', () => imgEl.classList.add('loaded'));
    imgEl.addEventListener('error', () => { imgEl.style.display = 'none'; });
  }

  // Click → modal
  const openModal = () => showModal(p);
  card.addEventListener('click', openModal);
  card.addEventListener('keydown', (e) => e.key === 'Enter' && openModal());

  return card;
}

/* ─── Lazy loading de imágenes ───────────────────────────────────── */
const imgObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      const img = entry.target;
      img.src = img.dataset.src;
      imgObserver.unobserve(img);
    }
  });
}, { rootMargin: '200px' });

/* ─── Infinite scroll ────────────────────────────────────────────── */
function setupObserver() {
  const scrollObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) renderBatch();
  }, { rootMargin: '300px' });
  scrollObserver.observe(DOM.sentinel);
}

/* ─── Modal detalle ──────────────────────────────────────────────── */
function showModal(p) {
  const sku    = getField(p, 'sku', 'SKU') ?? '';
  const name   = getField(p, 'nombre', 'Nombre', 'NOMBRE') ?? 'Sin nombre';
  const cat    = getField(p, 'categoria', 'Categoria', 'CATEGORIA') ?? 'Sin categoría';
  const img    = getField(p, 'imagen', 'Imagen', 'IMAGEN', 'image', 'img') ?? '';
  const pPub   = getField(p, 'precio_publico', 'PrecioPublico', 'precio_público', 'Precio Público');
  const pMay   = getField(p, 'precio_mayoreo', 'PrecioMayoreo', 'Precio Mayoreo');
  const pDist  = getField(p, 'precio_distribuidor', 'PrecioDistribuidor', 'Precio Distribuidor');
  const pCaja  = getField(p, 'precio_caja', 'PrecioCaja', 'Precio Caja');
  const piezas = getField(p, 'piezas_caja', 'PiezasCaja', 'Piezas por Caja', 'piezas');
  const desc   = getField(p, 'descuento', 'Descuento');

  DOM.modalContent.innerHTML = `
    <div class="modal-inner">
      <div class="modal-img-wrap">
        ${img
          ? `<img class="modal-img" src="${escHtml(img)}" alt="${escHtml(name)}" />`
          : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:64px">${CONFIG.imgPlaceholder}</div>`
        }
      </div>
      <div class="modal-info">
        <div class="modal-sku">SKU: ${escHtml(sku)}</div>
        <div class="modal-name">${escHtml(name)}</div>
        <div class="modal-cat"><span class="card-category">${escHtml(cat)}</span></div>
        ${desc ? `<div><span class="discount-badge" style="position:static;display:inline-block">Descuento ${escHtml(String(desc))}%</span></div>` : ''}
        <div class="modal-prices">
          <div class="modal-price-row public">
            <span class="price-label">Precio Público</span>
            <span class="price-value" style="color:var(--clr-text)">${fmt(pPub)}</span>
          </div>
          <div class="modal-price-row mayoreo">
            <span class="price-label">Precio Mayoreo</span>
            <span class="price-value" style="color:var(--clr-accent)">${fmt(pMay)}</span>
          </div>
          <div class="modal-price-row dist">
            <span class="price-label">Precio Distribuidor</span>
            <span class="price-value" style="color:var(--clr-success)">${fmt(pDist)}</span>
          </div>
          <div class="modal-price-row caja">
            <span class="price-label">Precio Caja</span>
            <span class="price-value" style="color:#93c5fd">${fmt(pCaja)}</span>
          </div>
        </div>
        <div class="modal-meta">Piezas por caja: <strong>${escHtml(String(piezas ?? '—'))}</strong></div>
      </div>
    </div>`;

  DOM.modalOverlay.hidden = false;
  document.body.style.overflow = 'hidden';
  DOM.modalClose.focus();
}

function closeModal() {
  DOM.modalOverlay.hidden = true;
  document.body.style.overflow = '';
}

/* ─── Sidebar móvil ──────────────────────────────────────────────── */
let backdrop = null;

function openSidebar() {
  DOM.sidebar.classList.add('open');
  DOM.filterToggle.setAttribute('aria-expanded', 'true');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', closeSidebar);
  }
  backdrop.classList.add('visible');
}

function closeSidebar() {
  DOM.sidebar.classList.remove('open');
  DOM.filterToggle.setAttribute('aria-expanded', 'false');
  backdrop?.classList.remove('visible');
}

/* ─── Loader helper ──────────────────────────────────────────────── */
function setLoader(on) {
  DOM.loader.hidden = !on;
}

/* ─── Event listeners ────────────────────────────────────────────── */
DOM.searchInput.addEventListener('input', debounce((e) => {
  STATE.search = e.target.value.trim();
  DOM.searchClear.hidden = !STATE.search;
  applyFilters();
}, CONFIG.debounceMs));

DOM.searchClear.addEventListener('click', () => {
  STATE.search = '';
  DOM.searchInput.value = '';
  DOM.searchClear.hidden = true;
  applyFilters();
  DOM.searchInput.focus();
});

DOM.clearCategory.addEventListener('click', () => {
  STATE.category = '';
  DOM.categoryList.querySelectorAll('.category-item').forEach(li => li.classList.remove('active'));
  applyFilters();
});

DOM.sortSelect.addEventListener('change', () => {
  STATE.sort = DOM.sortSelect.value;
  applyFilters();
});

DOM.filterToggle.addEventListener('click', () => {
  DOM.sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
});

DOM.modalClose.addEventListener('click', closeModal);
DOM.modalOverlay.addEventListener('click', (e) => {
  if (e.target === DOM.modalOverlay) closeModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

DOM.resetSearch.addEventListener('click', () => {
  STATE.search = '';
  STATE.category = '';
  STATE.sort = 'default';
  DOM.searchInput.value = '';
  DOM.searchClear.hidden = true;
  DOM.sortSelect.value = 'default';
  DOM.categoryList.querySelectorAll('.category-item').forEach(li => li.classList.remove('active'));
  applyFilters();
});

/* ─── Arranque ───────────────────────────────────────────────────── */
loadData();
