// Caja: lo cobrado en el turno actual por forma de pago, cierre (corte) e historial de cierres.
// No hay apertura manual: el turno empieza solo con la primera venta y termina cuando el administrador cierra la caja.
import { CONFIG } from '../config.js';
import { db } from '../db.js';
import { cerrarCaja, sesionAbierta, resumenSesion } from '../services.js';
import { imprimir, imprimirHtml, textoCierre } from '../printing.js';
import { esc, on, toast, confirmar, fmtUsd, fmtBs, fmtFechaHora, hoy, sumarDias, fechaLocal, sum, descargar, csv } from '../util.js';

const filtro = { desde: sumarDias(hoy(), -7), hasta: hoy(), caja: '' };
const fmtM = (m, c) => (m.moneda === 'USD' ? fmtUsd(c) : fmtBs(c));

export function render(el, ctx) {
  el.innerHTML = `
    <div class="grid-cajas">${CONFIG.CAJAS.map((c, i) => `<section class="card" data-caja-card="${i}"></section>`).join('')}</div>
    <section class="card" id="historial"></section>`;
  CONFIG.CAJAS.forEach((caja, i) => renderCaja(el.querySelector(`[data-caja-card="${i}"]`), ctx, caja));
  renderHistorial(el.querySelector('#historial'));
}

function renderCaja(cont, ctx, caja) {
  const ses = sesionAbierta(caja);
  if (!ses) {
    cont.innerHTML = `<h3>${esc(caja)}</h3><p class="muted">Sin ventas desde el último cierre.</p>`;
    return;
  }
  const r = resumenSesion(db(), ses);
  cont.innerHTML = `
    <h3>${esc(caja)}</h3>
    <p class="muted">Desde ${fmtFechaHora(ses.apertura)}</p>
    <div class="kpis sm">
      <div class="kpi"><small>Ventas</small><b>${r.nVentas}</b></div>
      <div class="kpi"><small>Total $</small><b>${fmtUsd(r.totalUsd)}</b></div>
      <div class="kpi"><small>Total Bs</small><b>${fmtBs(r.totalBs)}</b></div>
    </div>
    <table class="tbl tbl-sm"><thead><tr><th>Forma de pago</th><th class="num">En caja</th></tr></thead><tbody>
      ${CONFIG.METODOS_PAGO.map((m) => `<tr><td>${esc(m.nombre)}</td><td class="num">${fmtM(m, r.esperado[m.id])}</td></tr>`).join('')}
      ${r.igtfBs ? `<tr><td>IGTF</td><td class="num">${fmtBs(r.igtfBs)}</td></tr>` : ''}
    </tbody></table>
    <div class="row gap">
      <button class="btn" data-x>${CONFIG.MODO_FISCAL ? 'Reporte X' : 'Corte parcial'}</button>
      <button class="btn btn-primary grow" data-cerrar>Cerrar caja${CONFIG.MODO_FISCAL ? ' (Z)' : ''}</button>
    </div>`;
  cont.querySelector('[data-x]').onclick = () => {
    const temp = { ...ses, resumen: resumenSesion(db(), ses) };
    imprimir({ titulo: CONFIG.MODO_FISCAL ? `Reporte X ${caja}` : `Corte parcial ${caja}`, tipo: 'cierre', caja,
      texto: textoCierre(temp, CONFIG.MODO_FISCAL ? 'REPORTE X (PARCIAL)' : 'CORTE PARCIAL') });
  };
  cont.querySelector('[data-cerrar]').onclick = async () => {
    if (!(await confirmar(`Se cierra el turno de ${esc(caja)} y se imprime el cierre. Las próximas ventas de esa caja empiezan un turno nuevo. ¿Continuar?`,
      { titulo: `Cerrar ${caja}`, textoOk: 'Cerrar caja' }))) return;
    try {
      const cerrada = cerrarCaja({ sesionId: ses.id, usuario: ctx.usuario });
      toast(`${caja} cerrada`);
      imprimir({ titulo: CONFIG.MODO_FISCAL ? `Reporte Z ${caja}` : `Cierre ${caja}`, tipo: 'cierre', caja,
        texto: textoCierre(cerrada, CONFIG.MODO_FISCAL ? 'REPORTE Z - CIERRE' : 'CIERRE DE CAJA') });
    } catch (e) { toast(e.message, 'error'); }
  };
}

function renderHistorial(cont) {
  const lista = db().sesiones.filter((s) => s.estado === 'cerrada' && fechaLocal(s.cierre) >= filtro.desde && fechaLocal(s.cierre) <= filtro.hasta
    && (!filtro.caja || s.caja === filtro.caja)).sort((a, b) => b.cierre.localeCompare(a.cierre));
  const tot = Object.fromEntries(CONFIG.METODOS_PAGO.map((m) => [m.id, sum(lista, (s) => s.resumen.esperado[m.id])]));
  cont.innerHTML = `
    <div class="row between wrap"><h3>Historial de cierres</h3>
      <div class="row gap wrap">
        <label class="inline">Desde <input type="date" id="hd" value="${filtro.desde}"></label>
        <label class="inline">Hasta <input type="date" id="hh" value="${filtro.hasta}"></label>
        <select id="hc"><option value="">Todas las cajas</option>${CONFIG.CAJAS.map((c) => `<option ${filtro.caja === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <button class="btn btn-sm" id="hcsv">CSV</button><button class="btn btn-sm" id="hpdf">PDF</button>
      </div></div>
    <h4>Totales del período por forma de pago</h4>
    <div class="kpis sm">${CONFIG.METODOS_PAGO.map((m) => `<div class="kpi"><small>${esc(m.nombre)}</small><b>${fmtM(m, tot[m.id])}</b></div>`).join('')}</div>
    <table class="tbl" id="htbl"><thead><tr><th>Cierre</th><th>Caja</th><th class="num">Ventas</th><th class="num">Total $</th><th class="num">Total Bs</th><th></th></tr></thead><tbody>
      ${lista.map((s) => `<tr><td>${fmtFechaHora(s.cierre)}</td><td>${esc(s.caja)}</td>
          <td class="num">${s.resumen.nVentas}</td><td class="num">${fmtUsd(s.resumen.totalUsd)}</td><td class="num">${fmtBs(s.resumen.totalBs)}</td>
          <td class="acts"><button class="btn btn-sm" data-ver="${s.id}">Ver</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Sin cierres en el período</td></tr>'}
    </tbody></table>`;
  const set = () => { filtro.desde = cont.querySelector('#hd').value; filtro.hasta = cont.querySelector('#hh').value; filtro.caja = cont.querySelector('#hc').value; renderHistorial(cont); };
  cont.querySelector('#hd').onchange = set;
  cont.querySelector('#hh').onchange = set;
  cont.querySelector('#hc').onchange = set;
  on(cont, 'click', '[data-ver]', (e, b) => {
    const s = db().sesiones.find((x) => x.id === Number(b.dataset.ver));
    imprimir({ titulo: `Cierre ${s.caja} · ${fmtFechaHora(s.cierre)}`, tipo: 'cierre', caja: s.caja, texto: textoCierre(s) });
  });
  cont.querySelector('#hcsv').onclick = () => descargar(`cierres_${filtro.desde}_${filtro.hasta}.csv`, csv([
    ['Cierre', 'Caja', 'Ventas', 'Total $', 'Total Bs', ...CONFIG.METODOS_PAGO.map((m) => m.nombre)],
    ...lista.map((s) => [fmtFechaHora(s.cierre), s.caja, s.resumen.nVentas, s.resumen.totalUsd / 100, s.resumen.totalBs / 100,
      ...CONFIG.METODOS_PAGO.map((m) => s.resumen.esperado[m.id] / 100)]),
  ]));
  cont.querySelector('#hpdf').onclick = () => imprimirHtml(`Cierres ${filtro.desde} a ${filtro.hasta}`,
    `<h2>Totales por forma de pago</h2><table>${CONFIG.METODOS_PAGO.map((m) => `<tr><td>${esc(m.nombre)}</td><td class="num">${fmtM(m, tot[m.id])}</td></tr>`).join('')}</table>`
    + cont.querySelector('#htbl').outerHTML.replace(/<button[^>]*>Ver<\/button>/g, ''));
}
