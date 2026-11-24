// Fiado / "Lista negra": clientes con crédito, cargos (ventas fiadas) y abonos.
import { CONFIG, metodo } from '../config.js';
import { db } from '../db.js';
import { registrarAbono, tasaVigente, sesionAbierta } from '../services.js';
import { imprimir, imprimirHtml, textoEstadoCuenta } from '../printing.js';
import { formCliente } from './components.js';
import { detalleVenta } from './ventas.js';
import { esc, on, toast, modal, fmtUsd, fmtBs, fmtFechaHora, usdABs, parseMonto, centsToInput, sum } from '../util.js';

let sel = null;

export function render(el, ctx) {
  const tasa = tasaVigente()?.valor || 0;
  const deudores = db().clientes.filter((c) => c.limiteUsd > 0 || c.saldoUsd > 0).sort((a, b) => b.saldoUsd - a.saldoUsd);
  const total = sum(deudores, (c) => c.saldoUsd);
  if (sel && !deudores.some((c) => c.id === sel)) sel = null;
  el.innerHTML = `
    <div class="kpis">
      <div class="kpi"><small>Total por cobrar</small><b>${fmtUsd(total)}</b><span>${fmtBs(usdABs(total, tasa))}</span></div>
      <div class="kpi"><small>Clientes con deuda</small><b>${deudores.filter((c) => c.saldoUsd > 0).length}</b></div>
      <div class="kpi"><small>Clientes con crédito</small><b>${deudores.length}</b></div>
    </div>
    <div class="grid-2 wide-right">
      <section class="card">
        <div class="row between"><h3>Clientes con crédito</h3>${ctx.puede('clientes.credito') ? '<button class="btn btn-sm btn-primary" id="nuevo">+ Nuevo</button>' : ''}</div>
        <table class="tbl"><thead><tr><th>Cliente</th><th class="num">Deuda</th><th class="num">Disponible</th></tr></thead><tbody>
        ${deudores.map((c) => {
          const pct = c.limiteUsd ? c.saldoUsd / c.limiteUsd : 1;
          return `<tr class="clickable ${sel === c.id ? 'row-hl' : ''}" data-c="${c.id}"><td><b>${esc(c.nombre)}</b><br><small class="muted">${esc(c.cedula)}</small></td>
            <td class="num ${pct >= 0.9 ? 'err-txt' : ''}">${fmtUsd(c.saldoUsd)}<br><small class="muted">${fmtBs(usdABs(c.saldoUsd, tasa))}</small></td>
            <td class="num">${fmtUsd(Math.max(0, c.limiteUsd - c.saldoUsd))}<div class="meter"><i style="width:${Math.min(100, pct * 100)}%"></i></div></td></tr>`;
        }).join('') || '<tr><td colspan="3" class="empty">Ningún cliente tiene crédito. Asigne un límite en Clientes.</td></tr>'}
        </tbody></table>
        <p class="muted small">Para fiar, en la venta seleccione el cliente y use el método de pago "Fiado".</p>
      </section>
      <section class="card" id="detalle">${sel ? '' : '<div class="empty">Seleccione un cliente para ver su cuenta</div>'}</section>
    </div>`;
  on(el, 'click', '[data-c]', (e, tr) => { sel = Number(tr.dataset.c); render(el, ctx); });
  el.querySelector('#nuevo')?.addEventListener('click', () => formCliente({ limiteUsd: 2000 }, { conCredito: true }));
  if (sel) renderDetalle(el.querySelector('#detalle'), ctx, sel);
}

function renderDetalle(cont, ctx, id) {
  const tasa = tasaVigente();
  const c = db().clientes.find((x) => x.id === id);
  const movs = db().movFiado.filter((m) => m.clienteId === id).sort((a, b) => b.fecha.localeCompare(a.fecha));
  cont.innerHTML = `
    <div class="row between"><div><h3>${esc(c.nombre)}</h3><small class="muted">${esc(c.cedula)} · ${esc(c.telefono || '')}</small></div>
      <div class="row gap">
        ${ctx.puede('clientes.credito') ? '<button class="btn btn-sm" id="editar">Editar límite</button>' : ''}
        <button class="btn btn-sm" id="estado">Estado de cuenta</button>
        ${ctx.puede('fiado.abonar') ? `<button class="btn btn-primary" id="abonar" ${c.saldoUsd ? '' : 'disabled'}>Registrar abono</button>` : ''}
      </div></div>
    <div class="kpis sm">
      <div class="kpi"><small>Deuda</small><b>${fmtUsd(c.saldoUsd)}</b><span>${fmtBs(usdABs(c.saldoUsd, tasa.valor))}</span></div>
      <div class="kpi"><small>Límite</small><b>${fmtUsd(c.limiteUsd)}</b></div>
      <div class="kpi"><small>Disponible</small><b>${fmtUsd(Math.max(0, c.limiteUsd - c.saldoUsd))}</b></div>
    </div>
    <h4>Movimientos</h4>
    <div class="tbl-wrap"><table class="tbl tbl-sm" id="mtbl"><thead><tr><th>Fecha</th><th>Concepto</th><th>Usuario</th><th class="num">Cargo $</th><th class="num">Abono $</th></tr></thead><tbody>
    ${movs.map((m) => `<tr class="${m.ventaId ? 'clickable' : ''}" ${m.ventaId ? `data-v="${m.ventaId}"` : ''}><td>${fmtFechaHora(m.fecha)}</td>
      <td>${esc(m.concepto)}${m.pago?.referencia ? ` <small class="muted">Ref ${esc(m.pago.referencia)}</small>` : ''}${m.pago?.estado === 'por_confirmar' ? ' <span class="tag tag-warn">por confirmar</span>' : ''}</td>
      <td>${esc(m.usuario)}</td><td class="num">${m.tipo === 'cargo' ? fmtUsd(m.montoUsd) : ''}</td><td class="num ok-txt">${m.tipo === 'abono' ? fmtUsd(m.montoUsd) : ''}</td></tr>`).join('')
      || '<tr><td colspan="5" class="empty">Sin movimientos</td></tr>'}
    </tbody></table></div>`;
  on(cont, 'click', '[data-v]', (e, tr) => detalleVenta(Number(tr.dataset.v), ctx));
  cont.querySelector('#editar')?.addEventListener('click', () => formCliente(c, { conCredito: true }));
  cont.querySelector('#estado').onclick = () => {
    const asc = [...movs].reverse();
    imprimir({ titulo: `Estado de cuenta ${c.nombre}`, tipo: 'doc', caja: ctx.caja, texto: textoEstadoCuenta(c, asc, tasa) });
  };
  cont.querySelector('#abonar')?.addEventListener('click', () => abonar(c, ctx));
}

function abonar(c, ctx) {
  const tasa = tasaVigente();
  const metodos = CONFIG.METODOS_PAGO.filter((m) => !m.fiado);
  let sel = 'divisas';
  modal({
    titulo: `Abono · ${c.nombre}`,
    ancho: 520,
    cuerpo: `<p>Deuda: <b>${fmtUsd(c.saldoUsd)}</b> = ${fmtBs(usdABs(c.saldoUsd, tasa.valor))} <small class="muted">(tasa ${tasa.valor})</small></p>
      <div class="metodos sm">${metodos.map((m) => `<button class="metodo" data-m="${m.id}"><b>${esc(m.nombre)}</b></button>`).join('')}</div>
      <div id="af"></div>`,
    acciones: [
      { texto: 'Cancelar' },
      {
        texto: 'Registrar abono', clase: 'btn-primary',
        accion: (ctxm) => {
          const m = metodo(sel);
          const monto = parseMonto(ctxm.el.querySelector('#monto').value);
          if (!(monto > 0)) throw new Error('Monto inválido');
          const datos = {};
          ctxm.el.querySelectorAll('[data-campo]').forEach((i) => { if (i.value.trim()) datos[i.dataset.campo] = i.value.trim(); });
          if (m.confirmar && !datos.referencia) throw new Error('La referencia es obligatoria');
          const mov = registrarAbono({ clienteId: c.id, metodoId: sel, entregado: monto, datos, usuario: ctx.usuario, caja: ctx.caja || CONFIG.CAJAS[0] });
          toast(`Abono de ${fmtUsd(mov.montoUsd)} registrado`);
          const cli = db().clientes.find((x) => x.id === c.id);
          imprimir({ titulo: 'Comprobante de abono', tipo: 'doc', caja: ctx.caja, gaveta: m.efectivo,
            texto: textoEstadoCuenta(cli, db().movFiado.filter((x) => x.clienteId === c.id).slice(-8), tasaVigente()) });
        },
      },
    ],
    alMontar: (el) => {
      const af = el.querySelector('#af');
      const pintar = () => {
        el.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === sel));
        const m = metodo(sel);
        const total = m.moneda === 'USD' ? c.saldoUsd : usdABs(c.saldoUsd, tasa.valor);
        af.innerHTML = `<div class="form-grid">
          <div class="field"><label>Monto (${m.moneda === 'USD' ? '$' : 'Bs'}) *</label><input id="monto" inputmode="decimal" placeholder="${centsToInput(total)}">
            <small class="hint">Deuda total: ${m.moneda === 'USD' ? fmtUsd(total) : fmtBs(total)}</small></div>
          ${(m.campos || []).map((k) => `<div class="field"><label>${k[0].toUpperCase() + k.slice(1)}</label><input data-campo="${k}"></div>`).join('')}</div>`;
        af.querySelector('#monto').focus();
      };
      el.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { sel = b.dataset.m; pintar(); }));
      pintar();
    },
  });
}
