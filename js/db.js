// "Base de datos" de la demo: localStorage compartido entre pestañas.
// Simula el servidor de la red local:
//   - Cada pestaña = una terminal (caja, tablet de mesonero, pantalla de cocina).
//   - tx() relee el estado más reciente, aplica el cambio completo o nada (transacción),
//     y notifica a las demás pestañas (evento 'storage'), como haría un WebSocket.
// En la versión real esto es SQLite/PostgreSQL detrás de una API.

import { CONFIG } from './config.js';
import { generarSemilla } from './seed.js';

const KEY = 'sistemaVenta_demo_v1';
// Si cambian los modos en config.js, los datos guardados ya no corresponden: se regeneran.
const firma = () => JSON.stringify([2, CONFIG.MODO_COMANDAS, CONFIG.MODO_FISCAL, CONFIG.MODULO_FIADO, CONFIG.CONFIRMAR_PAGOS]);
const sembrar = () => ({ ...postSemilla(generarSemilla()), firma: firma() });
let estado = null;
const oyentes = new Set();

function leer() {
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : null;
}

// postSemilla(s): completa los datos de ejemplo con lógica de services (evita import circular)
let postSemilla = (s) => s;

export function iniciarDB(post) {
  if (post) postSemilla = post;
  estado = leer();
  if (!estado || estado.firma !== firma()) {
    estado = sembrar();
    localStorage.setItem(KEY, JSON.stringify(estado));
  }
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    if (!e.newValue) {
      // otra pestaña restableció los datos
      location.reload();
      return;
    }
    estado = JSON.parse(e.newValue);
    oyentes.forEach((fn) => fn('remoto'));
  });
}

export const db = () => estado;

export function suscribir(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

// Transacción: fn(estado) muta el estado; si lanza error no se guarda nada.
export function tx(fn) {
  const fresco = leer() || estado;
  const copia = structuredClone(fresco);
  const r = fn(copia);
  copia.actualizado = new Date().toISOString();
  localStorage.setItem(KEY, JSON.stringify(copia));
  estado = copia;
  oyentes.forEach((f) => f('local'));
  return r;
}

export function sigId(s, nombre) {
  s.seq[nombre] = (s.seq[nombre] || 0) + 1;
  return s.seq[nombre];
}

export function restablecer() {
  localStorage.removeItem(KEY);
  estado = sembrar();
  localStorage.setItem(KEY, JSON.stringify(estado));
}
