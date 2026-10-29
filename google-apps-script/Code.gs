/* ================================================================
   VMTOP – Pedidos y pagos PayPal (Google Apps Script)
   Sustituye a: paypal-create-order.php, paypal-capture-order.php,
                crear-pedido.php y notificar-pedido.php (Hostinger).

   Qué hace:
     • action "create"   → crea la orden en PayPal y devuelve su ID
     • action "capture"  → cobra el pago, guarda el pedido en la hoja
                            y manda correo de aviso
     • action "whatsapp" → registra en la hoja los pedidos enviados
                            por WhatsApp (sin pago en línea)

   Configuración (una sola vez):
     Configuración del proyecto (⚙) → Propiedades de la secuencia de
     comandos → agregar:
        PP_CLIENT_ID   = Client ID LIVE de PayPal
        PP_SECRET      = Secret LIVE de PayPal
        NOTIFY_EMAIL   = correo donde quieres recibir los avisos
   ================================================================ */

const PP_BASE   = 'https://api-m.paypal.com';   // producción
const TZ        = 'America/Mexico_City';
const SHEET_PEDIDOS = 'Pedidos';
const SHEET_DETALLE = 'Detalle';

const HEADERS_PEDIDOS = [
  'Folio', 'Fecha', 'Origen', 'Estado', 'Nombre', 'Email', 'Teléfono',
  'Dirección', 'Ciudad', 'C.P.', 'Productos', 'Piezas', 'Subtotal',
  'Envío', 'Total', 'Cobrado PayPal', 'Orden PayPal', 'Captura PayPal',
  'Nivel precio', 'Notas',
];
const HEADERS_DETALLE = [
  'Folio', 'Fecha', 'Origen', 'SKU', 'Producto', 'Cantidad',
  'Precio unitario', 'Total línea', 'Nivel',
];

/* ─── Entrada HTTP ──────────────────────────────────────────────── */
function doGet() {
  return json_({ ok: true, service: 'vmtop-pedidos' });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    switch (body.action) {
      case 'create':   return json_(createPayPalOrder_(body));
      case 'capture':  return json_(capturePayPalOrder_(body));
      case 'whatsapp': return json_(registerWhatsAppOrder_(body));
      default:         return json_({ error: 'Acción no válida' });
    }
  } catch (err) {
    console.error(err);
    return json_({ error: String(err && err.message || err) });
  }
}

/* ─── PayPal: crear orden ───────────────────────────────────────── */
function createPayPalOrder_(body) {
  const amount = Number(body.amount);
  if (!amount || amount <= 0) return { error: 'Monto inválido' };
  const order = sanitizeOrder_(body.order);

  const res = paypalFetch_('/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{
      amount: { currency_code: 'MXN', value: amount.toFixed(2) },
      description: 'Pedido VMTOP Mayoreo',
    }],
    application_context: {
      brand_name: 'VMTOP',
      locale: 'es-MX',
      user_action: 'PAY_NOW',
      shipping_preference: 'NO_SHIPPING',
    },
  }, 'vmtop-' + Utilities.getUuid());

  if (!res.id) return { error: 'Error creando orden en PayPal', details: res };

  // Guardamos los datos del pedido mientras el cliente aprueba en PayPal (6 h)
  CacheService.getScriptCache().put('order_' + res.id, JSON.stringify(order), 21600);
  return { id: res.id };
}

/* ─── PayPal: capturar pago y registrar pedido ──────────────────── */
function capturePayPalOrder_(body) {
  const orderID = String(body.orderID || '').trim();
  if (!/^[A-Z0-9]+$/.test(orderID)) return { error: 'orderID inválido' };

  // PayPal-Request-Id = orderID → si se repite la llamada no se cobra dos veces
  const cap = paypalFetch_('/v2/checkout/orders/' + orderID + '/capture', {}, 'cap-' + orderID);
  const capture = cap.purchase_units && cap.purchase_units[0] &&
                  cap.purchase_units[0].payments && cap.purchase_units[0].payments.captures &&
                  cap.purchase_units[0].payments.captures[0];

  const cached = CacheService.getScriptCache().get('order_' + orderID);
  const order  = cached ? JSON.parse(cached) : sanitizeOrder_(body.order);

  // Tarjeta rechazada antes de crear el cobro (PayPal responde 422)
  if (cap.name === 'UNPROCESSABLE_ENTITY') {
    const issue = (cap.details && cap.details[0] && cap.details[0].issue) || cap.name;
    logAttempt_('RECHAZADO', order, orderID, '', 'PayPal: ' + issue);
    return { error: 'Pago rechazado', declined: true, issue: issue };
  }

  if (cap.status !== 'COMPLETED' || !capture) {
    logAttempt_('ERROR', order, orderID, '', 'Estado de la orden: ' + (cap.status || cap.name || 'desconocido'));
    return { error: 'Pago no completado', status: cap.status || '', details: cap };
  }

  // La orden puede estar COMPLETED aunque el cobro con tarjeta se haya
  // rechazado o quede en revisión: hay que revisar el estado del cobro.
  const reason = (capture.status_details && capture.status_details.reason) || '';
  if (capture.status === 'DECLINED' || capture.status === 'FAILED') {
    logAttempt_('RECHAZADO', order, orderID, capture.id, 'Cobro ' + capture.status + (reason ? ' (' + reason + ')' : ''));
    return { error: 'Pago rechazado', declined: true, issue: capture.status };
  }
  if (capture.status !== 'COMPLETED') {
    // PENDING: PayPal lo está revisando. NO enviar mercancía hasta que se complete.
    const folioP = logAttempt_('PENDIENTE PAYPAL', order, orderID, capture.id,
      '⚠ NO ENVIAR hasta que PayPal marque el cobro como completado' + (reason ? ' (' + reason + ')' : ''));
    try { notifyOwner_(folioP, 'PayPal – COBRO PENDIENTE (no enviar aún)', order, null, capture.id); }
    catch (err) { console.error(err); }
    return { success: false, pending: true, captureId: capture.id, folio: folioP };
  }

  const paid   = Number(capture.amount && capture.amount.value) || 0;

  const notes = [];
  if (Math.abs(paid - Number(order.total || 0)) > 0.5) {
    notes.push('⚠ REVISAR: monto cobrado distinto al total del carrito');
  }
  if (!cached) notes.push('Datos del pedido tomados del navegador');

  let folio = '';
  try {
    folio = saveOrder_({
      origen: 'PayPal',
      estado: 'PAGADO',
      order: order,
      paid: paid,
      orderID: orderID,
      captureId: capture.id,
      notas: notes.join(' | '),
    });
  } catch (err) {
    // El cobro ya se hizo: nunca devolver error al cliente por un fallo de la hoja
    console.error('No se pudo guardar en la hoja', orderID, err);
    notifyFailure_(orderID, capture.id, order, err);
  }

  try { notifyOwner_(folio, 'PayPal – PAGADO', order, paid, capture.id); }
  catch (err) { console.error('No se pudo enviar el correo', err); }

  return { success: true, captureId: capture.id, folio: folio };
}

/* Registra intentos no cobrados (rechazados / pendientes) sin cortar el flujo */
function logAttempt_(estado, order, orderID, captureId, notas) {
  try {
    return saveOrder_({
      origen: 'PayPal', estado: estado, order: order, paid: '',
      orderID: orderID, captureId: captureId, notas: notas,
    });
  } catch (err) {
    console.error('No se pudo registrar el intento', orderID, err);
    return '';
  }
}

/* ─── Pedido por WhatsApp (solo registro) ───────────────────────── */
function registerWhatsAppOrder_(body) {
  const order = sanitizeOrder_(body.order);
  if (!order.items.length) return { error: 'Pedido vacío' };
  const folio = saveOrder_({
    origen: 'WhatsApp',
    estado: 'PENDIENTE',
    order: order,
    paid: '',
    orderID: '',
    captureId: '',
    notas: '',
  });
  try { notifyOwner_(folio, 'WhatsApp – PENDIENTE', order, null, ''); }
  catch (err) { console.error('No se pudo enviar el correo', err); }
  return { success: true, folio: folio };
}

/* ─── Hoja de cálculo ───────────────────────────────────────────── */
function saveOrder_(r) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss      = SpreadsheetApp.getActiveSpreadsheet();
    const pedidos = getSheet_(ss, SHEET_PEDIDOS, HEADERS_PEDIDOS);
    const detalle = getSheet_(ss, SHEET_DETALLE, HEADERS_DETALLE);

    const folio = 'VMT-' + String(pedidos.getLastRow()).padStart(5, '0');
    const fecha = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
    const o     = r.order;
    const c     = o.customer;
    const piezas = o.items.reduce(function (s, i) { return s + i.qty; }, 0);
    const resumen = o.items.map(function (i) {
      return i.sku + ' x' + i.qty;
    }).join(', ');

    pedidos.appendRow([
      folio, fecha, r.origen, r.estado, c.name, c.email, c.phone,
      c.address, c.city, c.zip, resumen, piezas, o.subtotal,
      o.shipping, o.total, r.paid, r.orderID, r.captureId,
      o.tier, r.notas,
    ].map(safeCell_));

    const rows = o.items.map(function (i) {
      return [folio, fecha, r.origen, i.sku, i.name, i.qty, i.unitPrice, i.lineTotal, i.tier]
        .map(safeCell_);
    });
    if (rows.length) {
      detalle.getRange(detalle.getLastRow() + 1, 1, rows.length, HEADERS_DETALLE.length).setValues(rows);
    }
    return folio;
  } finally {
    lock.releaseLock();
  }
}

function getSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  }
  return sh;
}

/* Evita que un texto que empiece con = + - @ se interprete como fórmula */
function safeCell_(v) {
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

/* ─── Correo de aviso ───────────────────────────────────────────── */
function notifyOwner_(folio, titulo, o, paid, captureId) {
  const to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL');
  if (!to) return;
  const c = o.customer;
  const lines = o.items.map(function (i) {
    return '• ' + i.sku + ' — ' + i.name + ' x' + i.qty + ' = $' + Number(i.lineTotal).toFixed(2);
  }).join('\n');
  const text =
    'Nuevo pedido ' + folio + ' (' + titulo + ')\n\n' +
    'Cliente: ' + c.name + '\nEmail: ' + c.email + '\nTeléfono: ' + c.phone + '\n' +
    'Dirección: ' + [c.address, c.city, c.zip].filter(String).join(', ') + '\n\n' +
    lines + '\n\n' +
    'Subtotal: $' + Number(o.subtotal).toFixed(2) + '\n' +
    'Envío: $' + Number(o.shipping).toFixed(2) + '\n' +
    'Total: $' + Number(o.total).toFixed(2) + ' MXN\n' +
    (paid !== null ? 'Cobrado en PayPal: $' + Number(paid).toFixed(2) + ' (captura ' + captureId + ')\n' : '') +
    '\nHoja: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl();
  MailApp.sendEmail({
    to: to,
    subject: 'VMTOP ' + folio + ' – ' + titulo + ' – ' + c.name,
    body: text,
    replyTo: c.email || undefined,
  });
}

function notifyFailure_(orderID, captureId, o, err) {
  const to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL');
  if (!to) return;
  MailApp.sendEmail(to, '⚠ VMTOP – pago cobrado pero NO guardado en la hoja',
    'Orden PayPal: ' + orderID + '\nCaptura: ' + captureId + '\nError: ' + err +
    '\n\nDatos:\n' + JSON.stringify(o, null, 2));
}

/* ─── Utilidades ────────────────────────────────────────────────── */
function sanitizeOrder_(raw) {
  raw = raw || {};
  const c = raw.customer || {};
  const str = function (v, max) { return String(v == null ? '' : v).slice(0, max || 200); };
  const num = function (v) { const n = Number(v); return isFinite(n) ? Math.round(n * 100) / 100 : 0; };
  const items = (Array.isArray(raw.items) ? raw.items : []).slice(0, 500).map(function (i) {
    return {
      sku: str(i.sku, 60),
      name: str(i.name, 200),
      qty: Math.max(0, parseInt(i.qty, 10) || 0),
      unitPrice: num(i.unitPrice),
      lineTotal: num(i.lineTotal),
      tier: str(i.tier, 30),
    };
  });
  return {
    customer: {
      name: str(c.name, 120), email: str(c.email, 120), phone: str(c.phone, 40),
      address: str(c.address, 250), city: str(c.city, 80), zip: str(c.zip, 10),
    },
    items: items,
    subtotal: num(raw.subtotal),
    shipping: num(raw.shipping),
    total: num(raw.total),
    tier: str(raw.tier, 30),
  };
}

function paypalToken_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('pp_token');
  if (hit) return hit;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PP_CLIENT_ID');
  const secret = props.getProperty('PP_SECRET');
  if (!id || !secret) throw new Error('Faltan PP_CLIENT_ID / PP_SECRET en las propiedades del script');
  const res = UrlFetchApp.fetch(PP_BASE + '/v1/oauth2/token', {
    method: 'post',
    payload: 'grant_type=client_credentials',
    headers: { Authorization: 'Basic ' + Utilities.base64Encode(id + ':' + secret) },
    muteHttpExceptions: true,
  });
  const data = JSON.parse(res.getContentText());
  if (!data.access_token) throw new Error('No se pudo autenticar con PayPal');
  cache.put('pp_token', data.access_token, Math.min(21600, Math.max(60, (data.expires_in || 3600) - 300)));
  return data.access_token;
}

function paypalFetch_(path, payload, requestId) {
  const res = UrlFetchApp.fetch(PP_BASE + path, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: {
      Authorization: 'Bearer ' + paypalToken_(),
      'PayPal-Request-Id': requestId,
    },
    muteHttpExceptions: true,
  });
  const text = res.getContentText();
  return text ? JSON.parse(text) : {};
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ─── Prueba manual (ejecutar desde el editor) ──────────────────── */
function probarConexionPayPal() {
  console.log('Token OK: ' + paypalToken_().slice(0, 12) + '…');
  console.log('Hoja: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl());
}
