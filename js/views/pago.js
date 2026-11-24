// Cobro con pagos mixtos (reemplaza la ventana MetodoPago del sistema anterior).
import { CONFIG, metodo } from '../config.js';
import { db } from '../db.js';
import { tasaVigente, calcularTotales, aplicarPago, montoParaRestante, crearVenta, comandasDeVentaRapida } from '../services.js';
import { imprimir, textoVenta, textoComanda } from '../printing.js';
import { docVenta, esc, modal, toast, fmtUsd, fmtBs, fmtTasa, parseMonto, centsToInput, sum, bsAUsd } from '../util.js';

const CAMPOS = {
  referencia: { label: 'Referencia', placeholder: 'Últimos dígitos' },
  banco: { label: 'Banco', placeholder: 'Ej: Banesco' },
  titular: { label: 'Titular', placeholder: 'Nombre del titular' },
  cedula: { label: 'Cédula titular', placeholder: 'V-12345678' },
  telefono: { label: 'Teléfono', placeholder: '0414-1234567' },
};
const REQUERIDOS = ['referencia'];
const campoHtml = (m, campos) => (campos.length ? `<div class="form-grid">${campos.map((c) => `<div class="field"><label>${CAMPOS[c].label}${REQUERIDOS.includes(c) && m.confirmar ? ' *' : ''}</label>
  <input data-campo="${c}" placeholder="${CAMPOS[c].placeholder}"></div>`).join('')}</div>` : '');

// Devuelve Promise<venta | null>
export function cobrar({ items, clienteId, ctx, mesa = null, ordenId = null, comandasAlCobrar = false }) {
  const tasa = tasaVigente();
  if (!tasa) { toast('No hay tasa registrada. Cárguela en el indicador de tasa.', 'error'); return Promise.resolve(null); }
  const tot = calcularTotales(items, tasa.valor);
  const cliente = db().clientes.find((c) => c.id === clienteId);
  const pagos = [];
  let sel = 'pagomovil';
  let monedaVuelto = 'BS';

  const restanteBs = () => tot.totalBs - sum(pagos, (p) => p.aplicadoBs);
  const igtfTotal = () => sum(pagos, (p) => p.igtfBs);
  const excedenteBs = () => sum(pagos, (p) => p.excedenteBs);

  return new Promise((resolve) => {
    let ventaFinal = null;
    modal({
      titulo: `Cobrar ${mesa ? '· ' + mesa : ''}`,
      ancho: 860,
      cuerpo: `
        <div class="pago">
          <div class="pago-left">
            <div class="pago-cli"><b>${esc(cliente.nombre)}</b> · ${esc(cliente.cedula)}
              <span class="muted"> · Tasa ${fmtTasa(tasa.valor)} ${tasa.origen === 'MANUAL' ? '(manual)' : '(BCV)'}</span></div>
            <div class="metodos">${CONFIG.METODOS_PAGO.map((m) => `
              <button class="metodo" data-m="${m.id}"><b>${esc(m.nombre)}</b><small>${m.moneda === 'USD' ? 'USD' : 'Bs'}${CONFIG.MODO_FISCAL && m.igtf ? ' · +IGTF' : ''}</small></button>`).join('')}
            </div>
            <div class="pago-form" id="pagoForm"></div>
          </div>
          <div class="pago-right">
            <div id="pagoResumen"></div>
            <div id="pagoLista"></div>
          </div>
        </div>`,
      acciones: [
        { texto: 'Cancelar' },
        {
          texto: 'Confirmar venta', clase: 'btn-primary btn-lg', id: 'btnConfirmar',
          accion: () => {
            if (restanteBs() > 0) throw new Error('Falta por pagar. Debe cancelar el total primero.');
            const ex = excedenteBs();
            const final = pagos.map((p) => {
              const r = { metodo: p.metodo, entregado: p.entregado, aplicadoBs: p.aplicadoBs, aplicadoUsd: p.aplicadoUsd, igtfBs: p.igtfBs, ...p.datos };
              if (p.excedenteBs) r.vuelto = monedaVuelto === 'USD' ? { moneda: 'USD', monto: bsAUsd(p.excedenteBs, tasa.valor) } : { moneda: 'BS', monto: p.excedenteBs };
              return r;
            });
            const venta = crearVenta({ caja: ctx.caja, usuario: ctx.usuario, clienteId, items, pagos: final, tasaId: tasa.id, ordenId, mesa });
            ventaFinal = venta;
            const trabajos = [{ titulo: `${venta.doc.tipo} ${venta.doc.numero}`, tipo: 'venta', texto: textoVenta(venta), caja: ctx.caja,
              gaveta: final.some((p) => metodo(p.metodo).efectivo) || ex > 0 }];
            if (comandasAlCobrar && CONFIG.MODO_COMANDAS) {
              comandasDeVentaRapida(venta, ctx.usuario).forEach((c) =>
                trabajos.push({ titulo: `Comanda #${c.numero} · ${CONFIG.AREAS[c.area]}`, tipo: 'comanda', area: c.area, texto: textoComanda(c) }));
            }
            toast(`${docVenta(venta.doc)} registrada`);
            setTimeout(() => imprimir(trabajos), 50);
          },
        },
      ],
      alMontar: (el) => {
        const form = el.querySelector('#pagoForm');
        const resumen = el.querySelector('#pagoResumen');
        const lista = el.querySelector('#pagoLista');
        const btnOk = el.parentElement.querySelector('#btnConfirmar');

        const pintarResumen = () => {
          const r = Math.max(0, restanteBs());
          const ex = excedenteBs();
          resumen.innerHTML = `
            <div class="pr-row"><span>Total</span><b>${fmtUsd(tot.totalUsd)}</b></div>
            <div class="pr-row"><span></span><b>${fmtBs(tot.totalBs)}</b></div>
            ${igtfTotal() ? `<div class="pr-row warn"><span>IGTF ${CONFIG.IMPUESTOS.IGTF}%</span><b>${fmtBs(igtfTotal())}</b></div>` : ''}
            <div class="pr-rest ${r === 0 ? 'ok' : ''}">
              <span>${r === 0 ? 'Pagado' : 'Restante'}</span>
              <b>${fmtBs(r)}</b><small>${fmtUsd(bsAUsd(r, tasa.valor))}</small>
            </div>
            ${ex > 0 ? `<div class="vuelto">
              <div><b>Vuelto</b></div>
              <label class="radio"><input type="radio" name="mv" value="BS" ${monedaVuelto === 'BS' ? 'checked' : ''}> ${fmtBs(ex)}</label>
              <label class="radio"><input type="radio" name="mv" value="USD" ${monedaVuelto === 'USD' ? 'checked' : ''}> ${fmtUsd(bsAUsd(ex, tasa.valor))}</label>
            </div>` : ''}`;
          resumen.querySelectorAll('[name=mv]').forEach((i) => (i.onchange = () => (monedaVuelto = i.value)));
          btnOk.disabled = r > 0;
        };

        const pintarLista = () => {
          lista.innerHTML = pagos.length ? `<table class="tbl tbl-sm"><tbody>${pagos.map((p, i) => {
            const m = metodo(p.metodo);
            return `<tr><td><b>${esc(m.nombre)}</b>${p.datos.referencia ? `<br><small class="muted">Ref ${esc(p.datos.referencia)}</small>` : ''}</td>
              <td class="num">${m.moneda === 'USD' ? fmtUsd(p.entregado) : fmtBs(p.entregado)}${p.igtfBs ? `<br><small class="muted">IGTF ${fmtBs(p.igtfBs)}</small>` : ''}</td>
              <td><button class="btn-icon" data-quitar="${i}">✕</button></td></tr>`;
          }).join('')}</tbody></table>` : '<div class="empty small">Sin pagos agregados</div>';
          lista.querySelectorAll('[data-quitar]').forEach((b) => (b.onclick = () => { pagos.splice(Number(b.dataset.quitar), 1); todo(); }));
        };

        const pintarForm = () => {
          el.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === sel));
          const m = metodo(sel);
          const r = Math.max(0, restanteBs());
          if (r === 0) { form.innerHTML = '<div class="ok-msg">✔ Pago completo. Confirme la venta.</div>'; return; }
          if (m.fiado) {
            if (cliente.consumidorFinal || !cliente.limiteUsd) {
              form.innerHTML = '<div class="warn-msg">Para fiar, seleccione un cliente con límite de crédito (en Clientes o Fiado).</div>';
              return;
            }
            const disp = cliente.limiteUsd - cliente.saldoUsd;
            const usar = Math.min(disp, bsAUsd(r, tasa.valor));
            form.innerHTML = `<div class="info-box">Crédito de <b>${esc(cliente.nombre)}</b>: límite ${fmtUsd(cliente.limiteUsd)} · deuda ${fmtUsd(cliente.saldoUsd)} · <b>disponible ${fmtUsd(disp)}</b></div>
              <div class="field"><label>Monto a fiar ($)</label><input id="monto" inputmode="decimal" value="${centsToInput(usar)}"></div>
              <button class="btn btn-primary" id="agregar">Agregar pago</button>`;
          } else {
            const sug = montoParaRestante(sel, r, tasa.valor);
            form.innerHTML = `
              <div class="row gap end">
                <div class="field grow"><label>Monto recibido (${m.moneda === 'USD' ? '$' : 'Bs'})</label>
                  <input id="monto" inputmode="decimal" placeholder="${centsToInput(sug)}"></div>
                <button class="btn" id="exacto" title="Llenar con lo que falta">Restante: ${m.moneda === 'USD' ? fmtUsd(sug) : fmtBs(sug)}</button>
              </div>
              ${CONFIG.MODO_FISCAL && m.igtf ? `<small class="muted">Incluye IGTF ${CONFIG.IMPUESTOS.IGTF}% sobre el monto pagado en divisas.</small>` : ''}
              ${m.efectivo ? '<small class="muted">Si recibe más, el sistema calcula el vuelto.</small>' : ''}
              ${campoHtml(m, (m.campos || []).filter((c) => REQUERIDOS.includes(c)))}
              ${(m.campos || []).some((c) => !REQUERIDOS.includes(c)) ? `<details class="opcionales"><summary>Más datos (opcional)</summary>
                ${campoHtml(m, m.campos.filter((c) => !REQUERIDOS.includes(c)))}</details>` : ''}
              <button class="btn btn-primary" id="agregar">Agregar pago (Enter)</button>`;
            form.querySelector('#exacto').onclick = () => { form.querySelector('#monto').value = centsToInput(sug); form.querySelector('#monto').focus(); };
          }
          const agregar = () => {
            try {
              let monto = parseMonto(form.querySelector('#monto').value);
              if (!m.fiado && !form.querySelector('#monto').value.trim()) monto = montoParaRestante(sel, r, tasa.valor);
              if (!(monto > 0)) throw new Error('Ingrese un monto válido');
              const datos = {};
              form.querySelectorAll('[data-campo]').forEach((i) => { if (i.value.trim()) datos[i.dataset.campo] = i.value.trim(); });
              if (m.confirmar && !datos.referencia) throw new Error('La referencia es obligatoria para este método');
              const ap = aplicarPago({ metodoId: sel, entregado: monto, restanteBs: r, tasa: tasa.valor });
              if (ap.excedenteBs > 0 && !m.efectivo) throw new Error(`El monto supera lo que falta. Restante: ${m.moneda === 'USD' ? fmtUsd(montoParaRestante(sel, r, tasa.valor)) : fmtBs(montoParaRestante(sel, r, tasa.valor))}`);
              if (m.fiado && ap.aplicadoUsd > cliente.limiteUsd - cliente.saldoUsd) throw new Error('Supera el crédito disponible del cliente');
              pagos.push({ metodo: sel, entregado: monto, ...ap, datos });
              todo();
            } catch (e) { toast(e.message, 'error'); }
          };
          form.querySelector('#agregar').onclick = agregar;
          form.querySelectorAll('input').forEach((i) => (i.onkeydown = (e) => { if (e.key === 'Enter' && !e.ctrlKey) agregar(); }));
          setTimeout(() => form.querySelector('#monto')?.focus(), 20);
        };

        const todo = () => { pintarResumen(); pintarLista(); pintarForm(); };
        el.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { sel = b.dataset.m; pintarForm(); }));
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !btnOk.disabled) btnOk.click();
        });
        todo();
      },
      alCerrar: () => resolve(ventaFinal),
    });
  });
}
