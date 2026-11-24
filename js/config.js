// =====================================================================
//  CONFIGURACIÓN DE LA DEMO
//  Todo lo que cambia el comportamiento del sistema está aquí.
//  Al cambiar MODO_COMANDAS, MODO_FISCAL o MODULO_FIADO los datos de ejemplo
//  se regeneran solos la próxima vez que se abre la página.
// =====================================================================

export const CONFIG = {
  NEGOCIO: {
    nombre: 'Sales System',
    rif: 'J-00000000-0',
    direccion: 'Av. Principal, Local 1',
    telefono: '0414-000-0000',
  },

  // ---------------------------------------------------------------
  // MODO COMANDAS
  //   true  → Mesas + pedidos que se envían a Cocina / Barra (pantalla e impresora por área).
  //           Además queda disponible la "Venta rápida" de mostrador.
  //   false → Solo venta directa en mostrador (como el sistema actual).
  // ---------------------------------------------------------------
  MODO_COMANDAS: false,

  // ---------------------------------------------------------------
  // MÓDULO FIADO (lista negra / cuentas por cobrar)
  //   true  → Pantalla "Fiado", método de pago "Fiado", límite de crédito por cliente y abonos.
  //   false → Todo eso se oculta.
  // ---------------------------------------------------------------
  MODULO_FIADO: false,

  // ---------------------------------------------------------------
  // CONFIRMAR PAGOS (Pago Móvil / Transferencia / Zelle)
  //   true  → Esos pagos quedan "por confirmar" hasta que alguien verifique en el banco
  //           (pestaña "Pagos por confirmar" en Ventas).
  //   false → Se dan por buenos al cobrar (solo se pide la referencia).
  // ---------------------------------------------------------------
  CONFIRMAR_PAGOS: false,

  // ---------------------------------------------------------------
  // MODO FISCAL
  //   true  → Emite FACTURA con N° de control, desglosa IVA, cobra IGTF a los pagos
  //           en divisas y manda la factura a la impresora fiscal (simulada).
  //           El cliente con cédula/RIF es obligatorio.
  //   false → Emite NOTA DE ENTREGA (comprobante no fiscal), sin impuestos desglosados.
  // ---------------------------------------------------------------
  MODO_FISCAL: false,

  IMPUESTOS: {
    IVA: 16,                    // %
    IGTF: 3,                    // % sobre pagos en divisas (solo en modo fiscal)
    PRECIOS_INCLUYEN_IVA: true, // true: el precio del producto ya trae el IVA
  },

  // Terminales de la red. Cada pestaña/PC elige cuál es al iniciar sesión.
  CAJAS: ['Caja 1', 'Caja 2', 'Caja 3'],

  // Solo se usan con MODO_COMANDAS = true
  MESAS: ['Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4', 'Mesa 5', 'Mesa 6', 'Terraza 1', 'Terraza 2', 'Barra 1', 'Barra 2'],
  AREAS: { cocina: 'Cocina', barra: 'Barra' },

  // ---------------------------------------------------------------
  // IMPRESIÓN — soporta varios escenarios porque aún no se conoce el hardware.
  //   modo:
  //     'navegador'    → imprime con el diálogo del navegador (cualquier impresora instalada en esa PC).
  //     'servidor-usb' → la impresora térmica está conectada por USB al PC servidor;
  //                      el servidor recibe el ticket y lo manda en ESC/POS (abre gaveta).
  //     'red-ip'       → impresora térmica de red (puerto 9100), el servidor le envía ESC/POS.
  //     'por-caja'     → cada caja tiene su propia impresora (ver porCaja).
  //   En la demo los modos de servidor se SIMULAN: se muestra la vista previa,
  //   el destino y los comandos ESC/POS que se enviarían.
  // ---------------------------------------------------------------
  IMPRESION: {
    modo: 'por-caja',
    anchoPapel: 80,          // 58 u 80 mm
    abrirGaveta: true,       // pulso de apertura de gaveta al cobrar en efectivo/divisas
    mostrarVistaPrevia: true,
    servidorUsb: { nombre: 'POS-80 (USB del servidor)' },
    redIp: { ip: '192.168.1.50', puerto: 9100 },
    porCaja: {
      'Caja 1': { modo: 'servidor-usb' },
      'Caja 2': { modo: 'red-ip', ip: '192.168.1.51', puerto: 9100 },
      'Caja 3': { modo: 'navegador' },
    },
    // Destino de las comandas por área (solo MODO_COMANDAS)
    //   'pantalla' → solo aparece en la pantalla de Cocina/Barra
    //   o cualquier modo de impresora de arriba
    comandas: {
      cocina: { modo: 'red-ip', ip: '192.168.1.60', puerto: 9100, tambienPantalla: true },
      barra: { modo: 'pantalla' },
    },
    // Impresora fiscal (solo MODO_FISCAL)
    fiscal: { nombre: 'Impresora fiscal', puerto: 'COM3' },
  },

  // ---------------------------------------------------------------
  // TASA BCV
  // ---------------------------------------------------------------
  TASA: {
    intervaloMinutos: 60,      // cada cuánto se consulta automáticamente (si hay internet)
    timeoutMs: 8000,
    diasHabilesAviso: 2,       // amarillo si la tasa tiene esta antigüedad (días hábiles)
    diasHabilesAlerta: 3,      // rojo
    semillaDemo: 900,          // valor base para el historial de ejemplo
    // Se prueban en orden; si una falla se usa la siguiente.
    proveedores: ['dolarapi', 'allratestoday'],
  },

  // Métodos de pago activos ("Fiado" solo si MODULO_FIADO = true)
  get METODOS_PAGO() {
    return this.MODULO_FIADO ? TODOS_LOS_METODOS : TODOS_LOS_METODOS.filter((m) => !m.fiado);
  },

  // Qué ve cada tipo de usuario. Un permiso con el nombre de una pantalla la muestra en el menú.
  //   enCaja: true → al entrar elige su caja y vende desde ella.
  //   El administrador no vende: ve todas las cajas, las cierra y administra.
  ROLES: {
    admin: {
      nombre: 'Administrador',
      permisos: ['caja', 'ventas', 'inventario', 'clientes', 'fiado', 'gastos', 'reportes', 'config', 'cocina',
        'ventas.anular', 'pagos.confirmar', 'clientes.credito', 'inventario.editar', 'fiado.abonar', 'orden.quitarEnviado'],
    },
    cajero: { nombre: 'Cajero', enCaja: true, permisos: ['venta', 'mesas', 'ventas', 'clientes', 'pagos.confirmar'] },
    mesonero: { nombre: 'Mesonero', permisos: ['mesas', 'cocina'] },
  },
};

const TODOS_LOS_METODOS = [
  { id: 'efectivo', nombre: 'Efectivo Bs', moneda: 'BS', efectivo: true },
  { id: 'divisas', nombre: 'Divisas $', moneda: 'USD', efectivo: true, igtf: true },
  { id: 'debito', nombre: 'Punto · Débito', moneda: 'BS', campos: ['referencia'] },
  { id: 'credito', nombre: 'Punto · Crédito', moneda: 'BS', campos: ['referencia'] },
  { id: 'pagomovil', nombre: 'Pago Móvil', moneda: 'BS', campos: ['referencia', 'banco', 'telefono', 'cedula'], confirmar: true },
  { id: 'transferencia', nombre: 'Transferencia', moneda: 'BS', campos: ['referencia', 'banco', 'titular', 'cedula'], confirmar: true },
  { id: 'zelle', nombre: 'Zelle', moneda: 'USD', campos: ['referencia', 'titular'], confirmar: true, igtf: true },
  { id: 'fiado', nombre: 'Fiado (cuenta)', moneda: 'USD', fiado: true },
];

export const metodo = (id) => TODOS_LOS_METODOS.find((m) => m.id === id);
