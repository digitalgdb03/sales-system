import { db } from '../db.js';
import { tasaVigente } from '../services.js';
import { consultarBCV, registrarTasaManual, estadoTasa, sinInternet } from '../tasa.js';
import { modal, esc, toast, fmtTasa, fmtFechaHora, fmtYmd, hace, parseDecimal, fmtBs, usdABs } from '../util.js';

export function tablaHistorialTasas(limite = 12) {
  const filas = [...db().tasas].reverse().slice(0, limite);
  return `<table class="tbl tbl-sm"><thead><tr><th>Fecha valor</th><th class="num">Tasa</th><th>Origen</th><th>Registrada</th></tr></thead><tbody>
    ${filas.map((t, i) => `<tr class="${i === 0 ? 'row-hl' : ''}"><td>${fmtYmd(t.fechaValor)}</td><td class="num"><b>${fmtTasa(t.valor)}</b></td>
      <td>${t.origen === 'BCV' ? '<span class="tag tag-ok">BCV</span>'
        : `<span class="tag tag-warn">Manual</span> <small class="muted">${esc(t.registradoPor)}${t.fuente && t.fuente !== 'Carga manual' ? ` · ${esc(t.fuente)}` : ''}</small>`}</td>
      <td>${fmtFechaHora(t.registradoEn)}</td></tr>`).join('')}
  </tbody></table>`;
}

export function abrirModalTasa(ctx) {
  const cuerpo = () => {
    const t = tasaVigente();
    const est = estadoTasa(t);
    const e = db().tasaEstado || {};
    const off = sinInternet();
    let estadoConexion;
    if (off) estadoConexion = '<span class="tag tag-err">Sin internet</span> Se sigue usando la última tasa. Puede cargarla manualmente.';
    else if (e.ok === false) estadoConexion = '<span class="tag tag-warn">No se pudo consultar</span> Se sigue usando la última tasa. Puede intentar de nuevo o cargarla manualmente.';
    else if (e.ultimoExito) estadoConexion = `<span class="tag tag-ok">Conectado</span> Última consulta al BCV ${hace(e.ultimoExito)}.`;
    else estadoConexion = 'Consultando al BCV…';
    return `
      <div class="tasa-box nivel-${est.nivel}">
        <small>Tasa vigente</small><div class="tasa-big">${t ? fmtTasa(t.valor) : '—'} <span>Bs/$</span></div>
        <div>${esc(est.texto)}</div>
        ${t ? `<small>$ 1,00 = ${fmtBs(usdABs(100, t.valor))} · $ 10,00 = ${fmtBs(usdABs(1000, t.valor))}</small>` : ''}
      </div>
      <div class="tasa-status">
        <div>${estadoConexion}</div>
        <div class="row gap">
          <button class="btn" id="btnBcv" ${off ? 'disabled' : ''}>↻ Actualizar desde el BCV</button>
          <button class="btn btn-warn" id="btnManual">✎ Cargar tasa manual</button>
        </div>
      </div>
      <h4>Historial</h4>
      ${tablaHistorialTasas(8)}
      <p class="muted small">Cada venta guarda la tasa con la que se cobró. Cambiar la tasa no altera ventas anteriores.</p>`;
  };

  modal({
    titulo: 'Tasa del dólar',
    ancho: 640,
    cuerpo: `<div id="tasaCuerpo">${cuerpo()}</div>`,
    acciones: [{ texto: 'Cerrar' }],
    alMontar: (el) => {
      const cont = el.querySelector('#tasaCuerpo');
      const pintar = () => { cont.innerHTML = cuerpo(); enlazar(); };
      const enlazar = () => {
        const b = cont.querySelector('#btnBcv');
        b.onclick = async () => {
          b.disabled = true; b.textContent = 'Consultando…';
          const r = await consultarBCV({ forzar: true });
          if (r.ok) toast(r.agregada ? `Tasa BCV actualizada: ${fmtTasa(r.valor)}` : `La tasa BCV no ha cambiado (${fmtTasa(r.valor)})`);
          else toast('No se pudo consultar el BCV. Puede cargar la tasa manualmente.', 'error');
          pintar();
        };
        cont.querySelector('#btnManual').onclick = () => {
          cont.innerHTML = `
            <div class="form-grid">
              <div class="field"><label>Nueva tasa (Bs por $) *</label><input id="valorManual" inputmode="decimal" placeholder="Ej: 918,7662"></div>
              <div class="field"><label>Nota</label><input id="notaManual" placeholder="Opcional"></div>
            </div>
            <p class="muted small">Cuando el BCV publique una tasa nueva, el sistema la toma automáticamente.</p>
            <div class="row gap"><button class="btn" id="cancelManual">Cancelar</button><button class="btn btn-primary" id="okManual">Guardar tasa</button></div>`;
          const inp = cont.querySelector('#valorManual');
          inp.focus();
          cont.querySelector('#cancelManual').onclick = pintar;
          const ok = () => {
            try {
              const t = registrarTasaManual(parseDecimal(inp.value), ctx.usuario, cont.querySelector('#notaManual').value.trim());
              toast(`Tasa manual registrada: ${fmtTasa(t.valor)}`);
              pintar();
            } catch (e) { toast(e.message, 'error'); }
          };
          cont.querySelector('#okManual').onclick = ok;
          inp.onkeydown = (e) => { if (e.key === 'Enter') ok(); };
        };
      };
      enlazar();
    },
  });
}
