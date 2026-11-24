// Tasa BCV: automática (si hay internet) + manual (siempre disponible).
// Cada entrada queda en el historial con su origen; cada venta guarda la tasa usada.
import { CONFIG } from './config.js';
import { tx, sigId, db } from './db.js';
import { tasaVigente } from './services.js';
import { hoy, diasHabiles, fmtTasa, fmtYmd } from './util.js';

// Proveedores verificados con CORS abierto (se pueden llamar desde el navegador).
// En la versión con servidor, este mismo código corre en el backend y se puede
// agregar lectura directa de bcv.org.ve.
const PROVEEDORES = {
  dolarapi: {
    nombre: 'DolarApi · BCV oficial',
    url: 'https://ve.dolarapi.com/v1/dolares/oficial',
    leer: (j) => ({ valor: Number(j.promedio), fechaValor: String(j.fechaActualizacion).slice(0, 10) }),
  },
  allratestoday: {
    nombre: 'AllRatesToday · BCV',
    url: 'https://allratestoday.com/api/open/central-bank/bcv',
    leer: (j) => {
      const r = j.rates.find((x) => x.base === 'USD' && x.type === 'sell') || j.rates.find((x) => x.base === 'USD');
      return { valor: Number(r.value), fechaValor: j.rate_date };
    },
  },
};

async function consultarProveedor(id) {
  const p = PROVEEDORES[id];
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), CONFIG.TASA.timeoutMs);
  try {
    const res = await fetch(p.url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const r = p.leer(await res.json());
    if (!(r.valor > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(r.fechaValor)) throw new Error('Respuesta inválida');
    return { ...r, fuente: p.nombre };
  } finally {
    clearTimeout(t);
  }
}

export const sinInternet = () => db().simularSinInternet || !navigator.onLine;

// forzar = true cuando el usuario pulsa "Consultar BCV ahora": vuelve a la tasa BCV aunque haya una manual.
export async function consultarBCV({ forzar = false } = {}) {
  if (sinInternet()) {
    tx((s) => { s.tasaEstado = { ...s.tasaEstado, ultimoIntento: new Date().toISOString(), ok: false, error: 'Sin conexión a internet' }; });
    return { ok: false, error: 'Sin conexión a internet' };
  }
  const errores = [];
  for (const id of CONFIG.TASA.proveedores) {
    try {
      const r = await consultarProveedor(id);
      let agregada = false;
      tx((s) => {
        const autos = s.tasas.filter((t) => t.origen === 'BCV');
        const ultAuto = autos[autos.length - 1];
        const vig = s.tasas[s.tasas.length - 1];
        const nueva = !ultAuto || r.fechaValor > ultAuto.fechaValor || Math.abs(r.valor - ultAuto.valor) > 1e-6;
        const volverABcv = forzar && (!vig || vig.origen !== 'BCV' || Math.abs(vig.valor - r.valor) > 1e-6);
        if (nueva || volverABcv) {
          s.tasas.push({ id: sigId(s, 'tasa'), valor: r.valor, fechaValor: r.fechaValor, origen: 'BCV', fuente: r.fuente,
            registradoPor: 'Automático', registradoEn: new Date().toISOString() });
          agregada = true;
        }
        s.tasaEstado = { ultimoIntento: new Date().toISOString(), ultimoExito: new Date().toISOString(), ok: true, error: null, fuente: r.fuente };
      });
      return { ok: true, ...r, agregada };
    } catch (e) {
      errores.push(`${PROVEEDORES[id].nombre}: ${e.name === 'AbortError' ? 'tiempo agotado' : e.message}`);
    }
  }
  const error = errores.join(' · ');
  tx((s) => { s.tasaEstado = { ...s.tasaEstado, ultimoIntento: new Date().toISOString(), ok: false, error }; });
  return { ok: false, error };
}

export function registrarTasaManual(valor, usuario, nota = '') {
  if (!(valor > 0)) throw new Error('Ingrese una tasa válida');
  const vig = tasaVigente();
  if (vig && (valor > vig.valor * 1.5 || valor < vig.valor * 0.5))
    throw new Error(`La tasa ${fmtTasa(valor)} es muy diferente a la actual (${fmtTasa(vig.valor)}). Revise el valor.`);
  return tx((s) => {
    const t = { id: sigId(s, 'tasa'), valor, fechaValor: hoy(), origen: 'MANUAL', fuente: nota || 'Carga manual',
      registradoPor: usuario.nombre, registradoEn: new Date().toISOString() };
    s.tasas.push(t);
    return t;
  });
}

// Nivel de frescura de la tasa vigente
export function estadoTasa(t = tasaVigente()) {
  if (!t) return { nivel: 'alerta', texto: 'Sin tasa registrada' };
  const d = diasHabiles(t.fechaValor, hoy());
  const origen = t.origen === 'BCV' ? 'BCV automática' : `Manual · ${t.registradoPor}`;
  let nivel = 'ok';
  if (d >= CONFIG.TASA.diasHabilesAlerta) nivel = 'alerta';
  else if (d >= CONFIG.TASA.diasHabilesAviso) nivel = 'aviso';
  const antig = d === 0 ? 'al día' : `${d} día${d > 1 ? 's' : ''} hábil${d > 1 ? 'es' : ''} de antigüedad`;
  return { nivel, dias: d, texto: `${origen} · fecha valor ${fmtYmd(t.fechaValor)} · ${antig}` };
}

let timer = null;
export function iniciarTasaAutomatica() {
  consultarBCV();
  clearInterval(timer);
  timer = setInterval(() => consultarBCV(), CONFIG.TASA.intervaloMinutos * 60000);
  window.addEventListener('online', () => consultarBCV());
}

export function simularSinInternet(valor) {
  tx((s) => { s.simularSinInternet = valor; });
}
