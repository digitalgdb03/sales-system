// Historial de ventas con filtros + verificación de pagos (pago móvil / transferencia / Zelle).
import { CONFIG, metodo } from '../config.js';
import { db } from '../db.js';
import { anularVenta, confirmarPago, confirmarPagoAbono } from '../services.js';
import { imprimir, imprimirHtml, textoVenta } from '../printing.js';
import { docVenta, esc, on, modal, toast, pedir, fmtUsd, fmtBs, fmtTasa, fmtFechaHora, fmtCant, fmtYmd, hoy, sumarDias, fechaLocal, parseMonto, sum, descargar, csv } from '../util.js';

let tab = 'historial';
const f = { desde: sumarDias(hoy(), -2), hasta: hoy(), cliente: '', vendedor: '', caja: '', metodo: '', moneda: 'USD', min: '', max: '', estado: '' };

export function render(el, ctx) {
  if (!CONFIG.CONFIRMAR_PAGOS) {
    el.innerHTML = '<div id="tabBody"></div>';
    return renderHistorial(el.querySelector('#tabBody'), ctx);
  }
  const porConfirmar = pendientes().length;
  el.innerHTML = `
    <div class="tabs">
      <button class="tab ${tab === 'historial' ? 'on' : ''}" data-tab="historial">Historial</button>
      <button class="tab ${tab === 'confirmar' ? 'on' : ''}" data-tab="confirmar">Pagos por confirmar ${porConfirmar ? `<em class="badge">${porConfirmar}</em>` : ''}</button>
    </div>
    <div id="tabBody"></div>`;
  on(el, 'click', '[data-tab]', (e, b) => { tab = b.dataset.tab; render(el, ctx); });
  const body = el.querySelector('#tabBody');
  if (tab === 'historial') renderHistorial(body, ctx);
  else renderConfirmar(body, ctx);
}

function filtrar() {
  const desde = new Date(`${f.desde}T00:00:00`).toISOString();
  const hasta = new Date(`${sumarDias(f.hasta, 1)}T00:00:00`).toISOString();
  const q = f.cliente.toLowerCase();
  const min = parseMonto(f.min);
  const max = parseMonto(f.max);
  const monto = (v) => (f.moneda === 'USD' ? v.totalUsd : v.totalBs);
  return db().ventas.filter((v) => v.fecha >= desde && v.fecha < hasta
    && (!q || v.cliente.nombre.toLowerCase().includes(q) || v.cliente.cedula.toLowerCase().includes(q))
    && (!f.vendedor || v.usuario === f.vendedor)
    && (!f.caja || v.caja === f.caja)
    && (!f.metodo || v.pagos.some((p) => p.metodo === f.metodo))
    && (!f.estado || v.estado === f.estado)
    && (!Number.isFinite(min) || monto(v) >= min)
    && (!Number.isFinite(max) || monto(v) <= max)).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

function renderHistorial(cont, ctx) {
  const vendedores = [...new Set(db().ventas.map((v) => v.usuario))];
  cont.innerHTML = `
    <section class="card">
      <div class="filters">
        <label>Desde<input type="date" data-f="desde" value="${f.desde}"></label>
        <label>Hasta<input type="date" data-f="hasta" value="${f.hasta}"></label>
        <label>Cliente<input data-f="cliente" value="${esc(f.cliente)}" placeholder="Nombre o cédula"></label>
        <label>Vendedor<select data-f="vendedor"><option value="">Todos</option>${vendedores.map((v) => `<option ${f.vendedor === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
        <label>Caja<select data-f="caja"><option value="">Todas</option>${CONFIG.CAJAS.map((c) => `<option ${f.caja === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label>Método<select data-f="metodo"><option value="">Todos</option>${CONFIG.METODOS_PAGO.map((m) => `<option value="${m.id}" ${f.metodo === m.id ? 'selected' : ''}>${esc(m.nombre)}</option>`).join('')}</select></label>
        <label>Monto en<select data-f="moneda"><option value="USD" ${f.moneda === 'USD' ? 'selected' : ''}>$</option><option value="BS" ${f.moneda === 'BS' ? 'selected' : ''}>Bs</option></select></label>
        <label>Mayor o igual a<input data-f="min" inputmode="decimal" value="${esc(f.min)}"></label>
        <label>Menor o igual a<input data-f="max" inputmode="decimal" value="${esc(f.max)}"></label>
        <label>Estado<select data-f="estado"><option value="">Todas</option><option value="pagada" ${f.estado === 'pagada' ? 'selected' : ''}>Pagadas</option><option value="anulada" ${f.estado === 'anulada' ? 'selected' : ''}>Anuladas</option></select></label>
        <div class="row gap end"><button class="btn btn-sm" id="csv">CSV</button><button class="btn btn-sm" id="pdf">PDF</button></div>
      </div>
      <div id="tabla"></div>
    </section>`;
  const pintar = () => {
    const lista = filtrar();
    const validas = lista.filter((v) => v.estado !== 'anulada');
    cont.querySelector('#tabla').innerHTML = `
      <div class="kpis sm">
        <div class="kpi"><small>Ventas</small><b>${validas.length}</b></div>
        <div class="kpi"><small>Total $</small><b>${fmtUsd(sum(validas, (v) => v.totalUsd))}</b></div>
        <div class="kpi"><small>Total Bs</small><b>${fmtBs(sum(validas, (v) => v.totalBs))}</b></div>
        ${CONFIG.MODO_FISCAL ? `<div class="kpi"><small>IVA $</small><b>${fmtUsd(sum(validas, (v) => v.ivaUsd))}</b></div><div class="kpi"><small>IGTF Bs</small><b>${fmtBs(sum(validas, (v) => v.igtfBs))}</b></div>` : ''}
      </div>
      <div class="tbl-wrap"><table class="tbl" id="vtbl"><thead><tr><th>Documento</th><th>Fecha</th><th>Caja</th><th>Vendedor</th><th>Cliente</th>
        ${CONFIG.MODO_COMANDAS ? '<th>Mesa</th>' : ''}<th>Pago</th><th class="num">Total $</th><th class="num">Total Bs</th><th class="num">Tasa</th><th></th></tr></thead><tbody>
        ${lista.slice(0, 300).map((v) => `<tr class="clickable ${v.estado === 'anulada' ? 'anulada' : ''}" data-v="${v.id}">
          <td><small>${v.doc.tipo === 'FACTURA' ? 'FAC' : 'NE'} ${esc(v.doc.numero)}</small></td><td>${fmtFechaHora(v.fecha)}</td><td>${esc(v.caja)}</td>
          <td>${esc(v.usuario)}</td><td>${esc(v.cliente.nombre)}</td>${CONFIG.MODO_COMANDAS ? `<td>${esc(v.mesa || '—')}</td>` : ''}
          <td>${v.pagos.map((p) => `<span class="tag ${p.estado === 'por_confirmar' ? 'tag-warn' : ''}">${esc(metodo(p.metodo).nombre)}</span>`).join(' ')}</td>
          <td class="num">${fmtUsd(v.totalUsd)}</td><td class="num">${fmtBs(v.totalBs)}</td><td class="num"><small>${fmtTasa(v.tasa.valor)}</small></td>
          <td>${v.estado === 'anulada' ? '<span class="tag tag-err">Anulada</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="11" class="empty">Sin ventas con esos filtros</td></tr>'}
      </tbody></table></div>
      ${lista.length > 300 ? `<p class="muted small">Mostrando 300 de ${lista.length}. Ajuste los filtros o exporte a CSV.</p>` : ''}`;
  };
  pintar();
  on(cont, 'input', '[data-f]', (e, i) => { f[i.dataset.f] = i.value; pintar(); });
  on(cont, 'change', 'select[data-f], input[type=date]', (e, i) => { f[i.dataset.f] = i.value; pintar(); });
  on(cont, 'click', '[data-v]', (e, tr) => detalleVenta(Number(tr.dataset.v), ctx));
  cont.querySelector('#csv').onclick = () => {
    const lista = filtrar();
    descargar(`ventas_${f.desde}_${f.hasta}.csv`, csv([
      ['Documento', 'Control', 'Fecha', 'Caja', 'Vendedor', 'Cédula', 'Cliente', 'Mesa', 'Métodos', 'Total $', 'Total Bs', 'IVA $', 'IGTF Bs', 'Tasa', 'Origen tasa', 'Estado'],
      ...lista.map((v) => [v.doc.numero, v.doc.control || '', fmtFechaHora(v.fecha), v.caja, v.usuario, v.cliente.cedula, v.cliente.nombre, v.mesa || '',
        v.pagos.map((p) => metodo(p.metodo).nombre).join(' + '), v.totalUsd / 100, v.totalBs / 100, v.ivaUsd / 100, v.igtfBs / 100, v.tasa.valor, v.tasa.origen, v.estado]),
    ]));
  };
  cont.querySelector('#pdf').onclick = () => imprimirHtml(`Ventas ${fmtYmd(f.desde)} a ${fmtYmd(f.hasta)}`, cont.querySelector('#tabla').innerHTML);
}

export function detalleVenta(id, ctx) {
  const v = db().ventas.find((x) => x.id === id);
  modal({
    titulo: docVenta(v.doc),
    ancho: 720,
    cuerpo: `
      ${v.estado === 'anulada' ? `<div class="banner banner-err">Anulada ${fmtFechaHora(v.anulacion.fecha)} por ${esc(v.anulacion.usuario)}: ${esc(v.anulacion.motivo)}</div>` : ''}
      <div class="grid-2 sm">
        <div><small class="muted">Cliente</small><br><b>${esc(v.cliente.nombre)}</b> · ${esc(v.cliente.cedula)}</div>
        <div><small class="muted">Fecha / Caja / Vendedor</small><br>${fmtFechaHora(v.fecha)} · ${esc(v.caja)} · ${esc(v.usuario)}</div>
        <div><small class="muted">Tasa usada</small><br><b>${fmtTasa(v.tasa.valor)}</b> (${v.tasa.origen === 'BCV' ? 'BCV' : 'manual'}, fecha valor ${fmtYmd(v.tasa.fechaValor)})</div>
        ${v.doc.control ? `<div><small class="muted">N° de control</small><br>${esc(v.doc.control)}</div>` : v.mesa ? `<div><small class="muted">Mesa</small><br>${esc(v.mesa)}</div>` : ''}
      </div>
      <table class="tbl tbl-sm"><thead><tr><th>Producto</th><th class="num">Cant.</th><th class="num">Precio $</th><th class="num">Total $</th></tr></thead><tbody>
        ${v.items.map((i) => `<tr><td>${esc(i.nombre)}${i.nota ? `<br><small class="muted">» ${esc(i.nota)}</small>` : ''}</td><td class="num">${fmtCant(i.cantidad, i.unidad)}</td>
          <td class="num">${fmtUsd(i.precioUsd)}${i.unidad === 'kg' ? '/kg' : ''}</td><td class="num">${fmtUsd(i.totalUsd)}</td></tr>`).join('')}
      </tbody><tfoot>
        ${v.ivaUsd ? `<tr><td colspan="3">Base imponible / IVA</td><td class="num">${fmtUsd(v.baseUsd)} / ${fmtUsd(v.ivaUsd)}</td></tr>` : ''}
        <tr><td colspan="3"><b>Total</b></td><td class="num"><b>${fmtUsd(v.totalUsd)}</b><br>${fmtBs(v.totalBs)}</td></tr>
        ${v.igtfBs ? `<tr><td colspan="3">IGTF</td><td class="num">${fmtBs(v.igtfBs)}</td></tr>` : ''}
      </tfoot></table>
      <h4>Pagos</h4>
      <table class="tbl tbl-sm"><tbody>${v.pagos.map((p) => {
        const m = metodo(p.metodo);
        return `<tr><td><b>${esc(m.nombre)}</b>${['referencia', 'banco', 'titular', 'cedula', 'telefono'].filter((k) => p[k]).map((k) => `<br><small class="muted">${k}: ${esc(p[k])}</small>`).join('')}</td>
          <td class="num">${m.moneda === 'USD' ? fmtUsd(p.entregado) : fmtBs(p.entregado)}${p.vuelto?.monto ? `<br><small>vuelto ${p.vuelto.moneda === 'USD' ? fmtUsd(p.vuelto.monto) : fmtBs(p.vuelto.monto)}</small>` : ''}</td>
          ${!CONFIG.CONFIRMAR_PAGOS ? '' : `<td>${p.estado === 'por_confirmar' ? '<span class="tag tag-warn">Por confirmar</span>' : `<span class="tag tag-ok">OK</span>${p.confirmadoPor ? `<br><small class="muted">${esc(p.confirmadoPor)}</small>` : ''}`}</td>`}</tr>`;
      }).join('')}</tbody></table>`,
    acciones: [
      ...(v.estado !== 'anulada' && ctx.puede('ventas.anular') ? [{
        texto: CONFIG.MODO_FISCAL ? 'Anular (nota de crédito)' : 'Anular venta', clase: 'btn-danger',
        accion: async () => {
          const d = await pedir({ titulo: `Anular ${docVenta(v.doc)}`, textoOk: 'Anular', campos: [{ name: 'motivo', label: 'Motivo', required: true }],
            intro: '<p class="muted">Se devuelve el stock y, si fue fiada, se descuenta de la deuda del cliente.</p>' });
          if (!d) return false;
          anularVenta(v.id, ctx.usuario, d.motivo);
          toast(`${docVenta(v.doc)} anulada`);
        },
      }] : []),
      { texto: 'Reimprimir', accion: () => { imprimir({ titulo: `${v.doc.tipo} ${v.doc.numero} (copia)`, tipo: 'doc', caja: v.caja, texto: textoVenta(v) }); } },
      { texto: 'Cerrar', clase: 'btn-primary' },
    ],
  });
}

function pendientes() {
  const s = db();
  const deVentas = s.ventas.filter((v) => v.estado !== 'anulada').flatMap((v) => v.pagos.map((p, idx) => ({ p, idx, v })).filter((x) => x.p.estado === 'por_confirmar'))
    .map((x) => ({ tipo: 'venta', fecha: x.v.fecha, ref: docVenta(x.v.doc), cliente: x.v.cliente.nombre, pago: x.p, ventaId: x.v.id, idx: x.idx }));
  const deAbonos = s.movFiado.filter((m) => m.pago?.estado === 'por_confirmar')
    .map((m) => ({ tipo: 'abono', fecha: m.fecha, ref: `Abono fiado`, cliente: s.clientes.find((c) => c.id === m.clienteId)?.nombre, pago: m.pago, movId: m.id }));
  return [...deVentas, ...deAbonos].sort((a, b) => b.fecha.localeCompare(a.fecha));
}

function renderConfirmar(cont, ctx) {
  const lista = pendientes();
  cont.innerHTML = `<section class="card">
    <p class="muted">Pagos electrónicos registrados con referencia que aún no se han verificado contra el banco.</p>
    <table class="tbl"><thead><tr><th>Fecha</th><th>Origen</th><th>Cliente</th><th>Método</th><th>Referencia</th><th>Datos</th><th class="num">Monto</th><th></th></tr></thead><tbody>
    ${lista.map((x, i) => {
      const m = metodo(x.pago.metodo);
      return `<tr><td>${fmtFechaHora(x.fecha)}</td><td>${esc(x.ref)}</td><td>${esc(x.cliente)}</td><td>${esc(m.nombre)}</td><td><b>${esc(x.pago.referencia || '—')}</b></td>
        <td><small>${['banco', 'titular', 'cedula', 'telefono'].filter((k) => x.pago[k]).map((k) => esc(x.pago[k])).join(' · ')}</small></td>
        <td class="num">${m.moneda === 'USD' ? fmtUsd(x.pago.entregado) : fmtBs(x.pago.entregado)}</td>
        <td>${ctx.puede('pagos.confirmar') ? `<button class="btn btn-sm btn-primary" data-conf="${i}">Confirmar</button>` : ''}</td></tr>`;
    }).join('') || '<tr><td colspan="8" class="empty">No hay pagos pendientes por confirmar ✔</td></tr>'}
    </tbody></table></section>`;
  on(cont, 'click', '[data-conf]', (e, b) => {
    const x = lista[Number(b.dataset.conf)];
    if (x.tipo === 'venta') confirmarPago(x.ventaId, x.idx, ctx.usuario);
    else confirmarPagoAbono(x.movId, ctx.usuario);
    toast('Pago confirmado');
  });
}
