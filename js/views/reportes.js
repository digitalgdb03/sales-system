import { CONFIG, metodo } from '../config.js';
import { db } from '../db.js';
import { tasaVigente } from '../services.js';
import { imprimirHtml } from '../printing.js';
import { esc, on, fmtUsd, fmtBs, fmtCant, fmtNum, fmtYmd, fmtTasa, hoy, sumarDias, fechaLocal, sum, agrupar, usdABs } from '../util.js';

const r = { preset: '7', desde: sumarDias(hoy(), -6), hasta: hoy() };
const PRESETS = [['hoy', 'Hoy'], ['ayer', 'Ayer'], ['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['custom', 'Personalizado']];

function aplicarPreset() {
  const h = hoy();
  if (r.preset === 'hoy') { r.desde = h; r.hasta = h; }
  if (r.preset === 'ayer') { r.desde = sumarDias(h, -1); r.hasta = sumarDias(h, -1); }
  if (r.preset === '7') { r.desde = sumarDias(h, -6); r.hasta = h; }
  if (r.preset === '30') { r.desde = sumarDias(h, -29); r.hasta = h; }
}

export function render(el) {
  const s = db();
  const enRango = (iso) => { const d = fechaLocal(iso); return d >= r.desde && d <= r.hasta; };
  const ventas = s.ventas.filter((v) => v.estado !== 'anulada' && enRango(v.fecha));
  const gastos = s.gastos.filter((g) => enRango(g.fecha));
  const totUsd = sum(ventas, (v) => v.totalUsd);
  const gasUsd = sum(gastos, (g) => g.montoUsd);
  const porCobrar = sum(s.clientes, (c) => c.saldoUsd);
  const tasa = tasaVigente()?.valor || 0;

  const tabla = (titulo, cols, filas, clase = '') => `<div class="card ${clase}"><h4>${titulo}</h4><table class="tbl tbl-sm"><thead><tr>${cols.map((c, i) => `<th class="${i ? 'num' : ''}">${c}</th>`).join('')}</tr></thead>
    <tbody>${filas.map((f) => `<tr>${f.map((c, i) => `<td class="${i ? 'num' : ''}">${c}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="empty">Sin datos</td></tr>`}</tbody></table></div>`;

  // Por método (equivalente en $)
  const met = {};
  ventas.forEach((v) => v.pagos.forEach((p) => {
    const x = (met[p.metodo] ||= { n: 0, usd: 0, mon: 0 });
    const vueltoMismaMoneda = p.vuelto?.monto && p.vuelto.moneda === metodo(p.metodo).moneda ? p.vuelto.monto : 0;
    x.n++;
    x.usd += p.aplicadoUsd;
    x.mon += p.entregado - vueltoMismaMoneda;
  }));
  const filasMet = Object.entries(met).sort((a, b) => b[1].usd - a[1].usd).map(([id, x]) => {
    const m = metodo(id);
    return [esc(m.nombre), x.n, m.moneda === 'USD' ? fmtUsd(x.mon) : fmtBs(x.mon), fmtUsd(x.usd), `${fmtNum(totUsd ? (x.usd / totUsd) * 100 : 0, 1)}%`];
  });
  // Top productos
  const prods = {};
  ventas.forEach((v) => v.items.forEach((i) => { (prods[i.nombre] ||= { cant: 0, usd: 0, unidad: i.unidad }); prods[i.nombre].cant += i.cantidad; prods[i.nombre].usd += i.totalUsd; }));
  const filasProd = Object.entries(prods).sort((a, b) => b[1].usd - a[1].usd).slice(0, 12).map(([n, x]) => [esc(n), fmtCant(x.cant, x.unidad), fmtUsd(x.usd)]);
  const grupo = (fn) => Object.entries(agrupar(ventas, fn)).map(([k, vs]) => [esc(k), vs.length, fmtUsd(sum(vs, (v) => v.totalUsd)), fmtBs(sum(vs, (v) => v.totalBs))]);
  const filasDia = Object.entries(agrupar(ventas, (v) => fechaLocal(v.fecha))).sort((a, b) => b[0].localeCompare(a[0]))
    .map(([d, vs]) => [fmtYmd(d), vs.length, fmtUsd(sum(vs, (v) => v.totalUsd)), fmtBs(sum(vs, (v) => v.totalBs)), fmtTasa(vs[0].tasa.valor)]);

  el.innerHTML = `
    <div class="toolbar wrap">
      <div class="seg">${PRESETS.map(([k, t]) => `<button class="seg-btn ${r.preset === k ? 'on' : ''}" data-p="${k}">${t}</button>`).join('')}</div>
      ${r.preset === 'custom' ? `<label class="inline">Desde <input type="date" id="rd" value="${r.desde}"></label><label class="inline">Hasta <input type="date" id="rh" value="${r.hasta}"></label>` : `<span class="muted">${fmtYmd(r.desde)} – ${fmtYmd(r.hasta)}</span>`}
      <span class="grow"></span><button class="btn" id="pdf">Imprimir / PDF</button>
    </div>
    <div id="rep">
      <div class="kpis">
        <div class="kpi"><small>Ventas</small><b>${ventas.length}</b></div>
        <div class="kpi"><small>Ingresos</small><b>${fmtUsd(totUsd)}</b><span>${fmtBs(sum(ventas, (v) => v.totalBs))}</span></div>
        <div class="kpi"><small>Gastos</small><b>${fmtUsd(gasUsd)}</b></div>
        <div class="kpi"><small>Ingresos − gastos</small><b class="${totUsd - gasUsd < 0 ? 'err-txt' : ''}">${fmtUsd(totUsd - gasUsd)}</b></div>
        ${CONFIG.MODULO_FIADO ? `<div class="kpi"><small>Por cobrar (fiado, hoy)</small><b>${fmtUsd(porCobrar)}</b><span>${fmtBs(usdABs(porCobrar, tasa))}</span></div>` : ''}
        ${CONFIG.MODO_FISCAL ? `<div class="kpi"><small>IVA</small><b>${fmtUsd(sum(ventas, (v) => v.ivaUsd))}</b></div><div class="kpi"><small>IGTF</small><b>${fmtBs(sum(ventas, (v) => v.igtfBs))}</b></div>` : ''}
      </div>
      <div class="grid-2 parejo">
        ${tabla('Por método de pago', ['Método', 'Pagos', 'Recibido', 'Equivalente $', '%'], filasMet)}
        ${tabla('Productos más vendidos', ['Producto', 'Cantidad', 'Total $'], filasProd)}
        ${tabla('Por vendedor', ['Vendedor', 'Ventas', 'Total $', 'Total Bs'], grupo((v) => v.usuario))}
        ${tabla('Por caja', ['Caja', 'Ventas', 'Total $', 'Total Bs'], grupo((v) => v.caja))}
        ${tabla('Por día', ['Día', 'Ventas', 'Total $', 'Total Bs', 'Tasa'], filasDia, 'full')}
      </div>
    </div>`;
  on(el, 'click', '[data-p]', (e, b) => { r.preset = b.dataset.p; aplicarPreset(); render(el); });
  el.querySelector('#rd')?.addEventListener('change', (e) => { r.desde = e.target.value; render(el); });
  el.querySelector('#rh')?.addEventListener('change', (e) => { r.hasta = e.target.value; render(el); });
  el.querySelector('#pdf').onclick = () => imprimirHtml(`Reporte ${fmtYmd(r.desde)} a ${fmtYmd(r.hasta)}`,
    el.querySelector('#rep').innerHTML.replace(/<div class="kpi"><small>([^<]*)<\/small><b[^>]*>([^<]*)<\/b>(?:<span>([^<]*)<\/span>)?<\/div>/g, '<p><b>$1:</b> $2 $3</p>'));
}
