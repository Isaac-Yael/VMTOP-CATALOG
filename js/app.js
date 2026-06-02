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
  priceMin:       null,
  priceMax:       null,
};

/* ─── Elementos del DOM ──────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const DOM = {
  grid:          $('productGrid'),
  searchInput:   $('searchInput'),
  searchClear:   $('searchClear'),
  productCount:  null,
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
  priceMin:      $('priceMin'),
  priceMax:      $('priceMax'),
  rangeMin:      $('priceRangeMin'),
  rangeMax:      $('priceRangeMax'),
  clearPrice:    $('clearPrice'),
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
  initPriceFilter();
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

/* ─── Filtro de precio ───────────────────────────────────────────── */
function initPriceFilter() {
  const prices = STATE.all
    .map(p => parseFloat(getField(p, 'precio_caja', 'PrecioCaja', 'Precio Caja') ?? 0))
    .filter(n => !isNaN(n) && n > 0);

  if (!prices.length) return;

  const globalMin = Math.floor(Math.min(...prices));
  const globalMax = Math.ceil(Math.max(...prices));

  DOM.rangeMin.min = globalMin; DOM.rangeMin.max = globalMax; DOM.rangeMin.value = globalMin;
  DOM.rangeMax.min = globalMin; DOM.rangeMax.max = globalMax; DOM.rangeMax.value = globalMax;
  DOM.priceMin.value = globalMin;
  DOM.priceMax.value = globalMax;

  updateRangeFill();

  DOM.rangeMin.addEventListener('input', () => {
    const v = Math.min(+DOM.rangeMin.value, +DOM.rangeMax.value - 1);
    DOM.rangeMin.value = v;
    DOM.priceMin.value = v;
    STATE.priceMin = v;
    updateRangeFill(); applyFilters();
  });
  DOM.rangeMax.addEventListener('input', () => {
    const v = Math.max(+DOM.rangeMax.value, +DOM.rangeMin.value + 1);
    DOM.rangeMax.value = v;
    DOM.priceMax.value = v;
    STATE.priceMax = v;
    updateRangeFill(); applyFilters();
  });
  DOM.priceMin.addEventListener('change', () => {
    const v = Math.max(+DOM.rangeMin.min, Math.min(+DOM.priceMin.value, +DOM.rangeMax.value - 1));
    DOM.priceMin.value = v; DOM.rangeMin.value = v;
    STATE.priceMin = v; updateRangeFill(); applyFilters();
  });
  DOM.priceMax.addEventListener('change', () => {
    const v = Math.min(+DOM.rangeMax.max, Math.max(+DOM.priceMax.value, +DOM.rangeMin.value + 1));
    DOM.priceMax.value = v; DOM.rangeMax.value = v;
    STATE.priceMax = v; updateRangeFill(); applyFilters();
  });
  DOM.clearPrice.addEventListener('click', () => {
    DOM.rangeMin.value = globalMin; DOM.rangeMax.value = globalMax;
    DOM.priceMin.value = globalMin; DOM.priceMax.value = globalMax;
    STATE.priceMin = null; STATE.priceMax = null;
    updateRangeFill(); applyFilters();
  });
}

function updateRangeFill() {
  const wrap   = DOM.rangeMin.closest('.price-range-wrap');
  const min    = +DOM.rangeMin.min, max = +DOM.rangeMin.max;
  const vMin   = +DOM.rangeMin.value, vMax = +DOM.rangeMax.value;
  const pLeft  = ((vMin - min) / (max - min)) * 100;
  const pRight = ((vMax - min) / (max - min)) * 100;

  // Crear pistas si no existen
  let track = wrap.querySelector('.price-range-track');
  let fill  = wrap.querySelector('.price-range-fill');
  if (!track) { track = document.createElement('div'); track.className = 'price-range-track'; wrap.prepend(track); }
  if (!fill)  { fill  = document.createElement('div'); fill.className  = 'price-range-fill';  wrap.prepend(fill); }

  fill.style.left  = pLeft + '%';
  fill.style.width = (pRight - pLeft) + '%';
}

/* ─── Filtros, búsqueda y ordenación ────────────────────────────── */
function applyFilters() {
  const q = normalize(STATE.search);
  const cat = STATE.category;

  STATE.filtered = STATE.all.filter((p) => {
    const sku  = normalize(p.sku ?? p.SKU ?? '');
    const name = normalize(p.nombre ?? p.Nombre ?? p.NOMBRE ?? '');
    const pcat = p.categoria ?? p.Categoria ?? p.CATEGORIA ?? '';
    const pcaja = parseFloat(getField(p, 'precio_caja', 'PrecioCaja', 'Precio Caja') ?? 0);

    const matchQ    = !q || sku.includes(q) || name.includes(q);
    const matchCat  = !cat || pcat === cat;
    const matchPMin = STATE.priceMin === null || pcaja >= STATE.priceMin;
    const matchPMax = STATE.priceMax === null || pcaja <= STATE.priceMax;
    return matchQ && matchCat && matchPMin && matchPMax;
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
  if (DOM.productCount) DOM.productCount.textContent = STATE.filtered.length.toLocaleString();
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
      ${img ? `<img class="card-img" data-src="img/${escHtml(img)}" alt="${escHtml(name)}" loading="lazy" />` : ''}
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
          <span class="price-label">Caja${piezas ? ` (${escHtml(String(piezas))} pzas)` : ''}</span>
          <span class="price-value">${fmtShort(pCaja)}</span>
        </div>
      </div>
    </div>`;

  // Lazy load imagen con IntersectionObserver
  const imgEl = card.querySelector('.card-img');
  if (imgEl) {
    imgObserver.observe(imgEl);
    const revealImg = () => {
      imgEl.classList.add('loaded');
      const ph = imgEl.closest('.card-img-wrap').querySelector('.img-placeholder');
      if (ph) ph.style.display = 'none';
    };
    imgEl.addEventListener('load', revealImg);
    // Imagen ya cacheada: complete es true antes de que load dispare
    if (imgEl.complete && imgEl.naturalWidth) revealImg();
    imgEl.addEventListener('error', () => { imgEl.style.display = 'none'; });
  }

  // Botón agregar al carrito
  const addBtn = document.createElement('button');
  addBtn.className = 'btn-add-cart';
  addBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg> Agregar al carrito`;
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openQtyPopup(p);
  });
  card.appendChild(addBtn);

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
          ? `<img class="modal-img" src="img/${escHtml(img)}" alt="${escHtml(name)}" />`
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
            <span class="price-label">Caja${piezas ? ` (${escHtml(String(piezas))} pzas)` : ''}</span>
            <span class="price-value" style="color:#93c5fd">${fmt(pCaja)}</span>
          </div>
        </div>
        <div class="modal-cart-actions">
          <div class="modal-qty-wrap">
            <button class="qty-popup-btn" id="modalQtyMinus">−</button>
            <input type="number" id="modalQtyInput" class="qty-popup-input" min="1" value="1" />
            <button class="qty-popup-btn" id="modalQtyPlus">+</button>
          </div>
          ${piezas ? `<button class="btn-add-caja" id="modalBtnCaja">📦 Agregar caja completa (${escHtml(String(piezas))} pzas)</button>` : ''}
          <button class="btn-modal-add-cart" id="modalBtnAddCart">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 01-8 0"/>
            </svg>
            Agregar al carrito
          </button>
        </div>
      </div>
    </div>`;

  DOM.modalOverlay.hidden = false;
  document.body.style.overflow = 'hidden';
  DOM.modalClose.focus();

  // Controles de cantidad en el modal
  const modalQtyInput = $('modalQtyInput');
  $('modalQtyMinus').addEventListener('click', () => {
    modalQtyInput.value = Math.max(1, (parseInt(modalQtyInput.value) || 1) - 1);
  });
  $('modalQtyPlus').addEventListener('click', () => {
    modalQtyInput.value = (parseInt(modalQtyInput.value) || 1) + 1;
  });
  if (piezas) {
    $('modalBtnCaja').addEventListener('click', () => { modalQtyInput.value = piezas; });
  }
  $('modalBtnAddCart').addEventListener('click', () => {
    const qty = Math.max(1, parseInt(modalQtyInput.value) || 1);
    addToCart(p);
    const sku2 = getField(p, 'sku', 'SKU') ?? 'SIN-SKU';
    if (cart[sku2]) cart[sku2].qty = qty;
    saveCart(); renderCart(); updateCartCount();
    closeModal();
    openCart();
  });
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

/* ─── Carrito ────────────────────────────────────────────────────── */
const CART_KEY    = 'vmtop_cart';
const WA_NUMBER   = '525568850885';

const CART_DOM = {
  btn:       $('cartBtn'),
  count:     $('cartCount'),
  panel:     $('cartPanel'),
  backdrop:  $('cartBackdrop'),
  close:     $('cartClose'),
  items:     $('cartItems'),
  empty:     $('cartEmpty'),
  footer:    $('cartFooter'),
  totalItems:$('cartTotalItems'),
  whatsapp:  $('btnWhatsapp'),
  clear:     $('btnClearCart'),
};

// Estructura: { [sku]: { sku, nombre, imagen, qty } }
let cart = loadCart();

function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; }
  catch { return {}; }
}
function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

/* ─── Cálculo de precios activos ─────────────────────────────────── */
const DIST_THRESHOLD = 5999;

function calcCartPricing() {
  const entries = Object.values(cart);

  // Total a precio mayoreo → determina si aplica distribuidor
  const totalMayoreo = entries.reduce((sum, item) => {
    return sum + item.qty * (parseFloat(item.precio_mayoreo) || 0);
  }, 0);

  const distActive = totalMayoreo >= DIST_THRESHOLD;
  let grandTotal = 0;

  const priced = entries.map(item => {
    const pMay   = parseFloat(item.precio_mayoreo)    || 0;
    const pDist  = parseFloat(item.precio_distribuidor) || 0;
    const pCaja  = parseFloat(item.precio_caja)       || 0;
    const piezas = parseInt(item.piezas_caja)         || 0;

    let unitPrice, tier;

    if (piezas && item.qty >= piezas && pCaja) {
      // Precio por unidad efectivo al comprar caja completa
      unitPrice = pCaja / piezas;
      tier = 'caja';
    } else if (distActive && pDist) {
      unitPrice = pDist;
      tier = 'dist';
    } else {
      unitPrice = pMay;
      tier = 'mayoreo';
    }

    const lineTotal = unitPrice * item.qty;
    grandTotal += lineTotal;
    return { ...item, unitPrice, tier, lineTotal };
  });

  return { priced, grandTotal, distActive, totalMayoreo };
}

function addToCart(p) {
  const sku    = getField(p, 'sku', 'SKU') ?? 'SIN-SKU';
  const name   = getField(p, 'nombre', 'Nombre', 'NOMBRE') ?? 'Producto';
  const img    = getField(p, 'imagen', 'Imagen', 'IMAGEN', 'image', 'img') ?? '';
  const pMay   = getField(p, 'precio_mayoreo', 'PrecioMayoreo', 'Precio Mayoreo') ?? 0;
  const pDist  = getField(p, 'precio_distribuidor', 'PrecioDistribuidor', 'Precio Distribuidor') ?? 0;
  const pCaja  = getField(p, 'precio_caja', 'PrecioCaja', 'Precio Caja') ?? 0;
  const piezas = getField(p, 'piezas_caja', 'PiezasCaja', 'Piezas por Caja', 'piezas') ?? 0;

  if (cart[sku]) {
    cart[sku].qty += 1;
  } else {
    cart[sku] = { sku, nombre: name, imagen: img, qty: 1,
                  precio_mayoreo: pMay, precio_distribuidor: pDist,
                  precio_caja: pCaja, piezas_caja: piezas };
  }
  saveCart();
  renderCart();
  updateCartCount();
}

function removeFromCart(sku) {
  delete cart[sku];
  saveCart();
  renderCart();
  updateCartCount();
}

function updateQty(sku, delta) {
  if (!cart[sku]) return;
  cart[sku].qty = Math.max(1, cart[sku].qty + delta);
  saveCart();
  renderCart();
}

function clearCart() {
  cart = {};
  saveCart();
  renderCart();
  updateCartCount();
}

function formatCartBadge(total) {
  if (total === 0) return '';
  if (total >= 10000) return '$' + Math.round(total / 1000) + 'k';
  if (total >= 1000)  return '$' + (total / 1000).toFixed(1).replace('.0', '') + 'k';
  return '$' + Math.round(total);
}

function updateCartCount() {
  const { grandTotal } = calcCartPricing();
  const isEmpty = Object.keys(cart).length === 0;
  CART_DOM.count.hidden = isEmpty;
  if (!isEmpty) CART_DOM.count.textContent = formatCartBadge(grandTotal);
}

const TIER_LABEL = { mayoreo: 'Mayoreo', dist: 'Distribuidor', caja: 'Precio Caja' };
const TIER_COLOR = { mayoreo: '#f59e0b', dist: '#22c55e', caja: '#93c5fd' };

function renderCart() {
  const entries = Object.values(cart);
  CART_DOM.empty.hidden  = entries.length > 0;
  CART_DOM.footer.hidden = entries.length === 0;

  CART_DOM.items.querySelectorAll('.cart-item, .cart-tier-banner').forEach(el => el.remove());

  if (!entries.length) return;

  const { priced, grandTotal, distActive, totalMayoreo } = calcCartPricing();

  // Banner de nivel de precio activo
  const remaining = DIST_THRESHOLD - totalMayoreo;
  const banner = document.createElement('div');
  banner.className = 'cart-tier-banner';
  if (distActive) {
    banner.innerHTML = `<span class="tier-badge tier-dist">✦ Precio Distribuidor activo</span>`;
  } else {
    banner.innerHTML = `<span class="tier-badge tier-mayoreo">Mayoreo · faltan ${fmtShort(remaining)} para Distribuidor</span>`;
  }
  CART_DOM.items.appendChild(banner);

  const frag = document.createDocumentFragment();
  priced.forEach(item => {
    const div = document.createElement('div');
    div.className = 'cart-item';
    div.innerHTML = `
      ${item.imagen
        ? `<img class="cart-item-img" src="img/${escHtml(item.imagen)}" alt="${escHtml(item.nombre)}" />`
        : `<div class="cart-item-img-placeholder">📦</div>`}
      <div class="cart-item-info">
        <span class="cart-item-sku">${escHtml(item.sku)}</span>
        <span class="cart-item-name">${escHtml(item.nombre)}</span>
        <span class="cart-item-price">
          <span class="cart-tier-label" style="color:${TIER_COLOR[item.tier]}">${TIER_LABEL[item.tier]}</span>
          ${fmtShort(item.unitPrice)}/pza · <strong>${fmtShort(item.lineTotal)}</strong>
        </span>
      </div>
      <div class="cart-item-controls">
        <div class="qty-wrap">
          <button class="qty-btn" data-sku="${escHtml(item.sku)}" data-delta="-1">−</button>
          <span class="qty-value">${item.qty}</span>
          <button class="qty-btn" data-sku="${escHtml(item.sku)}" data-delta="1">+</button>
        </div>
        <button class="cart-item-remove" data-sku="${escHtml(item.sku)}" aria-label="Eliminar">🗑</button>
      </div>`;
    frag.appendChild(div);
  });
  CART_DOM.items.appendChild(frag);

  // Totales
  const totalQty = entries.reduce((s, i) => s + i.qty, 0);
  CART_DOM.totalItems.textContent = `${totalQty} artículo${totalQty !== 1 ? 's' : ''}`;

  // Mostrar total en footer
  let totalEl = CART_DOM.footer.querySelector('.cart-grand-total');
  if (!totalEl) {
    totalEl = document.createElement('div');
    totalEl.className = 'cart-grand-total';
    CART_DOM.footer.querySelector('.cart-summary').appendChild(totalEl);
  }
  totalEl.innerHTML = `<span>Total</span><span>${fmtShort(grandTotal)}</span>`;

  // Listeners
  CART_DOM.items.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => updateQty(btn.dataset.sku, +btn.dataset.delta));
  });
  CART_DOM.items.querySelectorAll('.cart-item-remove').forEach(btn => {
    btn.addEventListener('click', () => removeFromCart(btn.dataset.sku));
  });
}

function openCart()  {
  CART_DOM.panel.classList.add('open');
  CART_DOM.backdrop.classList.add('visible');
  document.body.style.overflow = 'hidden';
}
function closeCart() {
  CART_DOM.panel.classList.remove('open');
  CART_DOM.backdrop.classList.remove('visible');
  document.body.style.overflow = '';
}

function sendWhatsApp() {
  const entries = Object.values(cart);
  if (!entries.length) return;

  const nameInput = $('customerName');
  const name = nameInput.value.trim();

  if (!name) {
    nameInput.classList.add('error');
    nameInput.focus();
    nameInput.placeholder = 'Por favor escribe tu nombre';
    return;
  }
  nameInput.classList.remove('error');

  const { priced, grandTotal, distActive } = calcCartPricing();
  const tierName = distActive ? 'Distribuidor' : 'Mayoreo';

  const lines = priced.map(i =>
    `• ${i.sku} — ${i.nombre} x${i.qty} (${TIER_LABEL[i.tier]}: ${fmtShort(i.lineTotal)})`
  ).join('\n');

  const msg = `¡Hola! Mi nombre es ${name} y quiero realizar el siguiente pedido (precio ${tierName}):\n\n${lines}\n\nTotal: ${fmtShort(grandTotal)}\n\nQuedo en espera de confirmación. 😊`;
  const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

// Inicializar carrito con datos guardados
updateCartCount();
renderCart();

// Eventos del carrito
CART_DOM.btn.addEventListener('click', openCart);
CART_DOM.close.addEventListener('click', closeCart);
CART_DOM.backdrop.addEventListener('click', closeCart);
CART_DOM.whatsapp.addEventListener('click', sendWhatsApp);
CART_DOM.clear.addEventListener('click', () => { if (confirm('¿Vaciar el carrito?')) clearCart(); });

/* ─── Popup de cantidad (móvil) ──────────────────────────────────── */
const QTY_DOM = {
  overlay:  $('qtyPopupOverlay'),
  popup:    $('qtyPopup'),
  product:  $('qtyPopupProduct'),
  input:    $('qtyPopupInput'),
  minus:    $('qtyPopupMinus'),
  plus:     $('qtyPopupPlus'),
  addCaja:  $('btnAddCaja'),
  cancel:   $('qtyPopupCancel'),
  confirm:  $('qtyPopupConfirm'),
};

let qtyPopupProduct = null; // producto actual en el popup

function isMobile() { return window.innerWidth <= 768; }

function openQtyPopup(p) {
  qtyPopupProduct = p;
  const sku    = getField(p, 'sku', 'SKU') ?? '';
  const name   = getField(p, 'nombre', 'Nombre', 'NOMBRE') ?? '';
  const img    = getField(p, 'imagen', 'Imagen', 'IMAGEN', 'image', 'img') ?? '';
  const pMay   = getField(p, 'precio_mayoreo', 'PrecioMayoreo', 'Precio Mayoreo');
  const piezas = parseInt(getField(p, 'piezas_caja', 'PiezasCaja', 'Piezas por Caja', 'piezas') ?? 0);

  // Qty actual en carrito (si ya existe)
  const existing = cart[sku];
  QTY_DOM.input.value = existing ? existing.qty : 1;

  // Info del producto
  QTY_DOM.product.innerHTML = `
    ${img
      ? `<img class="qty-popup-img" src="img/${escHtml(img)}" alt="${escHtml(name)}" />`
      : `<div class="qty-popup-img-placeholder">📦</div>`}
    <div class="qty-popup-info">
      <span class="qty-popup-sku">${escHtml(sku)}</span>
      <span class="qty-popup-name">${escHtml(name)}</span>
      <span class="qty-popup-price">${fmtShort(pMay)} / pza</span>
    </div>`;

  // Botón de caja
  if (piezas) {
    QTY_DOM.addCaja.textContent = `📦 Agregar caja completa (${piezas} pzas)`;
    QTY_DOM.addCaja.hidden = false;
    QTY_DOM.addCaja.onclick = () => { QTY_DOM.input.value = piezas; };
  } else {
    QTY_DOM.addCaja.hidden = true;
  }

  QTY_DOM.popup.hidden = false;
  requestAnimationFrame(() => {
    QTY_DOM.overlay.classList.add('visible');
    QTY_DOM.popup.classList.add('open');
  });
  QTY_DOM.input.focus();
}

function closeQtyPopup() {
  QTY_DOM.overlay.classList.remove('visible');
  QTY_DOM.popup.classList.remove('open');
  setTimeout(() => { QTY_DOM.popup.hidden = true; qtyPopupProduct = null; }, 280);
}

function confirmQtyPopup() {
  if (!qtyPopupProduct) return;
  const qty = Math.max(1, parseInt(QTY_DOM.input.value) || 1);
  const sku = getField(qtyPopupProduct, 'sku', 'SKU') ?? 'SIN-SKU';

  // Agregar/actualizar directamente con la cantidad elegida
  addToCart(qtyPopupProduct);               // asegura que el item exista con todos los campos
  if (cart[sku]) cart[sku].qty = qty;       // sobreescribir con la cantidad elegida
  saveCart(); renderCart(); updateCartCount();

  closeQtyPopup();
  openCart();
}

// Controles +/-
QTY_DOM.minus.addEventListener('click', () => {
  QTY_DOM.input.value = Math.max(1, (parseInt(QTY_DOM.input.value) || 1) - 1);
});
QTY_DOM.plus.addEventListener('click', () => {
  QTY_DOM.input.value = (parseInt(QTY_DOM.input.value) || 1) + 1;
});
QTY_DOM.cancel.addEventListener('click',  closeQtyPopup);
QTY_DOM.confirm.addEventListener('click', confirmQtyPopup);
QTY_DOM.overlay.addEventListener('click', closeQtyPopup);

/* ─── PDF ────────────────────────────────────────────────────────── */
function downloadPDF() {
  window.open('print.html', '_blank');
}
const btnPdf       = $('btnPdf');
const btnPdfMobile = $('btnPdfMobile');
if (btnPdf)       btnPdf.addEventListener('click', downloadPDF);
if (btnPdfMobile) btnPdfMobile.addEventListener('click', downloadPDF);

/* ─── Hamburguesa ────────────────────────────────────────────────── */
const hamburgerBtn = $('hamburgerBtn');
const mobileMenu   = $('mobileMenu');

hamburgerBtn?.addEventListener('click', () => {
  const isOpen = mobileMenu.classList.toggle('open');
  hamburgerBtn.classList.toggle('open', isOpen);
  hamburgerBtn.setAttribute('aria-expanded', isOpen);
});

// Cerrar menú al hacer click fuera
document.addEventListener('click', (e) => {
  if (!hamburgerBtn?.contains(e.target) && !mobileMenu?.contains(e.target)) {
    mobileMenu?.classList.remove('open');
    hamburgerBtn?.classList.remove('open');
    hamburgerBtn?.setAttribute('aria-expanded', 'false');
  }
});

/* ─── Arranque ───────────────────────────────────────────────────── */
loadData();
