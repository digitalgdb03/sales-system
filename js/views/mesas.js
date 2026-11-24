// Mesas y pedidos (solo con CONFIG.MODO_COMANDAS = true)
import { CONFIG } from '../config.js';
import { db } from '../db.js';
import {
  ordenDeMesa, agregarItemOrden, cambiarItemOrden, enviarComandas, liberarMesa, moverMesa, clienteOrden,
  tasaVigente, calcularTotales, sesionAbierta,
} from '../services.js';
import { imprimir, textoComanda, textoPrecuenta } from '../printing.js';
import { montarCatalogo, carritoHtml, totalesHtml, clienteChipHtml, elegirCliente, pedirNota, pedirGramos } from './components.js';
import { cobrar } from './pago.js';
import { esc, on, toast, confirmar, pedir, fmtUsd, minutosDesde, sum } from '../util.js';

let mesaSel = null;

export function render(el, ctx) {
  if (mesaSel) return renderMesa(el, ctx);
  const ordenes = db().ordenes;
  const comandas = db().comandas;
  el.innerHTML = `
    <div class="toolbar"><div class="legend"><span class="dot libre"></span>Libre <span class="dot ocupada"></span>Ocupada <span class="dot lista"></span>Pedido listo para servir</div></div>
    <div class="mesas-grid">${CONFIG.MESAS.map((m) => {
      const o = ordenes.find((x) => x.mesa === m);
      if (!o) return `<button class="mesa libre" data-mesa="${esc(m)}"><b>${esc(m)}</b><span>Libre</span></button>`;
      const tot = calcularTotales(o.items, 0);
      const sinEnviar = o.items.filter((i) => !i.enviado).length;
      const listas = comandas.filter((c) => c.ordenId === o.id && c.estado === 'lista').length;
      return `<button class="mesa ocupada ${listas ? 'lista' : ''}" data-mesa="${esc(m)}">
        <b>${esc(m)}</b><span class="mesa-total">${fmtUsd(tot.totalUsd)}</span>
        <small>${sum(o.items, (i) => (i.unidad === 'kg' ? 1 : i.cantidad))} productos · ${minutosDesde(o.abierta)} min · ${esc(o.usuario)}</small>
        ${sinEnviar ? `<span class="tag tag-warn">${sinEnviar} sin enviar</span>` : ''}
        ${listas ? '<span class="tag tag-ok">🔔 listo</span>' : ''}
      </button>`;
    }).join('')}</div>`;
  on(el, 'click', '[data-mesa]', (e, b) => { mesaSel = b.dataset.mesa; ctx.refrescar(); });
}

function renderMesa(el, ctx) {
  const mesa = mesaSel;
  el.innerHTML = `
    <div class="toolbar">
      <button class="btn" id="volver">← Mesas</button>
      <h3 class="grow">${esc(mesa)}</h3>
      <button class="btn" id="mover">Cambiar de mesa</button>
      <button class="btn" id="liberar">Liberar mesa</button>
    </div>
    <div class="pos">
      <section class="card pos-cat" id="cat"></section>
      <section class="card pos-cart">
        <div id="cli"></div>
        <div class="cart-scroll" id="lines"></div>
        <div id="tots"></div>
        <div class="pos-btns col">
          <button class="btn btn-accent btn-lg" id="enviar">Enviar a cocina / barra</button>
          <div class="row gap">
            <button class="btn grow" id="precuenta">Pre-cuenta</button>
            <button class="btn btn-primary grow" id="cobrarMesa" ${ctx.puede('venta') ? '' : 'disabled title="Solo cajeros pueden cobrar"'}>Cobrar</button>
          </div>
        </div>
      </section>
    </div>`;

  const pintar = () => {
    const o = ordenDeMesa(mesa);
    const items = o?.items || [];
    const tasa = tasaVigente()?.valor || 0;
    el.querySelector('#cli').innerHTML = clienteChipHtml(o?.clienteId || 1);
    el.querySelector('#lines').innerHTML = carritoHtml(items, { tasa, mostrarEnviado: true });
    el.querySelector('#tots').innerHTML = totalesHtml(items, tasa);
    const sinEnviar = items.filter((i) => !i.enviado).length;
    const b = el.querySelector('#enviar');
    b.disabled = !sinEnviar;
    b.textContent = sinEnviar ? `Enviar a cocina / barra (${sinEnviar})` : 'Todo enviado ✔';
    el.querySelector('#cobrarMesa').disabled = !items.length || !ctx.puede('venta');
    el.querySelector('#precuenta').disabled = !items.length;
  };

  montarCatalogo(el.querySelector('#cat'), {
    alElegir: (p, cantidad, nota) => {
      try { agregarItemOrden(mesa, p, cantidad, ctx.usuario, nota); pintar(); } catch (e) { toast(e.message, 'error'); }
    },
  });
  pintar();

  const accion = (fn) => { try { fn(); pintar(); } catch (e) { toast(e.message, 'error'); } };
  on(el, 'click', '[data-act]', async (e, b) => {
    const lineId = Number(b.closest('[data-line]').dataset.line);
    const it = ordenDeMesa(mesa).items.find((i) => i.lineId === lineId);
    const opt = { permitirEnviado: ctx.puede('orden.quitarEnviado') };
    const act = b.dataset.act;
    if (act === 'mas') accion(() => cambiarItemOrden(mesa, lineId, { cantidad: it.cantidad + 1 }, opt));
    if (act === 'menos') accion(() => cambiarItemOrden(mesa, lineId, { cantidad: it.cantidad - 1 }, opt));
    if (act === 'quitar') accion(() => cambiarItemOrden(mesa, lineId, { cantidad: 0 }, opt));
    if (act === 'nota') { const n = await pedirNota(it.nota); if (n !== null) accion(() => cambiarItemOrden(mesa, lineId, { nota: n }, opt)); }
    if (act === 'gramos') { const g = await pedirGramos(it); if (g) accion(() => cambiarItemOrden(mesa, lineId, { cantidad: g }, opt)); }
  });
  on(el, 'click', '[data-cliente]', async () => {
    if (!ordenDeMesa(mesa)) return toast('Agregue productos primero', 'warn');
    const id = await elegirCliente();
    if (id) accion(() => clienteOrden(mesa, id));
  });
  el.querySelector('#volver').onclick = () => { mesaSel = null; ctx.refrescar(); };
  el.querySelector('#enviar').onclick = () => enviar(mesa, ctx, pintar);
  el.querySelector('#precuenta').onclick = () => {
    const o = ordenDeMesa(mesa);
    const tasa = tasaVigente();
    const cli = db().clientes.find((c) => c.id === o.clienteId);
    imprimir({ titulo: `Pre-cuenta ${mesa}`, tipo: 'doc', caja: ctx.caja, texto: textoPrecuenta(o, calcularTotales(o.items, tasa.valor), tasa, cli) });
  };
  el.querySelector('#liberar').onclick = async () => {
    const o = ordenDeMesa(mesa);
    if (o?.items.length && !(await confirmar(`¿Liberar ${mesa} y descartar el pedido no enviado?`, { peligro: true }))) return;
    try { liberarMesa(mesa); mesaSel = null; ctx.refrescar(); } catch (e) { toast(e.message, 'error'); }
  };
  el.querySelector('#mover').onclick = async () => {
    if (!ordenDeMesa(mesa)) return toast('La mesa está libre', 'warn');
    const libres = CONFIG.MESAS.filter((m) => !ordenDeMesa(m));
    const d = await pedir({ titulo: `Mover pedido de ${mesa}`, textoOk: 'Mover', ancho: 380,
      campos: [{ name: 'hacia', label: 'Mesa destino', type: 'select', options: libres.map((m) => ({ value: m, text: m })) }] });
    if (d) { try { moverMesa(mesa, d.hacia); mesaSel = d.hacia; toast(`Pedido movido a ${d.hacia}`); ctx.refrescar(); } catch (e) { toast(e.message, 'error'); } }
  };
  el.querySelector('#cobrarMesa').onclick = async () => {
    let o = ordenDeMesa(mesa);
    if (o.items.some((i) => !i.enviado)) {
      if (await confirmar('Hay productos que no se han enviado a cocina/barra. ¿Enviarlos antes de cobrar?', { textoOk: 'Enviar y seguir' })) enviar(mesa, ctx, pintar);
      o = ordenDeMesa(mesa);
    }
    let clienteId = o.clienteId || 1;
    if (CONFIG.MODO_FISCAL && db().clientes.find((c) => c.id === clienteId).consumidorFinal) {
      toast('Modo fiscal: la factura requiere cédula/RIF del cliente', 'warn');
      clienteId = await elegirCliente();
      if (!clienteId) return;
      clienteOrden(mesa, clienteId);
    }
    const venta = await cobrar({ items: o.items, clienteId, ctx, mesa, ordenId: o.id });
    if (venta) { mesaSel = null; ctx.refrescar(); }
  };
}

function enviar(mesa, ctx, pintar) {
  try {
    const cms = enviarComandas(mesa, ctx.usuario);
    pintar();
    if (!cms.length) return toast('Productos marcados como servidos (no requieren preparación)');
    toast(`${cms.length} comanda(s) enviada(s)`);
    imprimir(cms.map((c) => ({ titulo: `Comanda #${c.numero} · ${CONFIG.AREAS[c.area]}`, tipo: 'comanda', area: c.area, texto: textoComanda(c) })));
  } catch (e) { toast(e.message, 'error'); }
}
