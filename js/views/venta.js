// Venta directa en mostrador (con MODO_COMANDAS se llama "Venta rápida" y puede mandar comandas al cobrar).
import { CONFIG } from '../config.js';
import { db } from '../db.js';
import { tasaVigente, calcularTotales } from '../services.js';
import { estadoTasa } from '../tasa.js';
import { abrirModalTasa } from './tasaModal.js';
import { montarCatalogo, carritoHtml, totalesHtml, clienteChipHtml, elegirCliente, pedirNota, pedirGramos } from './components.js';
import { cobrar } from './pago.js';
import { esc, on, toast, confirmar, fmtUsd, fmtBs } from '../util.js';

const KEY = 'sistemaVenta_carrito';
const carrito = JSON.parse(sessionStorage.getItem(KEY) || 'null') || { items: [], clienteId: 1, seq: 0, comandas: true };
const guardar = () => sessionStorage.setItem(KEY, JSON.stringify(carrito));
let catalogo = null;

export function render(el, ctx) {
  const est = estadoTasa();
  el.innerHTML = `
    ${est.nivel !== 'ok' ? `<div class="banner banner-${est.nivel === 'alerta' ? 'err' : 'warn'}">Tasa: ${esc(est.texto)}. <a href="#" data-tasa>Revisar tasa</a> (se puede seguir vendiendo).</div>` : ''}
    <div class="pos">
      <section class="card pos-cat" id="cat"></section>
      <section class="card pos-cart">
        ${ctx.cajaFija() ? '' : `<label class="vender-desde">Vender desde <select id="cajaVenta">${CONFIG.CAJAS.map((c) => `<option ${c === ctx.caja ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>`}
        <div id="cli"></div>
        <div class="cart-scroll" id="lines"></div>
        <div id="tots"></div>
        ${CONFIG.MODO_COMANDAS ? `<label class="check small"><input type="checkbox" id="chkCom" ${carrito.comandas ? 'checked' : ''}> Enviar a cocina/barra al cobrar</label>` : ''}
        <div class="pos-btns">
          <button class="btn" id="vaciar">Vaciar</button>
          <button class="btn btn-primary btn-lg grow" id="cobrar">Cobrar <kbd>F2</kbd></button>
        </div>
      </section>
    </div>
    <div class="pos-barra">
      <button class="btn" id="verCarrito">Carrito <b id="pbN"></b></button>
      <div class="pb-total"><b id="pbTotal"></b><small id="pbBs"></small></div>
      <button class="btn btn-primary" id="cobrarMovil">Cobrar</button>
    </div>`;

  catalogo = montarCatalogo(el.querySelector('#cat'), {
    alElegir: (p, cantidad, nota) => {
      const enCarrito = carrito.items.filter((i) => i.productoId === p.id).reduce((a, i) => a + i.cantidad, 0);
      if (p.controlStock && enCarrito + cantidad > p.stock + 1e-9) return toast(`Stock insuficiente de ${p.nombre}`, 'error');
      const ex = p.unidad !== 'kg' && carrito.items.find((i) => i.productoId === p.id && !i.nota);
      if (ex) ex.cantidad += cantidad;
      else carrito.items.push({ lineId: ++carrito.seq, productoId: p.id, nombre: p.nombre, unidad: p.unidad, cantidad, precioUsd: p.precioUsd, nota: nota || '' });
      guardar();
      pintar();
    },
  });

  const pintar = () => {
    const tasa = tasaVigente()?.valor || 0;
    el.querySelector('#cli').innerHTML = clienteChipHtml(carrito.clienteId);
    el.querySelector('#lines').innerHTML = carritoHtml(carrito.items, { tasa });
    el.querySelector('#tots').innerHTML = totalesHtml(carrito.items, tasa);
    el.querySelector('#cobrar').disabled = !carrito.items.length;
    // Barra inferior (solo en celular): total y cobrar siempre a la vista
    const t = calcularTotales(carrito.items, tasa);
    el.querySelector('#pbN').textContent = carrito.items.length ? `(${carrito.items.length})` : '';
    el.querySelector('#pbTotal').textContent = fmtUsd(t.totalUsd);
    el.querySelector('#pbBs').textContent = fmtBs(t.totalBs);
    el.querySelector('#cobrarMovil').disabled = !carrito.items.length;
  };
  pintar();

  on(el, 'click', '[data-tasa]', (e) => { e.preventDefault(); abrirModalTasa(ctx); });
  on(el, 'click', '[data-cliente]', async () => {
    const id = await elegirCliente();
    if (id) { carrito.clienteId = id; guardar(); pintar(); }
  });
  on(el, 'click', '[data-act]', async (e, b) => {
    const line = Number(b.closest('[data-line]').dataset.line);
    const it = carrito.items.find((i) => i.lineId === line);
    const p = db().productos.find((x) => x.id === it.productoId);
    const act = b.dataset.act;
    if (act === 'mas') {
      if (p.controlStock && it.cantidad + 1 > p.stock) return toast(`Stock insuficiente de ${p.nombre}`, 'error');
      it.cantidad++;
    } else if (act === 'menos') it.cantidad--;
    else if (act === 'quitar') it.cantidad = 0;
    else if (act === 'nota') { const n = await pedirNota(it.nota); if (n !== null) it.nota = n; }
    else if (act === 'gramos') { const g = await pedirGramos(it); if (g) it.cantidad = g; }
    carrito.items = carrito.items.filter((i) => i.cantidad > 0);
    guardar();
    pintar();
  });
  el.querySelector('#chkCom')?.addEventListener('change', (e) => { carrito.comandas = e.target.checked; guardar(); });
  el.querySelector('#vaciar').onclick = async () => {
    if (carrito.items.length && !(await confirmar('¿Vaciar la venta actual?'))) return;
    carrito.items = []; carrito.clienteId = 1; guardar(); pintar();
  };
  el.querySelector('#cobrar').onclick = () => iniciarCobro(ctx);
  el.querySelector('#cobrarMovil').onclick = () => iniciarCobro(ctx);
  el.querySelector('#verCarrito').onclick = () => el.querySelector('.pos-cart').scrollIntoView({ behavior: 'smooth' });
  el.querySelector('#cajaVenta')?.addEventListener('change', (e) => ctx.cambiarCaja(e.target.value));
}

async function iniciarCobro(ctx) {
  if (!ctx.puede('venta')) return toast('Su usuario no puede cobrar', 'error');
  if (!carrito.items.length) return toast('Agregue productos', 'error');
  let cli = db().clientes.find((c) => c.id === carrito.clienteId);
  if (CONFIG.MODO_FISCAL && cli.consumidorFinal) {
    toast('Modo fiscal: la factura requiere cédula/RIF del cliente', 'warn');
    const id = await elegirCliente();
    if (!id) return;
    carrito.clienteId = id; guardar();
  }
  const venta = await cobrar({ items: carrito.items, clienteId: carrito.clienteId, ctx, comandasAlCobrar: CONFIG.MODO_COMANDAS && carrito.comandas });
  if (venta) {
    carrito.items = []; carrito.clienteId = 1; guardar();
    ctx.refrescar();
  }
}

export function teclas(e, ctx) {
  if (e.key === 'F2') { e.preventDefault(); iniciarCobro(ctx); }
  if (e.key === 'F3') { e.preventDefault(); catalogo?.enfocar(); }
}
