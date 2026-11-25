import { CONFIG, metodo } from '../config.js';
import { db } from '../db.js';
import { registrarGasto, guardarProveedor, eliminarProveedor, sesionAbierta } from '../services.js';
import { imprimirHtml } from '../printing.js';
import { paginar, alPaginar, esc, on, toast, pedir, confirmar, fmtUsd, fmtBs, fmtTasa, fmtFechaHora, fmtYmd, parseMonto, hoy, sumarDias, sum, descargar, csv } from '../util.js';

let tab = 'gastos';
const f = { desde: sumarDias(hoy(), -30), hasta: hoy(), proveedor: '' };

export function render(el, ctx) {
  el.innerHTML = `
    <div class="tabs">
      <button class="tab ${tab === 'gastos' ? 'on' : ''}" data-tab="gastos">Gastos</button>
      <button class="tab ${tab === 'prov' ? 'on' : ''}" data-tab="prov">Proveedores</button>
    </div><div id="body"></div>`;
  on(el, 'click', '[data-tab]', (e, b) => { tab = b.dataset.tab; render(el, ctx); });
  if (tab === 'gastos') renderGastos(el.querySelector('#body'), ctx);
  else renderProveedores(el.querySelector('#body'));
}

const nombreProv = (id) => db().proveedores.find((p) => p.id === id)?.nombre || '—';

function renderGastos(cont, ctx) {
  const desde = new Date(`${f.desde}T00:00:00`).toISOString();
  const hasta = new Date(`${sumarDias(f.hasta, 1)}T00:00:00`).toISOString();
  const lista = db().gastos.filter((g) => g.fecha >= desde && g.fecha < hasta && (!f.proveedor || g.proveedorId === Number(f.proveedor)))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  const tabla = (filas) => `<div class="tbl-wrap"><table class="tbl" id="gtbl"><thead><tr><th>Fecha</th><th>Proveedor</th><th>Descripción</th><th>Método</th><th class="num">Monto $</th><th class="num">Monto Bs</th><th class="num">Tasa</th><th>De caja</th><th>Usuario</th></tr></thead><tbody>
    ${filas.map((g) => `<tr><td>${fmtFechaHora(g.fecha)}</td><td>${esc(nombreProv(g.proveedorId))}</td><td>${esc(g.descripcion)}</td><td>${esc(metodo(g.metodo).nombre)}</td>
      <td class="num">${fmtUsd(g.montoUsd)}</td><td class="num">${fmtBs(g.montoBs)}</td><td class="num"><small>${fmtTasa(g.tasa)}</small></td>
      <td>${g.sesionId ? '<span class="tag">Sí</span>' : '—'}</td><td>${esc(g.usuario)}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">Sin gastos en el período</td></tr>'}
    </tbody></table></div>`;
  const pag = paginar('gastos', lista, { clave: JSON.stringify(f) });
  cont.innerHTML = `<section class="card">
    <div class="toolbar wrap">
      <label class="inline">Desde <input type="date" data-f="desde" value="${f.desde}"></label>
      <label class="inline">Hasta <input type="date" data-f="hasta" value="${f.hasta}"></label>
      <select data-f="proveedor"><option value="">Todos los proveedores</option>${db().proveedores.map((p) => `<option value="${p.id}" ${String(p.id) === f.proveedor ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select>
      <span class="grow"></span>
      <button class="btn btn-sm" id="csv">CSV</button><button class="btn btn-sm" id="pdf">Reporte PDF</button>
      <button class="btn btn-primary" id="nuevo">+ Registrar gasto</button>
    </div>
    <div class="kpis sm"><div class="kpi"><small>Gastos</small><b>${lista.length}</b></div>
      <div class="kpi"><small>Total $</small><b>${fmtUsd(sum(lista, (g) => g.montoUsd))}</b></div>
      <div class="kpi"><small>Total Bs</small><b>${fmtBs(sum(lista, (g) => g.montoBs))}</b></div></div>
    ${tabla(pag.items)}${pag.html}</section>`;
  alPaginar(cont, () => renderGastos(cont, ctx));
  // Este contenedor se repinta entero: los eventos delegados se conectan una sola vez.
  if (!cont._filtrosListos) {
    cont._filtrosListos = true;
    on(cont, 'change', '[data-f]', (e, i) => { f[i.dataset.f] = i.value; renderGastos(cont, ctx); });
  }
  cont.querySelector('#nuevo').onclick = () => nuevoGasto(ctx);
  cont.querySelector('#csv').onclick = () => descargar(`gastos_${f.desde}_${f.hasta}.csv`, csv([
    ['Fecha', 'Proveedor', 'Descripción', 'Método', 'Monto $', 'Monto Bs', 'Tasa', 'Usuario'],
    ...lista.map((g) => [fmtFechaHora(g.fecha), nombreProv(g.proveedorId), g.descripcion, metodo(g.metodo).nombre, g.montoUsd / 100, g.montoBs / 100, g.tasa, g.usuario])]));
  cont.querySelector('#pdf').onclick = () => {
    const porProv = {};
    lista.forEach((g) => { (porProv[g.proveedorId] ||= { usd: 0, bs: 0 }); porProv[g.proveedorId].usd += g.montoUsd; porProv[g.proveedorId].bs += g.montoBs; });
    imprimirHtml(`Reporte de gastos ${fmtYmd(f.desde)} a ${fmtYmd(f.hasta)}`,
      `<h2>Por proveedor</h2><table><tr><th>Proveedor</th><th class="num">$</th><th class="num">Bs</th></tr>${Object.entries(porProv).map(([id, t]) =>
        `<tr><td>${esc(nombreProv(Number(id)))}</td><td class="num">${fmtUsd(t.usd)}</td><td class="num">${fmtBs(t.bs)}</td></tr>`).join('')}</table>
       <h2>Detalle</h2>${tabla(lista)}`);
  };
}

async function nuevoGasto(ctx) {
  if (!db().proveedores.length) return toast('Registre un proveedor primero', 'error');
  const metodos = CONFIG.METODOS_PAGO.filter((m) => !m.fiado);
  const d = await pedir({
    titulo: 'Registrar gasto',
    campos: [
      { name: 'proveedor', label: 'Proveedor', type: 'select', options: db().proveedores.map((p) => ({ value: p.id, text: p.nombre })) },
      { name: 'metodo', label: 'Método de pago', type: 'select', value: 'divisas', options: metodos.map((m) => ({ value: m.id, text: m.nombre })) },
      { name: 'descripcion', label: 'Descripción', required: true, col: 2 },
      { name: 'monto', label: 'Monto ($)', type: 'money', required: true },
      { name: 'caja', label: 'Origen del dinero', type: 'select', value: '',
        options: [{ value: '', text: 'No sale de una caja' }, ...CONFIG.CAJAS.map((c) => ({ value: c, text: `Sale de ${c}` }))] },
    ],
    alMontar: (el) => {
      const sel = el.querySelector('[name=metodo]');
      const lbl = el.querySelector('[name=monto]').closest('.field').querySelector('label');
      const act = () => {
        const m = metodo(sel.value);
        lbl.textContent = `Monto (${m.moneda === 'USD' ? '$' : 'Bs'}) *`;
      };
      sel.onchange = act; act();
    },
    validar: (d) => {
      const monto = parseMonto(d.monto);
      if (!(monto > 0)) throw new Error('Monto inválido');
      registrarGasto({ proveedorId: d.proveedor, descripcion: d.descripcion, metodoId: d.metodo, monto, desdeCaja: !!d.caja, usuario: ctx.usuario, caja: d.caja || null });
    },
  });
  if (d) toast('Gasto registrado');
}

function renderProveedores(cont) {
  const gastado = {};
  db().gastos.forEach((g) => (gastado[g.proveedorId] = (gastado[g.proveedorId] || 0) + g.montoUsd));
  const pag = paginar('proveedores', db().proveedores);
  cont.innerHTML = `<section class="card">
    <div class="toolbar"><span class="grow"></span><button class="btn btn-primary" id="nuevo">+ Nuevo proveedor</button></div>
    <table class="tbl"><thead><tr><th>Proveedor</th><th>RIF</th><th>Teléfono</th><th class="num">Total gastado $</th><th></th></tr></thead><tbody>
    ${pag.items.map((p) => `<tr><td><b>${esc(p.nombre)}</b></td><td>${esc(p.rif || '—')}</td><td>${esc(p.telefono || '—')}</td>
      <td class="num">${fmtUsd(gastado[p.id] || 0)}</td><td class="acts"><button class="btn btn-sm" data-edit="${p.id}">Editar</button><button class="btn-icon" data-del="${p.id}">🗑</button></td></tr>`).join('')}
    </tbody></table>${pag.html}</section>`;
  alPaginar(cont, () => renderProveedores(cont));
  const form = async (p = {}) => {
    const d = await pedir({ titulo: p.id ? 'Editar proveedor' : 'Nuevo proveedor', campos: [
      { name: 'nombre', label: 'Nombre', required: true, value: p.nombre || '' },
      { name: 'rif', label: 'RIF', value: p.rif || '' },
      { name: 'telefono', label: 'Teléfono', value: p.telefono || '' },
    ] });
    if (d) { guardarProveedor({ ...(p.id ? { id: p.id } : {}), ...d }); toast('Proveedor guardado'); }
  };
  cont.querySelector('#nuevo').onclick = () => form();
  if (cont._accionesListas) return;
  cont._accionesListas = true;
  on(cont, 'click', '[data-edit]', (e, b) => form(db().proveedores.find((p) => p.id === Number(b.dataset.edit))));
  on(cont, 'click', '[data-del]', async (e, b) => {
    const p = db().proveedores.find((x) => x.id === Number(b.dataset.del));
    if (!(await confirmar(`¿Eliminar ${esc(p.nombre)}?`, { peligro: true }))) return;
    try { eliminarProveedor(p.id); toast('Proveedor eliminado'); } catch (err) { toast(err.message, 'error'); }
  });
}
