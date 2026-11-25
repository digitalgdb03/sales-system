import { CONFIG } from './config.js';
import { iniciarDB, db, suscribir } from './db.js';
import { resumenSesion, tasaVigente } from './services.js';
import { completarCierres } from './seed.js';
import { iniciarTasaAutomatica, estadoTasa, sinInternet } from './tasa.js';
import { esc, on, hayModal, fmtTasa, toast } from './util.js';
import { abrirModalTasa } from './views/tasaModal.js';

import * as venta from './views/venta.js';
import * as mesas from './views/mesas.js';
import * as cocina from './views/cocina.js';
import * as caja from './views/caja.js';
import * as ventas from './views/ventas.js';
import * as inventario from './views/inventario.js';
import * as clientes from './views/clientes.js';
import * as fiado from './views/fiado.js';
import * as gastos from './views/gastos.js';
import * as reportes from './views/reportes.js';
import * as configuracion from './views/configuracion.js';

const RUTAS = [
  { path: 'venta', titulo: CONFIG.MODO_COMANDAS ? 'Venta rápida' : 'Nueva venta', icono: '🛒', vista: venta },
  { path: 'mesas', titulo: 'Mesas', icono: '🍽️', vista: mesas, solo: CONFIG.MODO_COMANDAS },
  { path: 'cocina', titulo: 'Cocina / Barra', icono: '👨‍🍳', vista: cocina, solo: CONFIG.MODO_COMANDAS },
  { path: 'caja', titulo: 'Caja y cierres', icono: '💵', vista: caja },
  { path: 'ventas', titulo: 'Ventas', icono: '🧾', vista: ventas },
  { path: 'inventario', titulo: 'Inventario', icono: '📦', vista: inventario },
  { path: 'clientes', titulo: 'Clientes', icono: '👥', vista: clientes },
  { path: 'fiado', titulo: 'Fiado (Lista negra)', icono: '📒', vista: fiado, solo: CONFIG.MODULO_FIADO },
  { path: 'gastos', titulo: 'Gastos y proveedores', icono: '💸', vista: gastos },
  { path: 'reportes', titulo: 'Reportes', icono: '📊', vista: reportes },
  { path: 'config', titulo: 'Configuración', icono: '⚙️', vista: configuracion },
].filter((r) => r.solo !== false);

// La demo no tiene inicio de sesión: el usuario y la caja se eligen en la barra superior.
// Cada pestaña del navegador puede ser una caja / usuario distinto.
const CAJA_KEY = 'sistemaVenta_caja';
const USUARIO_KEY = 'sistemaVenta_usuario';
const ctx = {
  usuario: null,
  // Cajero: su caja fija (elegida al entrar). Administrador: la elige al vender.
  caja: sessionStorage.getItem(CAJA_KEY) || CONFIG.CAJAS[0],
  cajaFija: () => !!CONFIG.ROLES[ctx.usuario?.rol]?.enCaja,
  cambiarCaja: (c) => { ctx.caja = c; sessionStorage.setItem(CAJA_KEY, c); renderVista(); },
  puede: (permiso) => (CONFIG.ROLES[ctx.usuario?.rol]?.permisos || []).includes(permiso),
  navegar: (path) => (location.hash = `#/${path}`),
  refrescar: () => renderVista(),
};

const rutasVisibles = () => RUTAS.filter((r) => ctx.puede(r.path));

const rutaActual = () => {
  const path = location.hash.replace(/^#\/?/, '').split('?')[0];
  const visibles = rutasVisibles();
  return visibles.find((r) => r.path === path) || visibles[0];
};

function renderLayout() {
  document.getElementById('app').innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand"><b>${esc(CONFIG.NEGOCIO.nombre)}</b></div>
        <nav id="nav"></nav>
      </aside>
      <div class="main">
        <header class="topbar" id="topbar"></header>
        <main id="view"></main>
      </div>
    </div>`;
  const top = document.getElementById('topbar');
  on(top, 'click', '[data-tasa]', () => abrirModalTasa(ctx));
  on(top, 'click', '#salir', () => {
    sessionStorage.removeItem(USUARIO_KEY);
    sessionStorage.removeItem('sistemaVenta_carrito');
    ctx.usuario = null;
    renderLogin();
  });
}

// ---------------------------------------------------------------- Inicio de sesión (simulado)
// Los usuarios de prueba se muestran en pantalla; tocar uno llena los datos.
const DEMO_LOGIN = [
  { rol: 'cajero', usuario: 'maria' },
  { rol: 'admin', usuario: 'admin' },
];
function renderLogin() {
  const demo = DEMO_LOGIN.map((d) => db().usuarios.find((u) => u.usuario === d.usuario)).filter(Boolean);
  document.getElementById('app').innerHTML = `
    <div class="login">
      <form class="login-card" id="loginForm" autocomplete="off">
        <div class="login-brand"><h1>${esc(CONFIG.NEGOCIO.nombre)}</h1></div>
        <div class="field"><label>Usuario</label><input name="usuario" required></div>
        <div class="field"><label>Clave</label><input name="clave" type="password" inputmode="numeric" required></div>
        <div class="field" id="campoCaja" hidden><label>Caja</label><select name="caja">${CONFIG.CAJAS.map((c) => `<option ${c === ctx.caja ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <button class="btn btn-primary btn-lg btn-block" type="submit">Ingresar</button>
        <div class="login-hint">
          <b>Usuarios de prueba</b> (toque uno para llenar los datos)
          <div class="user-grid">${demo.map((u) => `
            <button type="button" class="user-btn" data-demo="${u.id}"><span class="avatar">${esc(u.nombre[0])}</span>
              <b>${esc(CONFIG.ROLES[u.rol].nombre)}</b><small>Usuario: ${esc(u.usuario)} · Clave: ${esc(u.pin)}</small></button>`).join('')}
          </div>
        </div>
      </form>
    </div>`;
  const f = document.getElementById('loginForm');
  // La caja solo se pide a los usuarios que venden (cajeros); el administrador no trabaja en una caja.
  const usuarioEscrito = () => db().usuarios.find((x) => x.usuario === f.usuario.value.trim().toLowerCase());
  const enCaja = () => !!CONFIG.ROLES[usuarioEscrito()?.rol]?.enCaja;
  const mostrarCaja = () => (f.querySelector('#campoCaja').hidden = !enCaja());
  f.usuario.oninput = mostrarCaja;
  on(f, 'click', '[data-demo]', (e, b) => {
    const u = db().usuarios.find((x) => x.id === Number(b.dataset.demo));
    f.usuario.value = u.usuario;
    f.clave.value = u.pin;
    f.querySelectorAll('[data-demo]').forEach((x) => x.classList.toggle('on', x === b));
    mostrarCaja();
  });
  f.onsubmit = (e) => {
    e.preventDefault();
    const u = db().usuarios.find((x) => x.activo && x.usuario === f.usuario.value.trim().toLowerCase() && x.pin === f.clave.value.trim());
    if (!u) return toast('Usuario o clave incorrectos', 'error');
    ctx.usuario = u;
    ctx.caja = enCaja() ? f.caja.value : sessionStorage.getItem(CAJA_KEY) || CONFIG.CAJAS[0];
    sessionStorage.setItem(USUARIO_KEY, String(u.id));
    sessionStorage.setItem(CAJA_KEY, ctx.caja);
    if (location.hash) location.hash = '';
    renderLayout();
    renderVista();
  };
  setTimeout(() => f.usuario.focus(), 30);
}

function renderNav() {
  if (!ctx.usuario || !document.getElementById('nav')) return;
  const actual = rutaActual();
  const pend = db().comandas.filter((c) => c.estado === 'pendiente').length;
  document.getElementById('nav').innerHTML = rutasVisibles().map((r) => `
    <a href="#/${r.path}" class="${r === actual ? 'active' : ''}"><span>${r.icono}</span>${esc(r.titulo)}
    ${r.path === 'cocina' && pend ? `<em class="badge">${pend}</em>` : ''}</a>`).join('');
}

function renderTopbar() {
  if (!ctx.usuario || !document.getElementById('topbar')) return;
  const t = tasaVigente();
  const est = estadoTasa(t);
  const off = sinInternet();
  document.getElementById('topbar').innerHTML = `
    <h2>${esc(rutaActual().titulo)}</h2>
    <div class="top-right">
      <button class="tasa-pill nivel-${est.nivel}" data-tasa title="${esc(est.texto)}">
        <span class="tasa-lbl">${t?.origen === 'MANUAL' ? 'Tasa manual' : 'Tasa BCV'}</span>
        <b>${t ? fmtTasa(t.valor) : '—'}</b><small>Bs/$</small>
      </button>
      <span class="net ${off ? 'off' : ''}">● ${off ? 'Sin internet' : 'En línea'}</span>
      ${ctx.cajaFija() ? `<div class="caja-pill">${esc(ctx.caja)}</div>` : ''}
      <div class="user-chip"><span class="avatar sm">${esc(ctx.usuario.nombre[0])}</span>
        <span><b>${esc(ctx.usuario.nombre)}</b>${ctx.usuario.nombre !== CONFIG.ROLES[ctx.usuario.rol].nombre ? `<small>${esc(CONFIG.ROLES[ctx.usuario.rol].nombre)}</small>` : ''}</span>
        <button class="btn btn-sm" id="salir">Salir</button></div>
    </div>`;
}

let limpiarVista = null;
let rutaRenderizada = null;
function renderVista() {
  const view = document.getElementById('view');
  if (!view) return;
  const r = rutaActual();
  const scroll = rutaRenderizada === r.path ? view.scrollTop : 0;
  if (typeof limpiarVista === 'function') limpiarVista();
  const el = document.createElement('div');
  el.className = `vista vista-${r.path}`;
  view.replaceChildren(el);
  try {
    limpiarVista = r.vista.render(el, ctx);
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="empty">No se pudo mostrar esta pantalla.</div>`;
  }
  rutaRenderizada = r.path;
  view.scrollTop = scroll;
  renderNav();
  renderTopbar();
}

// Refresco en tiempo real: si se está escribiendo o hay una ventana abierta, se pospone.
let pendiente = false;
const escribiendo = () => {
  const a = document.activeElement;
  return a && a.closest('#view') && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
};
function alCambiarDatos() {
  if (!ctx.usuario) return;
  renderTopbar();
  renderNav();
  if (hayModal() || escribiendo()) pendiente = true;
  else renderVista();
}
function intentarPendiente() {
  setTimeout(() => {
    if (pendiente && !hayModal() && !escribiendo()) {
      pendiente = false;
      renderVista();
    }
  }, 60);
}

iniciarDB((s) => completarCierres(s, resumenSesion));
ctx.usuario = db().usuarios.find((u) => u.activo && u.id === Number(sessionStorage.getItem(USUARIO_KEY))) || null;
if (ctx.usuario) { renderLayout(); renderVista(); } else renderLogin();
suscribir(alCambiarDatos);
document.addEventListener('modal-cerrado', intentarPendiente);
document.addEventListener('focusout', intentarPendiente);
window.addEventListener('hashchange', renderVista);
window.addEventListener('online', renderTopbar);
window.addEventListener('offline', renderTopbar);
document.addEventListener('keydown', (e) => { if (ctx.usuario && !hayModal()) rutaActual().vista.teclas?.(e, ctx); });
setInterval(renderTopbar, 60000);
iniciarTasaAutomatica();
