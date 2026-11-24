// Lógica de negocio. En la versión real esto vive en el servidor (API).
import { CONFIG, metodo } from './config.js';
import { tx, sigId, db } from './db.js';
import { usdABs, bsAUsd, sum, docVenta } from './util.js';

const ahora = () => new Date().toISOString();
const err = (m) => { throw new Error(m); };

// ---------------------------------------------------------------- Tasa
export const tasaVigente = (s = db()) => (s.tasas.length ? s.tasas[s.tasas.length - 1] : null);

// ---------------------------------------------------------------- Totales
export function calcularTotales(items, tasa) {
  const bruto = sum(items, (i) => Math.round(i.precioUsd * i.cantidad));
  let baseUsd = bruto, ivaUsd = 0, totalUsd = bruto;
  if (CONFIG.MODO_FISCAL) {
    const p = CONFIG.IMPUESTOS.IVA / 100;
    if (CONFIG.IMPUESTOS.PRECIOS_INCLUYEN_IVA) {
      baseUsd = Math.round(bruto / (1 + p));
      ivaUsd = bruto - baseUsd;
    } else {
      ivaUsd = Math.round(bruto * p);
      totalUsd = bruto + ivaUsd;
    }
  }
  return { baseUsd, ivaUsd, totalUsd, totalBs: tasa ? usdABs(totalUsd, tasa) : 0 };
}

// Calcula cómo se aplica un pago al restante (todo en céntimos de Bs).
// Devuelve { aplicadoBs, aplicadoUsd, igtfBs, excedenteBs }
export function aplicarPago({ metodoId, entregado, restanteBs, tasa }) {
  const m = metodo(metodoId);
  const entregadoBs = m.moneda === 'USD' ? usdABs(entregado, tasa) : entregado;
  let aplicadoBs, igtfBs = 0;
  if (CONFIG.MODO_FISCAL && m.igtf) {
    const f = 1 + CONFIG.IMPUESTOS.IGTF / 100;
    aplicadoBs = Math.min(Math.round(entregadoBs / f), restanteBs);
    igtfBs = Math.round(aplicadoBs * (CONFIG.IMPUESTOS.IGTF / 100));
  } else {
    aplicadoBs = Math.min(entregadoBs, restanteBs);
  }
  const excedenteBs = Math.max(0, entregadoBs - aplicadoBs - igtfBs);
  return { aplicadoBs, aplicadoUsd: bsAUsd(aplicadoBs, tasa), igtfBs, excedenteBs };
}

// Monto a entregar (en la moneda del método) para cubrir el restante
export function montoParaRestante(metodoId, restanteBs, tasa) {
  const m = metodo(metodoId);
  let bs = restanteBs;
  if (CONFIG.MODO_FISCAL && m.igtf) bs = restanteBs + Math.round(restanteBs * (CONFIG.IMPUESTOS.IGTF / 100));
  return m.moneda === 'USD' ? Math.ceil(bs / tasa) : bs;
}

// ---------------------------------------------------------------- Caja
export const sesionAbierta = (caja, s = db()) => s.sesiones.find((x) => x.caja === caja && x.estado === 'abierta');

// No hace falta abrir la caja a mano: el turno empieza solo con el primer movimiento
// (venta, abono o gasto) y termina con "Cerrar caja".
function turnoActual(s, caja, usuario) {
  let ses = sesionAbierta(caja, s);
  if (!ses) {
    ses = { id: sigId(s, 'sesion'), caja, estado: 'abierta', apertura: ahora(), usuarioApertura: usuario?.nombre || 'Administrador', fondoBs: 0, fondoUsd: 0 };
    s.sesiones.push(ses);
  }
  return ses;
}

export function abrirCaja({ caja, usuario, fondoBs, fondoUsd }) {
  return tx((s) => {
    if (sesionAbierta(caja, s)) err(`${caja} ya está abierta`);
    const ses = {
      id: sigId(s, 'sesion'), caja, estado: 'abierta', apertura: ahora(), usuarioApertura: usuario.nombre,
      fondoBs: fondoBs || 0, fondoUsd: fondoUsd || 0,
    };
    s.sesiones.push(ses);
    return ses;
  });
}

// Lo que DEBERÍA haber por método de pago (en la moneda de cada método)
export function resumenSesion(s, ses) {
  const esperado = Object.fromEntries(CONFIG.METODOS_PAGO.map((m) => [m.id, 0]));
  const ventas = s.ventas.filter((v) => v.sesionId === ses.id && v.estado !== 'anulada');
  const abonos = s.movFiado.filter((m) => m.tipo === 'abono' && m.sesionId === ses.id);
  const gastos = s.gastos.filter((g) => g.sesionId === ses.id);
  const sumarPago = (p) => {
    esperado[p.metodo] += p.entregado;
    if (p.vuelto?.monto) esperado[p.vuelto.moneda === 'USD' ? 'divisas' : 'efectivo'] -= p.vuelto.monto;
  };
  ventas.forEach((v) => v.pagos.forEach(sumarPago));
  abonos.forEach((a) => sumarPago(a.pago));
  gastos.forEach((g) => (esperado[g.metodo] -= metodo(g.metodo).moneda === 'USD' ? g.montoUsd : g.montoBs));
  esperado.efectivo += ses.fondoBs;
  esperado.divisas += ses.fondoUsd;
  return {
    esperado,
    nVentas: ventas.length,
    totalUsd: sum(ventas, (v) => v.totalUsd),
    totalBs: sum(ventas, (v) => v.totalBs),
    ivaUsd: sum(ventas, (v) => v.ivaUsd),
    igtfBs: sum(ventas, (v) => v.igtfBs),
    abonosUsd: sum(abonos, (a) => a.montoUsd),
    gastosUsd: sum(gastos, (g) => g.montoUsd),
    nAnuladas: s.ventas.filter((v) => v.sesionId === ses.id && v.estado === 'anulada').length,
  };
}

export function cerrarCaja({ sesionId, usuario, nota }) {
  return tx((s) => {
    const ses = s.sesiones.find((x) => x.id === sesionId);
    if (!ses || ses.estado !== 'abierta') err('La sesión de caja no está abierta');
    const r = resumenSesion(s, ses);
    ses.estado = 'cerrada';
    ses.cierre = ahora();
    ses.usuarioCierre = usuario.nombre;
    ses.resumen = r;
    ses.nota = nota || '';
    return ses;
  });
}

// ---------------------------------------------------------------- Ventas
export function crearVenta({ caja, usuario, clienteId, items, pagos, tasaId, ordenId, mesa }) {
  return tx((s) => {
    const ses = turnoActual(s, caja, usuario);
    const tasa = tasaVigente(s);
    if (!tasa) err('No hay tasa del dólar registrada');
    if (tasa.id !== tasaId) err('La tasa cambió mientras cobraba. Vuelva a abrir el cobro para recalcular.');
    if (!items.length) err('La venta no tiene productos');
    const cliente = s.clientes.find((c) => c.id === clienteId);
    if (!cliente) err('Seleccione un cliente');
    if (CONFIG.MODO_FISCAL && cliente.consumidorFinal) err('En modo fiscal la factura requiere cédula/RIF del cliente');

    const tot = calcularTotales(items, tasa.valor);
    const aplicadoBs = sum(pagos, (p) => p.aplicadoBs);
    if (aplicadoBs < tot.totalBs) err('El pago no cubre el total');

    // Stock (solo productos que lo controlan)
    for (const it of items) {
      const p = s.productos.find((x) => x.id === it.productoId);
      if (!p) err(`Producto no encontrado: ${it.nombre}`);
      if (p.controlStock) {
        if (p.stock + 1e-9 < it.cantidad) err(`Stock insuficiente de ${p.nombre} (disponible: ${p.stock})`);
        p.stock = Math.round((p.stock - it.cantidad) * 1000) / 1000;
      }
    }

    const id = sigId(s, 'venta');
    const doc = CONFIG.MODO_FISCAL
      ? { tipo: 'FACTURA', numero: String(sigId(s, 'factura')).padStart(8, '0'), control: '00-' + String(sigId(s, 'control')).padStart(8, '0') }
      : { tipo: 'NOTA DE ENTREGA', numero: String(sigId(s, 'nota')).padStart(6, '0') };

    // Fiado
    const pagoFiado = pagos.filter((p) => p.metodo === 'fiado');
    if (pagoFiado.length) {
      if (cliente.consumidorFinal) err('Para fiar debe seleccionar un cliente registrado');
      const monto = sum(pagoFiado, (p) => p.aplicadoUsd);
      if (cliente.saldoUsd + monto > cliente.limiteUsd) err(`${cliente.nombre} supera su límite de crédito`);
      cliente.saldoUsd += monto;
      s.movFiado.push({ id: sigId(s, 'movFiado'), clienteId: cliente.id, tipo: 'cargo', montoUsd: monto, ventaId: id,
        fecha: ahora(), usuario: usuario.nombre, sesionId: ses.id, concepto: docVenta(doc) });
    }

    const venta = {
      id, doc, fecha: ahora(), caja, sesionId: ses.id, usuario: usuario.nombre,
      clienteId: cliente.id, cliente: { cedula: cliente.cedula, nombre: cliente.nombre },
      items: items.map((i) => ({ productoId: i.productoId, nombre: i.nombre, unidad: i.unidad, cantidad: i.cantidad,
        precioUsd: i.precioUsd, totalUsd: Math.round(i.precioUsd * i.cantidad), nota: i.nota || '' })),
      ...tot,
      igtfBs: sum(pagos, (p) => p.igtfBs || 0),
      tasa: { id: tasa.id, valor: tasa.valor, origen: tasa.origen, fechaValor: tasa.fechaValor },
      pagos: pagos.map((p) => ({ ...p, estado: CONFIG.CONFIRMAR_PAGOS && metodo(p.metodo).confirmar ? 'por_confirmar' : 'ok' })),
      mesa: mesa || null,
      estado: 'pagada',
    };
    s.ventas.push(venta);
    if (ordenId) s.ordenes = s.ordenes.filter((o) => o.id !== ordenId);
    return venta;
  });
}

export function anularVenta(id, usuario, motivo) {
  return tx((s) => {
    const v = s.ventas.find((x) => x.id === id);
    if (!v || v.estado === 'anulada') err('Venta no encontrada o ya anulada');
    v.estado = 'anulada';
    v.anulacion = { fecha: ahora(), usuario: usuario.nombre, motivo };
    for (const it of v.items) {
      const p = s.productos.find((x) => x.id === it.productoId);
      if (p?.controlStock) p.stock = Math.round((p.stock + it.cantidad) * 1000) / 1000;
    }
    const fiado = sum(v.pagos.filter((p) => p.metodo === 'fiado'), (p) => p.aplicadoUsd);
    if (fiado) {
      const c = s.clientes.find((x) => x.id === v.clienteId);
      c.saldoUsd -= fiado;
      s.movFiado.push({ id: sigId(s, 'movFiado'), clienteId: c.id, tipo: 'abono', montoUsd: fiado, ventaId: v.id,
        fecha: ahora(), usuario: usuario.nombre, concepto: `Anulación ${docVenta(v.doc)}`, pago: null });
    }
    return v;
  });
}

export function confirmarPago(ventaId, idx, usuario) {
  return tx((s) => {
    const p = s.ventas.find((v) => v.id === ventaId).pagos[idx];
    p.estado = 'ok';
    p.confirmadoPor = usuario.nombre;
    p.confirmadoEn = ahora();
  });
}

export function confirmarPagoAbono(movId, usuario) {
  return tx((s) => {
    const p = s.movFiado.find((m) => m.id === movId).pago;
    p.estado = 'ok';
    p.confirmadoPor = usuario.nombre;
    p.confirmadoEn = ahora();
  });
}

// ---------------------------------------------------------------- Fiado
export function registrarAbono({ clienteId, metodoId, entregado, datos, usuario, caja }) {
  return tx((s) => {
    const ses = turnoActual(s, caja, usuario);
    const tasa = tasaVigente(s);
    const c = s.clientes.find((x) => x.id === clienteId);
    const m = metodo(metodoId);
    const montoUsd = m.moneda === 'USD' ? entregado : bsAUsd(entregado, tasa.valor);
    if (montoUsd <= 0) err('Monto inválido');
    if (montoUsd > c.saldoUsd + 1) err('El abono es mayor que la deuda');
    const aplicado = Math.min(montoUsd, c.saldoUsd);
    c.saldoUsd -= aplicado;
    const mov = {
      id: sigId(s, 'movFiado'), clienteId, tipo: 'abono', montoUsd: aplicado, fecha: ahora(), usuario: usuario.nombre,
      sesionId: ses.id, concepto: `Abono (${m.nombre})`, tasa: tasa.valor,
      pago: { metodo: metodoId, entregado, aplicadoUsd: aplicado, aplicadoBs: usdABs(aplicado, tasa.valor), ...datos,
        estado: CONFIG.CONFIRMAR_PAGOS && m.confirmar ? 'por_confirmar' : 'ok' },
    };
    s.movFiado.push(mov);
    return mov;
  });
}

// ---------------------------------------------------------------- Catálogos
export function guardarProducto(p) {
  return tx((s) => {
    if (s.productos.some((x) => x.codigo === p.codigo && x.id !== p.id)) err('Ya existe un producto con ese código');
    if (p.id) Object.assign(s.productos.find((x) => x.id === p.id), p);
    else s.productos.push({ ...p, id: sigId(s, 'producto') });
  });
}
export function entradaStock(id, cantidad) {
  return tx((s) => {
    const p = s.productos.find((x) => x.id === id);
    p.stock = Math.round((p.stock + cantidad) * 1000) / 1000;
  });
}
export function eliminarProducto(id) {
  return tx((s) => {
    if (s.ventas.some((v) => v.items.some((i) => i.productoId === id))) {
      s.productos.find((x) => x.id === id).activo = false;
      return 'desactivado';
    }
    s.productos = s.productos.filter((x) => x.id !== id);
    return 'eliminado';
  });
}

export function guardarCliente(c) {
  return tx((s) => {
    if (s.clientes.some((x) => x.cedula.toUpperCase() === c.cedula.toUpperCase() && x.id !== c.id)) err('Ya existe un cliente con esa cédula/RIF');
    if (c.id) Object.assign(s.clientes.find((x) => x.id === c.id), c);
    else {
      const nuevo = { saldoUsd: 0, limiteUsd: 0, ...c, id: sigId(s, 'cliente') };
      s.clientes.push(nuevo);
      return nuevo;
    }
  });
}
export function eliminarCliente(id) {
  return tx((s) => {
    const c = s.clientes.find((x) => x.id === id);
    if (c.consumidorFinal) err('No se puede eliminar el consumidor final');
    if (s.ventas.some((v) => v.clienteId === id) || s.movFiado.some((m) => m.clienteId === id))
      err('El cliente tiene ventas o movimientos de fiado; no se puede eliminar');
    s.clientes = s.clientes.filter((x) => x.id !== id);
  });
}

export function guardarProveedor(p) {
  return tx((s) => {
    if (p.id) Object.assign(s.proveedores.find((x) => x.id === p.id), p);
    else s.proveedores.push({ ...p, id: sigId(s, 'proveedor') });
  });
}
export function eliminarProveedor(id) {
  return tx((s) => {
    if (s.gastos.some((g) => g.proveedorId === id)) err('El proveedor tiene gastos registrados');
    s.proveedores = s.proveedores.filter((x) => x.id !== id);
  });
}

export function registrarGasto({ proveedorId, descripcion, metodoId, monto, desdeCaja, usuario, caja }) {
  return tx((s) => {
    const tasa = tasaVigente(s);
    const m = metodo(metodoId);
    const ses = desdeCaja ? turnoActual(s, caja, usuario) : null;
    const g = {
      id: sigId(s, 'gasto'), proveedorId: Number(proveedorId), descripcion, metodo: metodoId,
      montoUsd: m.moneda === 'USD' ? monto : bsAUsd(monto, tasa.valor),
      montoBs: m.moneda === 'USD' ? usdABs(monto, tasa.valor) : monto,
      tasa: tasa.valor, fecha: ahora(), usuario: usuario.nombre, sesionId: ses ? ses.id : null,
    };
    s.gastos.push(g);
    return g;
  });
}

export function guardarUsuario(u) {
  return tx((s) => {
    if (s.usuarios.some((x) => x.usuario === u.usuario && x.id !== u.id)) err('Ese nombre de usuario ya existe');
    if (u.id) Object.assign(s.usuarios.find((x) => x.id === u.id), u);
    else s.usuarios.push({ ...u, id: sigId(s, 'usuario') });
  });
}

// ---------------------------------------------------------------- Mesas / comandas
export const ordenDeMesa = (mesa, s = db()) => s.ordenes.find((o) => o.mesa === mesa);

function obtenerOrden(s, mesa, usuario) {
  let o = s.ordenes.find((x) => x.mesa === mesa);
  if (!o) {
    o = { id: sigId(s, 'orden'), mesa, items: [], abierta: ahora(), usuario: usuario.nombre, clienteId: 1 };
    s.ordenes.push(o);
  }
  return o;
}

export function agregarItemOrden(mesa, producto, cantidad, usuario, nota = '') {
  return tx((s) => {
    const o = obtenerOrden(s, mesa, usuario);
    const ex = o.items.find((i) => i.productoId === producto.id && !i.enviado && (i.nota || '') === nota && producto.unidad !== 'kg');
    if (ex) ex.cantidad += cantidad;
    else o.items.push({ lineId: sigId(s, 'linea'), productoId: producto.id, nombre: producto.nombre, unidad: producto.unidad,
      cantidad, precioUsd: producto.precioUsd, area: producto.area || null, nota, enviado: false });
  });
}
export function cambiarItemOrden(mesa, lineId, cambios, { permitirEnviado = false } = {}) {
  return tx((s) => {
    const o = ordenDeMesa(mesa, s);
    const it = o?.items.find((i) => i.lineId === lineId);
    if (!it) return;
    if (it.enviado && !permitirEnviado) err('Ese producto ya se envió a cocina/barra. Solo un administrador puede modificarlo.');
    if (cambios.cantidad !== undefined && cambios.cantidad <= 0) o.items = o.items.filter((i) => i !== it);
    else Object.assign(it, cambios);
  });
}
export function clienteOrden(mesa, clienteId) {
  return tx((s) => { const o = ordenDeMesa(mesa, s); if (o) o.clienteId = clienteId; });
}
export function liberarMesa(mesa) {
  return tx((s) => {
    const o = ordenDeMesa(mesa, s);
    if (o?.items.some((i) => i.enviado)) err('La mesa tiene productos ya enviados a cocina/barra. Cobre la cuenta o quite esos productos primero.');
    s.ordenes = s.ordenes.filter((x) => x.mesa !== mesa);
  });
}
export function moverMesa(desde, hacia) {
  return tx((s) => {
    if (ordenDeMesa(hacia, s)) err(`${hacia} está ocupada`);
    const o = ordenDeMesa(desde, s);
    o.mesa = hacia;
    s.comandas.filter((c) => c.ordenId === o.id).forEach((c) => (c.mesa = hacia));
  });
}

function crearComandas(s, { items, mesa, ordenId, usuario }) {
  const porArea = {};
  for (const it of items) if (it.area) (porArea[it.area] ||= []).push(it);
  return Object.entries(porArea).map(([area, its]) => {
    const c = {
      id: sigId(s, 'comanda'), numero: s.seq.comanda, ordenId: ordenId || null, mesa, area, estado: 'pendiente',
      creada: ahora(), usuario: usuario.nombre,
      items: its.map((i) => ({ nombre: i.nombre, cantidad: i.cantidad, unidad: i.unidad, nota: i.nota || '' })),
    };
    s.comandas.push(c);
    return c;
  });
}

export function enviarComandas(mesa, usuario) {
  return tx((s) => {
    const o = ordenDeMesa(mesa, s);
    const nuevos = o?.items.filter((i) => !i.enviado) || [];
    if (!nuevos.length) err('No hay productos nuevos para enviar');
    nuevos.forEach((i) => (i.enviado = true));
    return crearComandas(s, { items: nuevos, mesa, ordenId: o.id, usuario });
  });
}
export function comandasDeVentaRapida(venta, usuario) {
  return tx((s) => {
    const items = venta.items.map((i) => ({ ...i, area: s.productos.find((p) => p.id === i.productoId)?.area }));
    return crearComandas(s, { items, mesa: `Mostrador · ${docVenta(venta.doc)}`, usuario });
  });
}
export function marcarComanda(id, estado) {
  return tx((s) => {
    const c = s.comandas.find((x) => x.id === id);
    c.estado = estado;
    c[estado] = ahora();
  });
}
