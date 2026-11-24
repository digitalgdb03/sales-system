import { CONFIG } from '../config.js';
import { db } from '../db.js';
import { guardarProducto, entradaStock, eliminarProducto, tasaVigente } from '../services.js';
import { imprimirHtml } from '../printing.js';
import { esc, on, toast, pedir, confirmar, fmtUsd, fmtBs, fmtCant, usdABs, parseMonto, parseDecimal, centsToInput, sumarDias, hoy, sum, descargar, csv } from '../util.js';

const f = { q: '', cat: '', bajo: false };

export function render(el, ctx) {
  const editar = ctx.puede('inventario.editar');
  const cats = [...new Set(db().productos.map((p) => p.categoria))];
  el.innerHTML = `
    <section class="card">
      <div class="toolbar">
        <input class="search grow" id="q" placeholder="Buscar producto o código" value="${esc(f.q)}">
        <select id="cat"><option value="">Todas las categorías</option>${cats.map((c) => `<option ${f.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <label class="check"><input type="checkbox" id="bajo" ${f.bajo ? 'checked' : ''}> Solo stock bajo</label>
        <button class="btn btn-sm" id="csv">CSV</button><button class="btn btn-sm" id="pdf">PDF</button>
        ${editar ? '<button class="btn btn-primary" id="nuevo">+ Nuevo producto</button>' : ''}
      </div>
      <div id="tabla"></div>
    </section>`;
  const pintar = () => {
    const tasa = tasaVigente()?.valor || 0;
    const desde = new Date(`${sumarDias(hoy(), -7)}T00:00:00`).toISOString();
    const vendidos = {};
    db().ventas.filter((v) => v.fecha >= desde && v.estado !== 'anulada').forEach((v) => v.items.forEach((i) => (vendidos[i.productoId] = (vendidos[i.productoId] || 0) + i.cantidad)));
    const q = f.q.toLowerCase();
    const lista = db().productos.filter((p) => (!q || p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q))
      && (!f.cat || p.categoria === f.cat) && (!f.bajo || (p.controlStock && p.stock <= p.stockMin)));
    const bajos = db().productos.filter((p) => p.activo && p.controlStock && p.stock <= p.stockMin).length;
    el.querySelector('#tabla').innerHTML = `
      ${bajos ? `<div class="banner banner-warn">${bajos} producto(s) con stock bajo o agotado.</div>` : ''}
      <div class="tbl-wrap"><table class="tbl" id="itbl"><thead><tr><th>Código</th><th>Producto</th><th>Categoría</th>${CONFIG.MODO_COMANDAS ? '<th>Área</th>' : ''}
        <th class="num">Precio $</th><th class="num">Precio Bs</th><th class="num">Stock</th><th class="num">Vendidos 7 días</th><th></th></tr></thead><tbody>
      ${lista.map((p) => {
        const bajo = p.controlStock && p.stock <= p.stockMin;
        return `<tr class="${p.activo ? '' : 'inactivo'}"><td>${esc(p.codigo)}</td><td><b>${esc(p.nombre)}</b>${p.activo ? '' : ' <span class="tag">inactivo</span>'}</td>
          <td>${esc(p.categoria)}</td>${CONFIG.MODO_COMANDAS ? `<td>${p.area ? esc(CONFIG.AREAS[p.area]) : '—'}</td>` : ''}
          <td class="num">${fmtUsd(p.precioUsd)}${p.unidad === 'kg' ? '/kg' : ''}</td><td class="num">${fmtBs(usdABs(p.precioUsd, tasa))}</td>
          <td class="num">${p.controlStock ? `<span class="${bajo ? 'err-txt' : ''}">${fmtCant(p.stock, p.unidad)}</span>${bajo ? ' ⚠' : ''}` : '<small class="muted">no controla</small>'}</td>
          <td class="num">${vendidos[p.id] ? fmtCant(vendidos[p.id], p.unidad) : '—'}</td>
          <td class="acts">${editar ? `<button class="btn btn-sm" data-edit="${p.id}">Editar</button>
            ${p.controlStock ? `<button class="btn btn-sm" data-stock="${p.id}">+ Stock</button>` : ''}
            <button class="btn-icon" data-del="${p.id}" title="Eliminar">🗑</button>` : ''}</td></tr>`;
      }).join('') || '<tr><td colspan="9" class="empty">Sin productos</td></tr>'}
      </tbody></table></div>
      <p class="muted small">Los precios se guardan en dólares; el precio en Bs se calcula con la tasa vigente.</p>`;
  };
  pintar();
  el.querySelector('#q').oninput = (e) => { f.q = e.target.value; pintar(); };
  el.querySelector('#cat').onchange = (e) => { f.cat = e.target.value; pintar(); };
  el.querySelector('#bajo').onchange = (e) => { f.bajo = e.target.checked; pintar(); };
  el.querySelector('#nuevo')?.addEventListener('click', () => formProducto());
  on(el, 'click', '[data-edit]', (e, b) => formProducto(db().productos.find((p) => p.id === Number(b.dataset.edit))));
  on(el, 'click', '[data-stock]', async (e, b) => {
    const p = db().productos.find((x) => x.id === Number(b.dataset.stock));
    const d = await pedir({ titulo: `Entrada de mercancía · ${p.nombre}`, ancho: 400, textoOk: 'Agregar',
      intro: `<p class="muted">Stock actual: ${fmtCant(p.stock, p.unidad)}</p>`,
      campos: [{ name: 'cant', label: p.unidad === 'kg' ? 'Cantidad (kg)' : 'Cantidad', type: 'decimal', required: true }],
      validar: (d) => { if (!(parseDecimal(d.cant) > 0)) throw new Error('Cantidad inválida'); } });
    if (d) { entradaStock(p.id, parseDecimal(d.cant)); toast('Stock actualizado'); }
  });
  on(el, 'click', '[data-del]', async (e, b) => {
    const p = db().productos.find((x) => x.id === Number(b.dataset.del));
    if (!(await confirmar(`¿Eliminar ${esc(p.nombre)}? Si tiene ventas, solo se desactiva.`, { peligro: true }))) return;
    toast(`Producto ${eliminarProducto(p.id)}`);
  });
  el.querySelector('#csv').onclick = () => descargar('inventario.csv', csv([
    ['Código', 'Producto', 'Categoría', 'Área', 'Unidad', 'Precio $', 'Controla stock', 'Stock', 'Stock mínimo', 'Activo'],
    ...db().productos.map((p) => [p.codigo, p.nombre, p.categoria, p.area || '', p.unidad, p.precioUsd / 100, p.controlStock ? 'Sí' : 'No', p.stock, p.stockMin, p.activo ? 'Sí' : 'No']),
  ]));
  el.querySelector('#pdf').onclick = () => imprimirHtml('Inventario', el.querySelector('#itbl').outerHTML.replace(/<td class="acts">[\s\S]*?<\/td>/g, '<td></td>'));
}

async function formProducto(p = null) {
  const tasa = tasaVigente()?.valor || 0;
  const cats = [...new Set(db().productos.map((x) => x.categoria))];
  const sigCodigo = 'P' + String(db().productos.length + 1).padStart(3, '0');
  const campos = [
    { name: 'codigo', label: 'Código', required: true, value: p?.codigo || sigCodigo },
    { name: 'nombre', label: 'Nombre', required: true, value: p?.nombre || '' },
    { name: 'categoria', label: 'Categoría', required: true, value: p?.categoria || '', attrs: 'list="dlCats"' },
    { name: 'unidad', label: 'Se vende por', type: 'select', value: p?.unidad || 'und', options: [{ value: 'und', text: 'Unidad' }, { value: 'kg', text: 'Peso (precio por kg, se vende en gramos)' }] },
    { name: 'precio', label: 'Precio $', type: 'money', required: true, value: p ? centsToInput(p.precioUsd) : '', hint: '&nbsp;' },
  ];
  if (CONFIG.MODO_COMANDAS) campos.push({ name: 'area', label: 'Se prepara en', type: 'select', value: p?.area || '',
    options: [{ value: '', text: 'No requiere preparación' }, ...Object.entries(CONFIG.AREAS).map(([k, v]) => ({ value: k, text: v }))] });
  campos.push(
    { name: 'controlStock', label: 'Inventario', type: 'checkbox', value: p ? p.controlStock : true, checkLabel: 'Controlar stock' },
    { name: 'stock', label: 'Stock actual', type: 'decimal', value: p?.stock ?? 0 },
    { name: 'stockMin', label: 'Stock mínimo (alerta)', type: 'decimal', value: p?.stockMin ?? 0 },
    { name: 'activo', label: 'Estado', type: 'checkbox', value: p ? p.activo : true, checkLabel: 'Activo (visible en ventas)' },
  );
  const d = await pedir({
    titulo: p ? `Editar ${p.nombre}` : 'Nuevo producto',
    campos,
    alMontar: (el) => {
      el.insertAdjacentHTML('beforeend', `<datalist id="dlCats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`);
      const i = el.querySelector('[name=precio]');
      const h = el.querySelector('[data-hint=precio]');
      const act = () => { const c = parseMonto(i.value); h.innerHTML = Number.isFinite(c) ? `≈ ${fmtBs(usdABs(c, tasa))} a la tasa vigente` : '&nbsp;'; };
      i.oninput = act; act();
    },
    validar: (d) => {
      const precioUsd = parseMonto(d.precio);
      if (!(precioUsd > 0)) throw new Error('Precio inválido');
      guardarProducto({
        ...(p ? { id: p.id } : {}), codigo: d.codigo.toUpperCase(), nombre: d.nombre, categoria: d.categoria, unidad: d.unidad,
        precioUsd, area: d.area || null, controlStock: d.controlStock, stock: parseDecimal(d.stock) || 0,
        stockMin: parseDecimal(d.stockMin) || 0, activo: d.activo,
      });
    },
  });
  if (d) toast(p ? 'Producto actualizado' : 'Producto creado');
}
