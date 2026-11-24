// Datos de ejemplo (se generan relativos a la fecha de hoy).
import { CONFIG, metodo } from './config.js';
import { fechaLocal, sumarDias, esHabil, usdABs, bsAUsd, hoy, docVenta } from './util.js';

// RNG determinístico para que la demo sea reproducible
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRODUCTOS = [
  // codigo, nombre, categoria, area, unidad, precio $, controlStock, stock, stockMin
  ['C01', 'Café negro', 'Café', 'barra', 'und', 1.0],
  ['C02', 'Café marrón', 'Café', 'barra', 'und', 1.5],
  ['C03', 'Café con leche', 'Café', 'barra', 'und', 2.0],
  ['C04', 'Capuchino', 'Café', 'barra', 'und', 2.5],
  ['C05', 'Latte', 'Café', 'barra', 'und', 2.8],
  ['C06', 'Mocaccino', 'Café', 'barra', 'und', 3.0],
  ['C07', 'Chocolate caliente', 'Café', 'barra', 'und', 2.5],
  ['C08', 'Té / infusión', 'Café', 'barra', 'und', 1.2],
  ['B01', 'Jugo natural', 'Bebidas', 'barra', 'und', 2.5],
  ['B02', 'Merengada', 'Bebidas', 'barra', 'und', 3.5],
  ['B03', 'Frappé', 'Bebidas', 'barra', 'und', 3.8],
  ['B04', 'Agua mineral 600ml', 'Bebidas', null, 'und', 1.0, true, 48, 12],
  ['B05', 'Refresco lata', 'Bebidas', null, 'und', 1.5, true, 36, 12],
  ['F01', 'Tequeños (6)', 'Comida', 'cocina', 'und', 4.0],
  ['F02', 'Empanada', 'Comida', 'cocina', 'und', 1.8],
  ['F03', 'Arepa reina pepiada', 'Comida', 'cocina', 'und', 4.5],
  ['F04', 'Arepa de queso', 'Comida', 'cocina', 'und', 3.0],
  ['F05', 'Sándwich mixto', 'Comida', 'cocina', 'und', 3.5],
  ['F06', 'Cachito de jamón', 'Comida', 'cocina', 'und', 2.0, true, 24, 6],
  ['F07', 'Pastelito', 'Comida', 'cocina', 'und', 1.5, true, 30, 8],
  ['P01', 'Torta de chocolate (porción)', 'Postres', null, 'und', 3.0, true, 12, 4],
  ['P02', 'Quesillo', 'Postres', null, 'und', 2.5, true, 4, 4],
  ['P03', 'Galleta artesanal', 'Postres', null, 'und', 0.8, true, 30, 10],
  ['K01', 'Café en grano', 'Por peso', null, 'kg', 14.0, true, 8, 2],
  ['K02', 'Café molido', 'Por peso', null, 'kg', 12.0, true, 5, 2],
];

export function generarSemilla() {
  const r = rng(20261123);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const s = {
    version: 1,
    creado: new Date().toISOString(),
    seq: {},
    usuarios: [
      { id: 1, nombre: 'Administrador', usuario: 'admin', rol: 'admin', pin: '1234', activo: true },
      { id: 2, nombre: 'María González', usuario: 'maria', rol: 'cajero', pin: '1111', activo: true },
      { id: 3, nombre: 'Carlos Méndez', usuario: 'carlos', rol: 'cajero', pin: '3333', activo: true },
      { id: 4, nombre: 'José Rivas', usuario: 'jose', rol: 'mesonero', pin: '2222', activo: true },
    ],
    productos: PRODUCTOS.map(([codigo, nombre, categoria, area, unidad, precio, controlStock = false, stock = 0, stockMin = 0], i) => ({
      id: i + 1, codigo, nombre, categoria, area, unidad, precioUsd: Math.round(precio * 100), controlStock, stock, stockMin, activo: true,
    })),
    clientes: [
      { id: 1, cedula: 'V-00000000', nombre: 'Consumidor final', telefono: '', limiteUsd: 0, saldoUsd: 0, consumidorFinal: true },
      { id: 2, cedula: 'V-12345678', nombre: 'Ana Pérez', telefono: '0414-1112233', limiteUsd: 3000, saldoUsd: 0 },
      { id: 3, cedula: 'V-20111222', nombre: 'Luis Gómez', telefono: '0424-5556677', limiteUsd: 2000, saldoUsd: 0 },
      { id: 4, cedula: 'J-40123456-7', nombre: 'Inversiones Tech C.A.', telefono: '0212-9998877', limiteUsd: 10000, saldoUsd: 0 },
      { id: 5, cedula: 'V-18765432', nombre: 'Carla Rojas', telefono: '0412-3334455', limiteUsd: 0, saldoUsd: 0 },
      { id: 6, cedula: 'V-15999888', nombre: 'Pedro Díaz', telefono: '0416-7778899', limiteUsd: 1500, saldoUsd: 0 },
    ],
    proveedores: [
      { id: 1, nombre: 'Lácteos Los Andes', telefono: '0274-1234567', rif: 'J-30111222-3' },
      { id: 2, nombre: 'Panadería La Espiga', telefono: '0212-7654321', rif: 'J-31222333-4' },
      { id: 3, nombre: 'Tostadora Café de Lara', telefono: '0251-1122334', rif: 'J-29333444-5' },
      { id: 4, nombre: 'Servicios y gas', telefono: '0800-0000000', rif: 'G-20000000-0' },
    ],
    tasas: [],
    tasaEstado: { ultimoIntento: null, ultimoExito: null, ok: null, error: null },
    simularSinInternet: false,
    ventas: [],
    sesiones: [],
    movFiado: [],
    gastos: [],
    ordenes: [],
    comandas: [],
  };
  s.seq = { usuario: 4, producto: s.productos.length, cliente: 6, proveedor: 4 };
  const sig = (n) => (s.seq[n] = (s.seq[n] || 0) + 1);

  // --- Historial de tasas (días hábiles; la última es la del día hábil anterior a hoy)
  const H = hoy();
  const DIAS = 14;
  const fechasTasa = [];
  for (let f = sumarDias(H, -DIAS - 4); f < H; f = sumarDias(f, 1)) if (esHabil(f)) fechasTasa.push(f);
  fechasTasa.forEach((f, i) => {
    const valor = Math.round(CONFIG.TASA.semillaDemo * Math.pow(1.0035, i - fechasTasa.length + 1) * 10000) / 10000;
    s.tasas.push({ id: sig('tasa'), valor, fechaValor: f, origen: 'BCV', fuente: 'Historial de ejemplo',
      registradoPor: 'Automático', registradoEn: new Date(`${f}T08:00:00`).toISOString() });
  });
  const tasaDe = (ymd) => [...s.tasas].reverse().find((t) => t.fechaValor <= ymd) || s.tasas[0];

  // --- Saldos iniciales de fiado (migrados del sistema anterior)
  const cargoInicial = (clienteId, usd, fecha) => {
    s.movFiado.push({ id: sig('movFiado'), clienteId, tipo: 'cargo', montoUsd: usd, ventaId: null, fecha,
      usuario: 'Administrador', concepto: 'Saldo inicial (migrado)' });
    s.clientes.find((c) => c.id === clienteId).saldoUsd += usd;
  };
  const inicio = new Date(`${sumarDias(H, -DIAS - 1)}T09:00:00`).toISOString();
  if (CONFIG.MODULO_FIADO) {
    cargoInicial(2, 850, inicio);
    cargoInicial(4, 3200, inicio);
    cargoInicial(6, 600, inicio);
  } else s.clientes.forEach((c) => (c.limiteUsd = 0));

  // --- Ventas, abonos, gastos y cierres de los últimos días
  const activos = s.productos;
  const vendedores = { 'Caja 1': 'María González', 'Caja 2': 'Carlos Méndez' };
  const pesosMetodo = [['pagomovil', 34], ['divisas', 26], ['debito', 18], ['efectivo', 10], ['transferencia', 5], ['zelle', 3], ['credito', 4]];
  const elegirMetodo = () => {
    let x = r() * 100;
    for (const [m, p] of pesosMetodo) if ((x -= p) < 0) return m;
    return 'pagomovil';
  };

  for (let d = DIAS; d >= 1; d--) {
    const fecha = sumarDias(H, -d);
    const tasa = tasaDe(fecha);
    for (const caja of ['Caja 1', 'Caja 2']) {
      const ses = { id: sig('sesion'), caja, estado: 'cerrada', apertura: new Date(`${fecha}T07:00:00`).toISOString(),
        usuarioApertura: vendedores[caja], fondoBs: 0, fondoUsd: 0 };
      s.sesiones.push(ses);
      const n = 12 + Math.floor(r() * 14);
      for (let k = 0; k < n; k++) {
        const hora = 7 * 60 + Math.floor(r() * 12 * 60);
        const fh = new Date(`${fecha}T${String(Math.floor(hora / 60)).padStart(2, '0')}:${String(hora % 60).padStart(2, '0')}:00`).toISOString();
        const items = [];
        const nItems = 1 + Math.floor(r() * 3);
        for (let j = 0; j < nItems; j++) {
          const p = pick(activos);
          const cantidad = p.unidad === 'kg' ? pick([0.25, 0.5, 1]) : 1 + Math.floor(r() * 2);
          items.push({ productoId: p.id, nombre: p.nombre, unidad: p.unidad, cantidad, precioUsd: p.precioUsd, totalUsd: Math.round(p.precioUsd * cantidad), nota: '' });
        }
        const bruto = items.reduce((a, i) => a + i.totalUsd, 0);
        let baseUsd = bruto, ivaUsd = 0;
        if (CONFIG.MODO_FISCAL) { baseUsd = Math.round(bruto / (1 + CONFIG.IMPUESTOS.IVA / 100)); ivaUsd = bruto - baseUsd; }
        const totalUsd = bruto;
        const totalBs = usdABs(totalUsd, tasa.valor);

        let clienteId = r() < 0.7 ? 1 : 2 + Math.floor(r() * 5);
        let m = elegirMetodo();
        if (r() < 0.06 && CONFIG.MODULO_FIADO) {
          const idDeudor = pick([2, 3, 4, 6]);
          const deudor = s.clientes.find((c) => c.id === idDeudor);
          if (deudor.saldoUsd + totalUsd <= deudor.limiteUsd) { clienteId = deudor.id; m = 'fiado'; }
        }
        if (CONFIG.MODO_FISCAL && clienteId === 1) clienteId = 2 + Math.floor(r() * 5);
        const cliente = s.clientes.find((c) => c.id === clienteId);

        const mkPago = (mid, aplicadoBs) => {
          const mm = metodo(mid);
          const igtfBs = CONFIG.MODO_FISCAL && mm.igtf ? Math.round(aplicadoBs * CONFIG.IMPUESTOS.IGTF / 100) : 0;
          const entregado = mm.moneda === 'USD' ? Math.ceil((aplicadoBs + igtfBs) / tasa.valor) : aplicadoBs + igtfBs;
          const p = { metodo: mid, entregado, aplicadoBs, aplicadoUsd: bsAUsd(aplicadoBs, tasa.valor), igtfBs, estado: 'ok' };
          if (mm.campos?.includes('referencia')) p.referencia = String(100000 + Math.floor(r() * 899999));
          if (mid === 'divisas' && r() < 0.4) {
            const billete = Math.ceil(entregado / 500) * 500; // pagó con billetes de $5
            if (billete > entregado) { p.vuelto = { moneda: 'BS', monto: usdABs(billete - entregado, tasa.valor) }; p.entregado = billete; }
          }
          return p;
        };
        let pagos;
        if (m !== 'fiado' && r() < 0.15) {
          const parte = Math.round(totalBs * 0.5);
          pagos = [mkPago('divisas', parte), mkPago('pagomovil', totalBs - parte)];
        } else pagos = [mkPago(m, totalBs)];

        const id = sig('venta');
        const doc = CONFIG.MODO_FISCAL
          ? { tipo: 'FACTURA', numero: String(sig('factura')).padStart(8, '0'), control: '00-' + String(sig('control')).padStart(8, '0') }
          : { tipo: 'NOTA DE ENTREGA', numero: String(sig('nota')).padStart(6, '0') };
        if (m === 'fiado') {
          cliente.saldoUsd += pagos[0].aplicadoUsd;
          s.movFiado.push({ id: sig('movFiado'), clienteId, tipo: 'cargo', montoUsd: pagos[0].aplicadoUsd, ventaId: id, fecha: fh,
            usuario: vendedores[caja], sesionId: ses.id, concepto: docVenta(doc) });
        }
        s.ventas.push({
          id, doc, fecha: fh, caja, sesionId: ses.id, usuario: vendedores[caja], clienteId,
          cliente: { cedula: cliente.cedula, nombre: cliente.nombre }, items, baseUsd, ivaUsd, totalUsd, totalBs,
          igtfBs: pagos.reduce((a, p) => a + p.igtfBs, 0),
          tasa: { id: tasa.id, valor: tasa.valor, origen: tasa.origen, fechaValor: tasa.fechaValor },
          pagos, mesa: CONFIG.MODO_COMANDAS && r() < 0.5 ? pick(CONFIG.MESAS) : null, estado: 'pagada',
        });
      }
      // Un abono de vez en cuando
      if (CONFIG.MODULO_FIADO && caja === 'Caja 1' && d % 4 === 0) {
        const idDeudor = pick([2, 4, 6]);
        const deudor = s.clientes.find((c) => c.id === idDeudor && c.saldoUsd > 300);
        if (deudor) {
          const usd = Math.min(deudor.saldoUsd, 500);
          deudor.saldoUsd -= usd;
          s.movFiado.push({ id: sig('movFiado'), clienteId: deudor.id, tipo: 'abono', montoUsd: usd,
            fecha: new Date(`${fecha}T16:30:00`).toISOString(), usuario: vendedores[caja], sesionId: ses.id,
            concepto: 'Abono (Pago Móvil)', tasa: tasa.valor,
            pago: { metodo: 'pagomovil', entregado: usdABs(usd, tasa.valor), aplicadoUsd: usd, aplicadoBs: usdABs(usd, tasa.valor), referencia: '554433', estado: 'ok' } });
        }
      }
      // Gasto pagado desde caja
      if (caja === 'Caja 1' && d % 3 === 0) {
        const montoUsd = 1500 + Math.floor(r() * 3000);
        s.gastos.push({ id: sig('gasto'), proveedorId: pick([1, 2]), descripcion: pick(['Leche y queso', 'Pan y cachitos', 'Hielo']),
          metodo: 'divisas', montoUsd, montoBs: usdABs(montoUsd, tasa.valor), tasa: tasa.valor,
          fecha: new Date(`${fecha}T10:15:00`).toISOString(), usuario: 'Administrador', sesionId: ses.id });
      }
      if (d === 10 && caja === 'Caja 1') {
        s.gastos.push({ id: sig('gasto'), proveedorId: 3, descripcion: 'Café en grano 10 kg', metodo: 'transferencia',
          montoUsd: 9500, montoBs: usdABs(9500, tasa.valor), tasa: tasa.valor, fecha: new Date(`${fecha}T11:00:00`).toISOString(),
          usuario: 'Administrador', sesionId: null });
      }
      ses.cierre = new Date(`${fecha}T19:30:00`).toISOString();
      ses.usuarioCierre = vendedores[caja];
    }
  }
  // Dos pagos móviles de ayer quedan por confirmar (para la demo de verificación)
  if (CONFIG.CONFIRMAR_PAGOS) s.ventas.filter((v) => v.fecha >= new Date(`${sumarDias(H, -1)}T00:00:00`).toISOString() && v.pagos[0].metodo === 'pagomovil')
    .slice(-2).forEach((v) => (v.pagos[0].estado = 'por_confirmar'));
  return s;
}

// Completa los cierres de las sesiones generadas (necesita resumenSesion, que vive en services)
export function completarCierres(s, resumenSesion) {
  for (const ses of s.sesiones) {
    if (ses.estado !== 'cerrada' || ses.resumen) continue;
    const r = resumenSesion(s, ses);
    ses.resumen = r;
    ses.nota = '';
  }
  return s;
}
