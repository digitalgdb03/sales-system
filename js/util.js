// Utilidades: dinero (en céntimos enteros), fechas, DOM, modales.

// ---------- Dinero ----------
// Todos los montos se guardan como ENTEROS en céntimos para evitar errores de redondeo.
const nf2 = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtBs = (c) => 'Bs ' + nf2.format((c || 0) / 100);
export const fmtUsd = (c) => '$ ' + nf2.format((c || 0) / 100);
export const fmtNum = (n, d = 2) =>
  new Intl.NumberFormat('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n || 0);
export const fmtTasa = (t) => fmtNum(t, 4);
export const fmtCant = (n, unidad) => {
  if (unidad !== 'kg') return fmtNum(n, Number.isInteger(n) ? 0 : 2);
  return Math.abs(n) >= 1 ? `${fmtNum(n, Number.isInteger(n) ? 0 : 2)} kg` : `${fmtNum(n * 1000, 0)} g`;
};

// Acepta "1.234,56", "1234,56" o "1234.56"
export function parseDecimal(str) {
  if (typeof str === 'number') return str;
  let s = String(str ?? '').trim().replace(/\s/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
export const parseMonto = (str) => {
  const n = parseDecimal(str);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
export const centsToInput = (c) => ((c || 0) / 100).toFixed(2).replace('.', ',');

// Cómo se nombra una venta ante el usuario (nunca con el id interno)
export const docVenta = (doc) => `${doc.tipo === 'FACTURA' ? 'Factura' : 'Nota de entrega'} N° ${doc.numero}`;

export const usdABs =(usdC, tasa) => Math.round(usdC * tasa);
export const bsAUsd = (bsC, tasa) => Math.round(bsC / tasa);

// ---------- Fechas ----------
export const pad = (n) => String(n).padStart(2, '0');
export function fechaLocal(d = new Date()) {
  d = d instanceof Date ? d : new Date(d);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const hoy = () => fechaLocal();
export function sumarDias(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return fechaLocal(new Date(y, m - 1, d + n));
}
export const esHabil = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const w = new Date(y, m - 1, d).getDay();
  return w !== 0 && w !== 6;
};
// Días hábiles transcurridos desde `desde` hasta `hasta` (excluye `desde`)
export function diasHabiles(desde, hasta) {
  let n = 0;
  let f = desde;
  while (f < hasta) {
    f = sumarDias(f, 1);
    if (esHabil(f)) n++;
  }
  return n;
}
export const fmtFecha = (iso) => {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};
export const fmtHora = (iso) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fmtFechaHora = (iso) => `${fmtFecha(iso)} ${fmtHora(iso)}`;
export const fmtYmd = (ymd) => (ymd ? ymd.split('-').reverse().join('/') : '');
export function hace(iso) {
  if (!iso) return 'nunca';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}
export const minutosDesde = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 60000);

// ---------- DOM ----------
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function on(root, type, sel, fn) {
  root.addEventListener(type, (e) => {
    const t = e.target.closest(sel);
    if (t && root.contains(t)) fn(e, t);
  });
}

export function toast(msg, tipo = 'ok') {
  let cont = document.getElementById('toasts');
  if (!cont) {
    cont = document.createElement('div');
    cont.id = 'toasts';
    document.body.appendChild(cont);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${tipo}`;
  t.textContent = msg;
  cont.appendChild(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3600);
}

export const hayModal = () => !!document.querySelector('.modal-backdrop');

// modal({ titulo, cuerpo(html), ancho, acciones:[{texto, clase, accion(ctx) → false para no cerrar}], alMontar(el, ctx) })
export function modal({ titulo, cuerpo, ancho = 520, acciones = [], alMontar, alCerrar, cerrable = true }) {
  const bd = document.createElement('div');
  bd.className = 'modal-backdrop';
  bd.innerHTML = `
    <div class="modal" style="max-width:${ancho}px" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${esc(titulo)}</h3>${cerrable ? '<button class="btn-icon" data-x title="Cerrar">✕</button>' : ''}</div>
      <div class="modal-body">${cuerpo}</div>
      ${acciones.length ? `<div class="modal-foot">${acciones
        .map((a, i) => `<button class="btn ${a.clase || ''}" data-acc="${i}" ${a.id ? `id="${a.id}"` : ''}>${esc(a.texto)}</button>`)
        .join('')}</div>` : ''}
    </div>`;
  document.body.appendChild(bd);
  const el = bd.querySelector('.modal');
  let cerrado = false;
  const ctx = {
    el,
    cerrar() {
      if (cerrado) return;
      cerrado = true;
      bd.remove();
      document.removeEventListener('keydown', onKey);
      alCerrar && alCerrar();
      document.dispatchEvent(new Event('modal-cerrado'));
    },
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && cerrable && document.querySelector('.modal-backdrop:last-of-type') === bd) ctx.cerrar();
  };
  document.addEventListener('keydown', onKey);
  if (cerrable) bd.querySelector('[data-x]').onclick = ctx.cerrar;
  bd.querySelectorAll('[data-acc]').forEach((b) => {
    b.onclick = async () => {
      const a = acciones[Number(b.dataset.acc)];
      if (!a.accion) return ctx.cerrar();
      try {
        const r = await a.accion(ctx);
        if (r !== false) ctx.cerrar();
      } catch (err) {
        toast(err.message || String(err), 'error');
      }
    };
  });
  alMontar && alMontar(el, ctx);
  const first = el.querySelector('input:not([type=hidden]):not([readonly]), select, textarea');
  first && setTimeout(() => first.focus(), 30);
  return ctx;
}

export function confirmar(mensaje, { titulo = 'Confirmar', textoOk = 'Aceptar', peligro = false } = {}) {
  return new Promise((res) => {
    let ok = false;
    modal({
      titulo,
      cuerpo: `<p>${mensaje}</p>`,
      ancho: 420,
      acciones: [
        { texto: 'Cancelar' },
        { texto: textoOk, clase: peligro ? 'btn-danger' : 'btn-primary', accion: () => { ok = true; } },
      ],
      alCerrar: () => res(ok),
    });
  });
}

// Formulario genérico. campos: [{name,label,type,value,required,options:[{value,text}],placeholder,hint,col}]
export function formHtml(campos) {
  return `<form class="form-grid" onsubmit="return false">${campos
    .map((c) => {
      const req = c.required ? 'required' : '';
      const v = c.value ?? '';
      let input;
      if (c.type === 'select') {
        input = `<select name="${c.name}" ${req}>${c.options
          .map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${esc(o.text)}</option>`)
          .join('')}</select>`;
      } else if (c.type === 'checkbox') {
        input = `<label class="check"><input type="checkbox" name="${c.name}" ${v ? 'checked' : ''}> ${esc(c.checkLabel || '')}</label>`;
      } else if (c.type === 'textarea') {
        input = `<textarea name="${c.name}" rows="2" ${req} placeholder="${esc(c.placeholder || '')}">${esc(v)}</textarea>`;
      } else {
        const t = c.type === 'money' || c.type === 'decimal' ? 'text' : c.type || 'text';
        const im = c.type === 'money' || c.type === 'decimal' ? 'inputmode="decimal"' : '';
        input = `<input type="${t}" ${im} name="${c.name}" value="${esc(v)}" ${req} placeholder="${esc(c.placeholder || '')}" ${c.readonly ? 'readonly' : ''} ${c.attrs || ''}>`;
      }
      return `<div class="field ${c.col === 2 ? 'span2' : ''}"><label>${esc(c.label)}${c.required ? ' *' : ''}</label>${input}${
        c.hint ? `<small class="hint" data-hint="${c.name}">${c.hint}</small>` : ''}</div>`;
    })
    .join('')}</form>`;
}
export function leerForm(el) {
  const o = {};
  el.querySelectorAll('input[name], select[name], textarea[name]').forEach((i) => {
    o[i.name] = i.type === 'checkbox' ? i.checked : i.value.trim();
  });
  return o;
}
export function validarRequeridos(el) {
  for (const i of el.querySelectorAll('[required]')) {
    if (!i.value.trim()) {
      i.focus();
      throw new Error('Complete los campos obligatorios (*)');
    }
  }
}

// Modal con formulario → Promise<datos | null>. validar(datos) puede lanzar Error.
export function pedir({ titulo, campos, textoOk = 'Guardar', ancho = 520, validar, alMontar, intro = '' }) {
  return new Promise((res) => {
    let datos = null;
    modal({
      titulo,
      ancho,
      cuerpo: intro + formHtml(campos),
      alMontar: (el, ctx) => {
        el.querySelector('form').addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            el.parentElement.querySelector('.btn-primary')?.click();
          }
        });
        alMontar && alMontar(el, ctx);
      },
      acciones: [
        { texto: 'Cancelar' },
        {
          texto: textoOk,
          clase: 'btn-primary',
          accion: async (ctx) => {
            validarRequeridos(ctx.el);
            const d = leerForm(ctx.el);
            if (validar) await validar(d);
            datos = d;
          },
        },
      ],
      alCerrar: () => res(datos),
    });
  });
}

export function descargar(nombre, contenido, tipo = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + contenido], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export const csv = (filas) =>
  filas.map((f) => f.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');

export const sum = (arr, fn = (x) => x) => arr.reduce((a, x) => a + (fn(x) || 0), 0);
export const agrupar = (arr, fn) =>
  arr.reduce((m, x) => {
    const k = fn(x);
    (m[k] ||= []).push(x);
    return m;
  }, {});
