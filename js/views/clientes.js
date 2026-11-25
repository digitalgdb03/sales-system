import { CONFIG } from '../config.js';
import { db } from '../db.js';
import { eliminarCliente } from '../services.js';
import { formCliente } from './components.js';
import { detalleVenta } from './ventas.js';
import { docVenta, paginar, alPaginar, esc, on, toast, modal, confirmar, fmtUsd, fmtBs, fmtFechaHora, sum, descargar, csv } from '../util.js';

let q = '';

export function render(el, ctx) {
  const fiado = CONFIG.MODULO_FIADO;
  const credito = fiado && ctx.puede('clientes.credito');
  el.innerHTML = `
    <section class="card">
      <div class="toolbar">
        <input class="search grow" id="q" placeholder="Buscar por cédula/RIF o nombre" value="${esc(q)}">
        <button class="btn btn-sm" id="csv">CSV</button>
        <button class="btn btn-primary" id="nuevo">+ Nuevo cliente</button>
      </div>
      <div id="tabla"></div>
    </section>`;
  const pintar = () => {
    const t = q.toLowerCase();
    const lista = db().clientes.filter((c) => !t || c.nombre.toLowerCase().includes(t) || c.cedula.toLowerCase().includes(t));
    const compras = {};
    db().ventas.filter((v) => v.estado !== 'anulada').forEach((v) => { (compras[v.clienteId] ||= { n: 0, usd: 0 }); compras[v.clienteId].n++; compras[v.clienteId].usd += v.totalUsd; });
    const pag = paginar('clientes', lista, { clave: q });
    el.querySelector('#tabla').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Cédula / RIF</th><th>Nombre</th><th>Teléfono</th>
      ${fiado ? '<th class="num">Límite crédito</th><th class="num">Deuda</th>' : ''}<th class="num">Compras</th><th class="num">Total comprado</th><th></th></tr></thead><tbody>
      ${pag.items.map((c) => `<tr class="clickable" data-hist="${c.id}"><td>${esc(c.cedula)}</td><td><b>${esc(c.nombre)}</b></td><td>${esc(c.telefono || '—')}</td>
        ${fiado ? `<td class="num">${c.limiteUsd ? fmtUsd(c.limiteUsd) : '—'}</td><td class="num ${c.saldoUsd ? 'err-txt' : ''}">${c.saldoUsd ? fmtUsd(c.saldoUsd) : '—'}</td>` : ''}
        <td class="num">${compras[c.id]?.n || 0}</td><td class="num">${fmtUsd(compras[c.id]?.usd || 0)}</td>
        <td class="acts">${c.consumidorFinal ? '' : `<button class="btn btn-sm" data-edit="${c.id}">Editar</button><button class="btn-icon" data-del="${c.id}">🗑</button>`}</td></tr>`).join('')}
      </tbody></table></div>${pag.html}`;
  };
  pintar();
  alPaginar(el.querySelector('#tabla'), pintar);
  el.querySelector('#q').oninput = (e) => { q = e.target.value; pintar(); };
  el.querySelector('#nuevo').onclick = () => formCliente({}, { conCredito: credito });
  on(el, 'click', '[data-edit]', (e, b) => { e.stopPropagation(); formCliente(db().clientes.find((c) => c.id === Number(b.dataset.edit)), { conCredito: credito }); });
  on(el, 'click', '[data-del]', async (e, b) => {
    e.stopPropagation();
    const c = db().clientes.find((x) => x.id === Number(b.dataset.del));
    if (!(await confirmar(`¿Eliminar a ${esc(c.nombre)}?`, { peligro: true }))) return;
    try { eliminarCliente(c.id); toast('Cliente eliminado'); } catch (err) { toast(err.message, 'error'); }
  });
  on(el, 'click', '[data-hist]', (e, tr) => { if (!e.target.closest('button')) historial(Number(tr.dataset.hist), ctx); });
  el.querySelector('#csv').onclick = () => descargar('clientes.csv', csv([['Cédula/RIF', 'Nombre', 'Teléfono', ...(fiado ? ['Límite $', 'Deuda $'] : [])],
    ...db().clientes.map((c) => [c.cedula, c.nombre, c.telefono, ...(fiado ? [c.limiteUsd / 100, c.saldoUsd / 100] : [])])]));
}

function historial(id, ctx) {
  const c = db().clientes.find((x) => x.id === id);
  const ventas = db().ventas.filter((v) => v.clienteId === id).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const validas = ventas.filter((v) => v.estado !== 'anulada');
  modal({
    titulo: `Compras de ${c.nombre}`,
    ancho: 640,
    cuerpo: `<div class="kpis sm"><div class="kpi"><small>Compras</small><b>${validas.length}</b></div>
      <div class="kpi"><small>Total $</small><b>${fmtUsd(sum(validas, (v) => v.totalUsd))}</b></div>
      <div class="kpi"><small>Total Bs</small><b>${fmtBs(sum(validas, (v) => v.totalBs))}</b></div></div>
      <div id="compras"></div>`,
    acciones: [{ texto: 'Cerrar', clase: 'btn-primary' }],
    alMontar: (el) => {
      const cont = el.querySelector('#compras');
      const pintar = () => {
        const pag = paginar(`compras-${id}`, ventas);
        cont.innerHTML = `<table class="tbl tbl-sm"><thead><tr><th>Documento</th><th>Fecha</th><th>Vendedor</th><th class="num">Total $</th><th class="num">Total Bs</th></tr></thead><tbody>
      ${pag.items.map((v) => `<tr class="clickable ${v.estado === 'anulada' ? 'anulada' : ''}" data-v="${v.id}"><td>${esc(docVenta(v.doc))}</td><td>${fmtFechaHora(v.fecha)}</td><td>${esc(v.usuario)}</td>
        <td class="num">${fmtUsd(v.totalUsd)}</td><td class="num">${fmtBs(v.totalBs)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Sin compras</td></tr>'}
      </tbody></table>${pag.html}`;
      };
      pintar();
      alPaginar(cont, pintar);
      on(el, 'click', '[data-v]', (e, tr) => detalleVenta(Number(tr.dataset.v), ctx));
    },
  });
}
