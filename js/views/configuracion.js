import { CONFIG } from '../config.js';
import { abrirModalTasa, tablaHistorialTasas } from './tasaModal.js';
import { esc } from '../util.js';

export function render(el, ctx) {
  const N = CONFIG.NEGOCIO;
  el.innerHTML = `
    <div class="grid-2">
      <section class="card">
        <div class="row between"><h3>Tasa del dólar</h3><button class="btn btn-sm btn-primary" id="tasa">Actualizar / cargar manual</button></div>
        ${tablaHistorialTasas(30)}
      </section>
      <section class="card">
        <h3>Datos del negocio</h3>
        <table class="tbl tbl-sm"><tbody>
          <tr><td class="muted">Nombre</td><td><b>${esc(N.nombre)}</b></td></tr>
          <tr><td class="muted">RIF</td><td>${esc(N.rif)}</td></tr>
          <tr><td class="muted">Dirección</td><td>${esc(N.direccion)}</td></tr>
          <tr><td class="muted">Teléfono</td><td>${esc(N.telefono)}</td></tr>
        </tbody></table>
      </section>
    </div>`;

  el.querySelector('#tasa').onclick = () => abrirModalTasa(ctx);
}
