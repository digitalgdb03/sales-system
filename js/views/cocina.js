// Pantalla de Cocina / Barra (KDS). Recibe las comandas en tiempo real.
import { CONFIG } from '../config.js';
import { db } from '../db.js';
import { marcarComanda } from '../services.js';
import { esc, on, fmtHora, minutosDesde, fmtCant, fmtNum } from '../util.js';

let area = 'todas';

export function render(el, ctx) {
  const pintar = () => {
    const todas = db().comandas.filter((c) => area === 'todas' || c.area === area);
    const pend = todas.filter((c) => c.estado === 'pendiente').sort((a, b) => a.creada.localeCompare(b.creada));
    const listas = todas.filter((c) => c.estado === 'lista').sort((a, b) => b.lista.localeCompare(a.lista)).slice(0, 12);
    const tarjeta = (c, accion) => {
      const min = minutosDesde(c.creada);
      const nivel = c.estado === 'pendiente' ? (min >= 20 ? 'alerta' : min >= 10 ? 'aviso' : 'ok') : 'lista';
      return `<div class="kds-card kds-${nivel}">
        <div class="kds-head"><b>${esc(c.mesa)}</b><span>#${c.numero} · ${esc(CONFIG.AREAS[c.area])}</span></div>
        <div class="kds-meta">${fmtHora(c.creada)} · ${c.estado === 'pendiente' ? `${min} min` : 'lista'} · ${esc(c.usuario)}</div>
        <ul>${c.items.map((i) => `<li><b>${i.unidad === 'kg' ? fmtCant(i.cantidad, 'kg') : fmtNum(i.cantidad, 0)}</b> ${esc(i.nombre)}
          ${i.nota ? `<div class="kds-nota">» ${esc(i.nota)}</div>` : ''}</li>`).join('')}</ul>
        ${accion}
      </div>`;
    };
    el.innerHTML = `
      <div class="toolbar">
        <div class="seg">${[['todas', 'Todas'], ...Object.entries(CONFIG.AREAS)].map(([k, v]) =>
          `<button class="seg-btn ${area === k ? 'on' : ''}" data-area="${k}">${esc(v)} <em>${db().comandas.filter((c) => c.estado === 'pendiente' && (k === 'todas' || c.area === k)).length}</em></button>`).join('')}</div>
        <span class="muted">Se actualiza solo al llegar pedidos de cualquier terminal.</span>
      </div>
      <h4>Pendientes (${pend.length})</h4>
      <div class="kds-grid">${pend.map((c) => tarjeta(c, `<button class="btn btn-primary btn-block" data-listo="${c.id}">Listo ✔</button>`)).join('') || '<div class="empty">Sin pedidos pendientes</div>'}</div>
      <h4>Listas para servir</h4>
      <div class="kds-grid">${listas.map((c) => tarjeta(c, `<button class="btn btn-block" data-entregada="${c.id}">Entregada</button>`)).join('') || '<div class="empty small">—</div>'}</div>`;
  };
  pintar();
  on(el, 'click', '[data-area]', (e, b) => { area = b.dataset.area; pintar(); });
  on(el, 'click', '[data-listo]', (e, b) => marcarComanda(Number(b.dataset.listo), 'lista'));
  on(el, 'click', '[data-entregada]', (e, b) => marcarComanda(Number(b.dataset.entregada), 'entregada'));
  const t = setInterval(pintar, 30000);
  return () => clearInterval(t);
}
