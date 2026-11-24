// Impresión: tickets de venta, comandas, cierres y documentos.
// Soporta varios escenarios de hardware (ver CONFIG.IMPRESION). En la demo, los destinos
// de servidor/red/fiscal se SIMULAN mostrando la vista previa y los bytes ESC/POS reales.
import { CONFIG, metodo } from './config.js';
import { modal, esc, toast, fmtNum, fmtFechaHora, fmtHora, fmtYmd, fmtCant, usdABs } from './util.js';

const ANCHO = () => (CONFIG.IMPRESION.anchoPapel === 58 ? 32 : 48);
const n2 = (c) => fmtNum((c || 0) / 100);
const rep = (ch, n) => ch.repeat(Math.max(0, n));
const sep = (ch = '-') => rep(ch, ANCHO());
const centro = (t) => {
  t = String(t).slice(0, ANCHO());
  return rep(' ', Math.floor((ANCHO() - t.length) / 2)) + t;
};
const linea = (izq, der) => {
  izq = String(izq); der = String(der);
  const w = ANCHO();
  if (izq.length + der.length + 1 > w) izq = izq.slice(0, w - der.length - 1);
  return izq + rep(' ', w - izq.length - der.length) + der;
};
const envolver = (t) => {
  const w = ANCHO(); const out = []; let s = String(t);
  while (s.length > w) { out.push(s.slice(0, w)); s = s.slice(w); }
  out.push(s);
  return out.join('\n');
};

function encabezado() {
  const N = CONFIG.NEGOCIO;
  return [centro(N.nombre.toUpperCase()), centro(`RIF: ${N.rif}`), centro(N.direccion), centro(`Telf: ${N.telefono}`), sep()];
}

// ------------------------------------------------------------------ Documentos
export function textoVenta(v) {
  const L = encabezado();
  const fiscal = v.doc.tipo === 'FACTURA';
  L.push(fiscal ? linea('FACTURA', `N° ${v.doc.numero}`) : linea('NOTA DE ENTREGA', `N° ${v.doc.numero}`));
  if (fiscal) L.push(linea('N° DE CONTROL', v.doc.control));
  L.push(linea(`Fecha: ${fmtFechaHora(v.fecha)}`, v.caja));
  L.push(`Cliente: ${v.cliente.nombre}`, `C.I./RIF: ${v.cliente.cedula}`);
  if (v.mesa) L.push(`Mesa: ${v.mesa}`);
  L.push(`Atendido por: ${v.usuario}`, sep());
  L.push(linea('DESCRIPCIÓN', 'TOTAL $'));
  for (const i of v.items) {
    L.push(envolver(i.nombre));
    const cant = i.unidad === 'kg' ? `${fmtCant(i.cantidad, 'kg')} x ${n2(i.precioUsd)}/kg` : `${fmtNum(i.cantidad, 0)} x ${n2(i.precioUsd)}`;
    L.push(linea(`  ${cant}`, n2(i.totalUsd)));
    if (i.nota) L.push(`  > ${i.nota}`);
  }
  L.push(sep());
  const t = v.tasa.valor;
  if (fiscal) {
    L.push(linea(`BI G${CONFIG.IMPUESTOS.IVA}%`, `Bs ${n2(usdABs(v.baseUsd, t))}`));
    L.push(linea(`IVA G${CONFIG.IMPUESTOS.IVA}%`, `Bs ${n2(usdABs(v.ivaUsd, t))}`));
  }
  L.push(linea('TOTAL $', n2(v.totalUsd)));
  L.push(linea('TOTAL Bs', n2(v.totalBs)));
  if (v.igtfBs) {
    L.push(linea(`IGTF ${CONFIG.IMPUESTOS.IGTF}%`, `Bs ${n2(v.igtfBs)}`));
    L.push(linea('TOTAL A PAGAR Bs', n2(v.totalBs + v.igtfBs)));
  }
  L.push(`Tasa BCV ${fmtNum(t, 4)} (${v.tasa.origen === 'BCV' ? 'oficial' : 'manual'}, f.v. ${fmtYmd(v.tasa.fechaValor)})`);
  L.push(sep(), 'FORMA DE PAGO');
  for (const p of v.pagos) {
    const m = metodo(p.metodo);
    const ref = p.referencia ? ` Ref ${p.referencia}` : '';
    L.push(linea(`${m.nombre}${ref}`, m.moneda === 'USD' ? `$ ${n2(p.entregado)}` : `Bs ${n2(p.entregado)}`));
    if (p.vuelto?.monto) L.push(linea('  Vuelto', p.vuelto.moneda === 'USD' ? `$ ${n2(p.vuelto.monto)}` : `Bs ${n2(p.vuelto.monto)}`));
  }
  L.push(sep());
  if (fiscal) L.push(centro('*** DEMO - SIN VALOR FISCAL ***'));
  else L.push(centro('ESTE DOCUMENTO NO ES UNA FACTURA'));
  if (v.estado === 'anulada') L.push(centro('*** ANULADA ***'));
  L.push(centro('¡Gracias por su compra!'));
  return L.join('\n');
}

export function textoComanda(c) {
  const area = CONFIG.AREAS[c.area] || c.area;
  const L = [centro(`COMANDA #${c.numero} · ${area.toUpperCase()}`), sep('='), linea(c.mesa, fmtHora(c.creada)), `Pedido por: ${c.usuario}`, sep()];
  for (const i of c.items) {
    L.push(envolver(`${i.unidad === 'kg' ? fmtCant(i.cantidad, 'kg') : fmtNum(i.cantidad, 0)}  ${i.nombre}`));
    if (i.nota) L.push(`    >> ${i.nota.toUpperCase()}`);
  }
  L.push(sep('='));
  return L.join('\n');
}

export function textoPrecuenta(orden, tot, tasa, cliente) {
  const L = encabezado();
  L.push(centro('PRE-CUENTA (NO ES FACTURA)'), linea(orden.mesa, fmtFechaHora(new Date().toISOString())));
  if (cliente && !cliente.consumidorFinal) L.push(`Cliente: ${cliente.nombre}`);
  L.push(sep());
  for (const i of orden.items) L.push(linea(`${i.unidad === 'kg' ? fmtCant(i.cantidad, 'kg') : fmtNum(i.cantidad, 0)} ${i.nombre}`, n2(Math.round(i.precioUsd * i.cantidad))));
  L.push(sep(), linea('TOTAL $', n2(tot.totalUsd)), linea('TOTAL Bs', n2(tot.totalBs)), `Tasa ${fmtNum(tasa.valor, 4)}`);
  return L.join('\n');
}

export function textoCierre(ses, nombreDoc = 'CIERRE DE CAJA') {
  const r = ses.resumen;
  const L = encabezado();
  L.push(centro(nombreDoc), ses.caja);
  L.push(`Desde: ${fmtFechaHora(ses.apertura)}`);
  if (ses.cierre) L.push(`Hasta: ${fmtFechaHora(ses.cierre)}`);
  L.push(sep(), linea('Ventas', String(r.nVentas)), linea('Total $', n2(r.totalUsd)), linea('Total Bs', n2(r.totalBs)));
  if (r.ivaUsd) L.push(linea('IVA $', n2(r.ivaUsd)));
  if (r.igtfBs) L.push(linea('IGTF Bs', n2(r.igtfBs)));
  if (r.nAnuladas) L.push(linea('Anuladas', String(r.nAnuladas)));
  L.push(sep(), linea('FORMA DE PAGO', 'EN CAJA'));
  for (const m of CONFIG.METODOS_PAGO) {
    const e = r.esperado[m.id];
    if (!e) continue;
    L.push(linea(m.nombre, `${m.moneda === 'USD' ? '$' : 'Bs'} ${n2(e)}`));
  }
  if (ses.nota) L.push(sep(), envolver(`Nota: ${ses.nota}`));
  return L.join('\n');
}

export function textoEstadoCuenta(cliente, movs, tasa) {
  const L = encabezado();
  L.push(centro('ESTADO DE CUENTA'), `Cliente: ${cliente.nombre}`, `C.I./RIF: ${cliente.cedula}`, sep());
  for (const m of movs) L.push(linea(`${fmtFechaHora(m.fecha).slice(0, 10)} ${m.concepto}`, `${m.tipo === 'cargo' ? '' : '-'}${n2(m.montoUsd)}`));
  L.push(sep(), linea('SALDO $', n2(cliente.saldoUsd)), linea('SALDO Bs', n2(usdABs(cliente.saldoUsd, tasa.valor))), `Tasa ${fmtNum(tasa.valor, 4)}`);
  return L.join('\n');
}

// ------------------------------------------------------------------ ESC/POS
const CP850 = { á: 0xa0, é: 0x82, í: 0xa1, ó: 0xa2, ú: 0xa3, ñ: 0xa4, Ñ: 0xa5, Á: 0xb5, É: 0x90, Í: 0xd6, Ó: 0xe0, Ú: 0xe9, ü: 0x81, '¡': 0xad, '¿': 0xa8, '°': 0xf8, '·': 0xfa };
export function escpos(texto, { gaveta = false, corte = true } = {}) {
  const b = [0x1b, 0x40, 0x1b, 0x74, 0x02]; // inicializar + página de códigos CP850
  for (const ch of texto) {
    const c = ch.charCodeAt(0);
    b.push(ch === '\n' ? 0x0a : c < 128 ? c : CP850[ch] ?? 0x3f);
  }
  b.push(0x0a, 0x0a, 0x0a, 0x0a);
  if (corte) b.push(0x1d, 0x56, 0x42, 0x00); // corte parcial
  if (gaveta) b.push(0x1b, 0x70, 0x00, 0x19, 0xfa); // pulso a la gaveta (pin 2)
  return new Uint8Array(b);
}

// ------------------------------------------------------------------ Destinos
function describir(cfg) {
  const I = CONFIG.IMPRESION;
  switch (cfg.modo) {
    case 'navegador': return { modo: 'navegador', texto: 'Impresora predeterminada de esta PC (diálogo del navegador)' };
    case 'servidor-usb': return { modo: 'servidor-usb', texto: `Servidor → ${cfg.nombre || I.servidorUsb.nombre}` };
    case 'red-ip': return { modo: 'red-ip', texto: `Servidor → impresora de red ${cfg.ip || I.redIp.ip}:${cfg.puerto || I.redIp.puerto}` };
    case 'pantalla': return { modo: 'pantalla', texto: 'Solo pantalla de Cocina/Barra (sin papel)' };
    default: return { modo: 'navegador', texto: 'Navegador' };
  }
}
export function resolverDestino({ tipo, caja, area }) {
  const I = CONFIG.IMPRESION;
  if (tipo === 'comanda') {
    const c = I.comandas[area] || { modo: 'pantalla' };
    const d = describir(c);
    if (c.tambienPantalla && c.modo !== 'pantalla') d.texto += ' + pantalla de cocina';
    return d;
  }
  if (tipo === 'venta' && CONFIG.MODO_FISCAL) return { modo: 'fiscal', texto: `Servidor → ${I.fiscal.nombre} (${I.fiscal.puerto})` };
  return describir(I.modo === 'por-caja' ? I.porCaja[caja] || { modo: 'navegador' } : { modo: I.modo });
}

function imprimirEnNavegador(texto) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  const ancho = CONFIG.IMPRESION.anchoPapel;
  f.contentDocument.write(`<html><head><style>@page{size:${ancho}mm auto;margin:2mm}body{margin:0}
    pre{font:${ancho === 58 ? 9 : 10.5}px/1.25 'Courier New',monospace;white-space:pre;margin:0}</style></head>
    <body><pre>${esc(texto)}</pre></body></html>`);
  f.contentDocument.close();
  f.contentWindow.focus();
  f.contentWindow.print();
  setTimeout(() => f.remove(), 2000);
}

export function imprimirHtml(titulo, html) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  f.contentDocument.write(`<html><head><title>${esc(titulo)}</title><style>
    body{font:12px system-ui,sans-serif;color:#111;margin:16px}h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:16px 0 6px}
    table{width:100%;border-collapse:collapse;margin-bottom:10px}th,td{border-bottom:1px solid #ccc;padding:4px 6px;text-align:left}
    .num{text-align:right;font-variant-numeric:tabular-nums}.muted{color:#666}</style></head><body>
    <h1>${esc(CONFIG.NEGOCIO.nombre)} — ${esc(titulo)}</h1><div class="muted">Generado ${fmtFechaHora(new Date().toISOString())}</div>${html}</body></html>`);
  f.contentDocument.close();
  f.contentWindow.focus();
  f.contentWindow.print();
  setTimeout(() => f.remove(), 2000);
}

const ICONO = { navegador: '🖨️', 'servidor-usb': '🖨️', 'red-ip': '🖨️', pantalla: '🖥️', fiscal: '🧾' };

// Nombre del destino tal como lo entiende el usuario (sin detalles técnicos)
function nombreDestino(t) {
  if (t.destino.modo === 'fiscal') return 'Impresora fiscal';
  if (t.tipo === 'comanda') {
    const area = CONFIG.AREAS[t.area] || t.area;
    return t.destino.modo === 'pantalla' ? `Pantalla de ${area}` : `Impresora de ${area}`;
  }
  return t.caja ? `Impresora de ${t.caja}` : 'Impresora';
}

// trabajos: [{ titulo, tipo:'venta'|'comanda'|'cierre'|'doc', texto, caja, area, gaveta }]
// En la versión con servidor, los destinos que no son 'navegador' se envían en ESC/POS (ver escpos()).
export function imprimir(trabajos) {
  trabajos = (Array.isArray(trabajos) ? trabajos : [trabajos]).map((t) => ({ ...t, destino: resolverDestino(t) }));
  if (!CONFIG.IMPRESION.mostrarVistaPrevia) {
    trabajos.forEach((t) => (t.destino.modo === 'pantalla' ? toast(`Enviado a ${nombreDestino(t)}`) : imprimirEnNavegador(t.texto)));
    return;
  }
  const html = trabajos.map((t, i) => `
    <div class="print-job">
      <div class="print-dest">
        <span class="print-ico">${ICONO[t.destino.modo] || '🖨️'}</span>
        <div><b>${esc(t.titulo)}</b><br><small class="muted">${esc(nombreDestino(t))}</small></div>
        <span class="grow"></span>
        ${t.destino.modo === 'pantalla' ? '<span class="tag tag-ok">Enviado</span>' : `<button class="btn btn-sm" data-nav="${i}">Imprimir</button>`}
      </div>
      <pre class="ticket" style="width:${CONFIG.IMPRESION.anchoPapel === 58 ? 34 : 50}ch">${esc(t.texto)}</pre>
    </div>`).join('');
  modal({
    titulo: trabajos.length > 1 ? `Impresión (${trabajos.length})` : 'Impresión',
    ancho: 600,
    cuerpo: `<div class="print-list">${html}</div>`,
    acciones: [{ texto: 'Listo', clase: 'btn-primary' }],
    alMontar: (el) => {
      el.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => imprimirEnNavegador(trabajos[b.dataset.nav].texto)));
    },
  });
}
