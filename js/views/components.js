// Componentes compartidos: catálogo de productos, carrito y selector de cliente.
import { CONFIG } from '../config.js';
import { db } from '../db.js';
import { guardarCliente, tasaVigente, calcularTotales } from '../services.js';
import { esc, on, modal, pedir, toast, fmtUsd, fmtBs, fmtCant, usdABs, parseDecimal, parseMonto, fmtNum } from '../util.js';

// ------------------------------------------------------------------ Catálogo
const estadoCat = { q: '', cat: 'Todas' };

export function montarCatalogo(cont, { alElegir }) {
  const cats = ['Todas', ...new Set(db().productos.filter((p) => p.activo).map((p) => p.categoria))];
  cont.innerHTML = `
    <div class="cat-head">
      <input class="search" id="catQ" data-vivo placeholder="Buscar por nombre o código…  (F3)" value="${esc(estadoCat.q)}" autocomplete="off">
      <div class="chips">${cats.map((c) => `<button class="chip ${c === estadoCat.cat ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    </div>
    <div class="prod-grid" id="catGrid"></div>`;
  const grid = cont.querySelector('#catGrid');
  const pintar = () => {
    const tasa = tasaVigente()?.valor || 0;
    const q = estadoCat.q.toLowerCase();
    const lista = db().productos.filter((p) => p.activo
      && (estadoCat.cat === 'Todas' || p.categoria === estadoCat.cat)
      && (!q || p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q)));
    grid.innerHTML = lista.map((p) => {
      const agotado = p.controlStock && p.stock <= 0;
      const bajo = p.controlStock && !agotado && p.stock <= p.stockMin;
      return `<button class="prod ${agotado ? 'agotado' : ''}" data-p="${p.id}" ${agotado ? 'disabled' : ''}>
        <span class="prod-name">${esc(p.nombre)}</span>
        <span class="prod-price">${fmtUsd(p.precioUsd)}${p.unidad === 'kg' ? '<small>/kg</small>' : ''}</span>
        <span class="prod-bs">${fmtBs(usdABs(p.precioUsd, tasa))}</span>
        ${p.controlStock ? `<span class="prod-stock ${agotado ? 'out' : bajo ? 'low' : ''}">${agotado ? 'Agotado' : `Quedan ${fmtCant(p.stock, p.unidad)}`}</span>` : '<span class="prod-stock vacio"></span>'}
        ${CONFIG.MODO_COMANDAS && p.area ? `<span class="prod-area">${esc(CONFIG.AREAS[p.area])}</span>` : ''}
      </button>`;
    }).join('') || '<div class="empty">Sin productos</div>';
  };
  pintar();
  const q = cont.querySelector('#catQ');
  q.oninput = () => { estadoCat.q = q.value; pintar(); };
  q.onkeydown = (e) => {
    if (e.key === 'Enter') {
      const first = grid.querySelector('.prod:not([disabled])');
      first?.click();
    }
  };
  on(cont, 'click', '[data-cat]', (e, b) => {
    estadoCat.cat = b.dataset.cat;
    cont.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('on', x === b));
    pintar();
  });
  on(grid, 'click', '[data-p]', async (e, b) => {
    const p = db().productos.find((x) => x.id === Number(b.dataset.p));
    const r = await pedirCantidad(p);
    if (r) alElegir(p, r.cantidad, r.nota);
  });
  return { enfocar: () => q.focus() };
}

// Productos por peso piden gramos (como el sistema anterior); los demás suman 1.
export async function pedirCantidad(p) {
  if (p.unidad !== 'kg') return { cantidad: 1, nota: '' };
  const d = await pedir({
    titulo: `${p.nombre} — por peso`,
    textoOk: 'Agregar',
    ancho: 400,
    intro: `<p class="muted">Precio: ${fmtUsd(p.precioUsd)} por kg${p.controlStock ? ` · Disponible: ${fmtCant(p.stock, 'kg')}` : ''}</p>`,
    campos: [{ name: 'gramos', label: 'Gramos', type: 'decimal', required: true, placeholder: 'Ej: 250', hint: '&nbsp;' }],
    alMontar: (el) => {
      const i = el.querySelector('[name=gramos]');
      const h = el.querySelector('[data-hint=gramos]');
      i.oninput = () => {
        const g = parseDecimal(i.value);
        h.innerHTML = g > 0 ? `Total: <b>${fmtUsd(Math.round((p.precioUsd * g) / 1000))}</b>` : '&nbsp;';
      };
    },
    validar: (d) => { if (!(parseDecimal(d.gramos) > 0)) throw new Error('Ingrese los gramos'); },
  });
  return d ? { cantidad: Math.round(parseDecimal(d.gramos)) / 1000, nota: '' } : null;
}

// ------------------------------------------------------------------ Carrito
// items: [{ lineId, nombre, unidad, cantidad, precioUsd, nota, enviado }]
export function carritoHtml(items, { tasa, mostrarEnviado = false } = {}) {
  if (!items.length) return '<div class="empty small">Agregue productos tocando el catálogo</div>';
  return `<div class="cart-lines">${items.map((i) => `
    <div class="cart-line ${i.enviado ? 'enviado' : ''}" data-line="${i.lineId}">
      <div class="cl-main">
        <div class="cl-name">${esc(i.nombre)} ${mostrarEnviado && i.enviado ? '<span class="tag tag-ok">enviado</span>' : ''}</div>
        <div class="cl-sub">${fmtUsd(i.precioUsd)}${i.unidad === 'kg' ? '/kg' : ''} · ${fmtBs(usdABs(i.precioUsd, tasa))}</div>
        ${i.nota ? `<div class="cl-nota">» ${esc(i.nota)}</div>` : ''}
      </div>
      <div class="cl-qty">
        ${i.unidad === 'kg'
          ? `<button class="btn-q" data-act="gramos">${fmtCant(i.cantidad, 'kg')}</button>`
          : `<button class="btn-q" data-act="menos">−</button><span>${fmtNum(i.cantidad, 0)}</span><button class="btn-q" data-act="mas">+</button>`}
      </div>
      <div class="cl-total">${fmtUsd(Math.round(i.precioUsd * i.cantidad))}</div>
      <div class="cl-actions">
        ${CONFIG.MODO_COMANDAS ? '<button class="btn-icon" data-act="nota" title="Nota para cocina">✎</button>' : ''}
        <button class="btn-icon" data-act="quitar" title="Quitar">✕</button>
      </div>
    </div>`).join('')}</div>`;
}

export function totalesHtml(items, tasa) {
  const t = calcularTotales(items, tasa);
  return `<div class="totals">
    ${CONFIG.MODO_FISCAL ? `<div class="tl"><span>Base imponible</span><span>${fmtUsd(t.baseUsd)}</span></div>
      <div class="tl"><span>IVA ${CONFIG.IMPUESTOS.IVA}%</span><span>${fmtUsd(t.ivaUsd)}</span></div>` : ''}
    <div class="tl big"><span>Total</span><span>${fmtUsd(t.totalUsd)}</span></div>
    <div class="tl bs"><span>Total Bs</span><span>${fmtBs(t.totalBs)}</span></div>
  </div>`;
}

export async function pedirNota(actual) {
  const d = await pedir({ titulo: 'Nota para cocina / barra', ancho: 420, textoOk: 'Guardar',
    campos: [{ name: 'nota', label: 'Nota', value: actual || '', placeholder: 'Ej: sin azúcar, leche deslactosada…' }] });
  return d ? d.nota : null;
}
export async function pedirGramos(item) {
  const d = await pedir({ titulo: `${item.nombre} — gramos`, ancho: 380, textoOk: 'Cambiar',
    campos: [{ name: 'g', label: 'Gramos', type: 'decimal', required: true, value: Math.round(item.cantidad * 1000) }] });
  return d && parseDecimal(d.g) > 0 ? Math.round(parseDecimal(d.g)) / 1000 : null;
}

// ------------------------------------------------------------------ Cliente
export function clienteChipHtml(clienteId) {
  const c = db().clientes.find((x) => x.id === clienteId) || db().clientes[0];
  return `<button class="cliente-chip" data-cliente>
    <span class="avatar sm">${esc(c.nombre[0])}</span>
    <span><b>${esc(c.nombre)}</b><small>${esc(c.cedula)}${CONFIG.MODULO_FIADO && c.limiteUsd ? ` · crédito disp. ${fmtUsd(c.limiteUsd - c.saldoUsd)}` : ''}</small></span>
    <span class="muted">cambiar ▾</span></button>`;
}

// Búsqueda por cédula o nombre + alta rápida (como en el sistema anterior)
export function elegirCliente() {
  return new Promise((res) => {
    let elegido = null;
    const filas = (q) => {
      q = q.toLowerCase().replace(/[^a-z0-9áéíóúñ ]/g, '');
      return db().clientes.filter((c) => !q || c.nombre.toLowerCase().includes(q) || c.cedula.toLowerCase().replace(/[^a-z0-9]/g, '').includes(q))
        .slice(0, 30).map((c) => `<tr data-c="${c.id}" class="clickable"><td>${esc(c.cedula)}</td><td>${esc(c.nombre)}</td>
          ${CONFIG.MODULO_FIADO ? `<td class="num">${c.limiteUsd ? fmtUsd(c.limiteUsd - c.saldoUsd) : '—'}</td>` : ''}</tr>`).join('');
    };
    modal({
      titulo: 'Cliente',
      ancho: 560,
      cuerpo: `<div class="row gap"><input class="search grow" id="cq" placeholder="Cédula / RIF o nombre"><button class="btn" id="nuevoCli">+ Nuevo</button></div>
        <table class="tbl tbl-sm"><thead><tr><th>Cédula/RIF</th><th>Nombre</th>${CONFIG.MODULO_FIADO ? '<th class="num">Crédito disp.</th>' : ''}</tr></thead><tbody id="cbody">${filas('')}</tbody></table>`,
      alMontar: (el, ctx) => {
        const q = el.querySelector('#cq');
        q.oninput = () => (el.querySelector('#cbody').innerHTML = filas(q.value));
        q.onkeydown = (e) => { if (e.key === 'Enter') el.querySelector('[data-c]')?.click(); };
        on(el, 'click', '[data-c]', (e, tr) => { elegido = Number(tr.dataset.c); ctx.cerrar(); });
        el.querySelector('#nuevoCli').onclick = async () => {
          const c = await formCliente({ cedula: /\d/.test(q.value) ? q.value : '', nombre: /\d/.test(q.value) ? '' : q.value });
          if (c) { elegido = c.id; ctx.cerrar(); }
        };
      },
      alCerrar: () => res(elegido),
    });
  });
}

export async function formCliente(c = {}, { conCredito = false } = {}) {
  const campos = [
    { name: 'cedula', label: 'Cédula / RIF', required: true, value: c.cedula || '', placeholder: 'V-12345678' },
    { name: 'nombre', label: 'Nombre / Razón social', required: true, value: c.nombre || '' },
    { name: 'telefono', label: 'Teléfono', value: c.telefono || '' },
  ];
  conCredito = conCredito && CONFIG.MODULO_FIADO;
  if (conCredito) campos.push({ name: 'limite', label: 'Límite de crédito $ (0 = no fía)', type: 'money', value: ((c.limiteUsd || 0) / 100).toFixed(2).replace('.', ',') });
  let res = null;
  const d = await pedir({
    titulo: c.id ? 'Editar cliente' : 'Nuevo cliente',
    campos,
    validar: (d) => {
      const cedula = d.cedula.toUpperCase().replace(/\s/g, '');
      if (!/^[VEJGP]-?\d{5,9}(-?\d)?$/.test(cedula)) throw new Error('Cédula/RIF inválido. Formato: V-12345678 o J-12345678-9');
      const datos = { cedula: cedula.includes('-') ? cedula : cedula[0] + '-' + cedula.slice(1), nombre: d.nombre, telefono: d.telefono };
      if (conCredito) {
        const lim = parseMonto(d.limite || '0');
        if (!(lim >= 0)) throw new Error('Límite inválido');
        datos.limiteUsd = lim;
      }
      if (c.id) datos.id = c.id;
      res = guardarCliente(datos) || db().clientes.find((x) => x.id === c.id);
    },
  });
  if (d) toast(c.id ? 'Cliente actualizado' : 'Cliente registrado');
  return d ? res : null;
}
