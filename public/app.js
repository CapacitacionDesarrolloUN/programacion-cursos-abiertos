// Interfaz de la app. Sin frameworks ni compilación: lo que está aquí es lo que se publica.

const $app = document.getElementById('app');
const $barra = document.getElementById('barra');
const $pestanas = document.getElementById('pestanas');
const $quien = document.getElementById('quien');
const $aviso = document.getElementById('aviso');

const estado = {
  yo: null,
  vista: null,
  cursos: [],
  verListas: false,
  avisos: 0,
  busqueda: '',
  generando: new Set(),
};

const PREFERENCIAS = 'cursos-abiertos:preferencias';
const SIN_MOVIMIENTO = matchMedia('(prefers-reduced-motion: reduce)');

function leerPreferencias() {
  try {
    return JSON.parse(localStorage.getItem(PREFERENCIAS)) || {};
  } catch {
    return {};
  }
}

function guardarPreferencia(clave, valor) {
  try {
    localStorage.setItem(PREFERENCIAS, JSON.stringify({ ...leerPreferencias(), [clave]: valor }));
  } catch {
    // Sin almacenamiento local, la preferencia simplemente no se recuerda.
  }
}

// ---------- Íconos (trazos simples, heredan el color del texto) ----------

const TRAZOS = {
  copiar: '<rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  calendario: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  reloj: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  enlace: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
  video: '<rect x="3" y="6.5" width="12.5" height="11" rx="2.5"/><path d="M15.5 10.5l5-3v9l-5-3"/>',
  editar: '<path d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  borrar: '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  descargar: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  chispa: '<path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z"/><path d="M19 3v4M17 5h4"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  salir: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
  volver: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  tabla: '<rect x="3.5" y="4" width="17" height="16" rx="3"/><path d="M3.5 10h17M10 10v10"/>',
  campana: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
};

function icono(nombre, clase = '') {
  return `<svg class="ico ${clase}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TRAZOS[nombre]}</svg>`;
}

// ---------- Utilidades ----------

async function api(ruta, opciones = {}) {
  const res = await fetch(`/api/${ruta}`, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...(opciones.headers || {}) },
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  const datos = await res.json().catch(() => ({}));
  if (res.status === 401 && datos.sin_sesion && estado.yo) {
    location.reload();
  }
  if (!res.ok) {
    const error = new Error(datos.error || `Error ${res.status}`);
    Object.assign(error, datos, { estado: res.status });
    throw error;
  }
  return datos;
}

function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

function fechaLarga(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  const texto = new Date(a, m - 1, d).toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function fechaCorta(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
}

function partesFecha(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  const fecha = new Date(a, m - 1, d);
  return {
    dia: d,
    mes: fecha.toLocaleDateString('es-CO', { month: 'short' }).replace('.', ''),
    semana: fecha.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', ''),
  };
}

// Convierte "aaaa-mm-dd hh:mm:ss" (UTC, como lo guarda la base) a fecha y hora local.
function fechaHora(utc) {
  const d = new Date(`${utc.replace(' ', 'T')}Z`);
  return d.toLocaleString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function hoyEnLetras() {
  const texto = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

let temporizadorAviso;
function avisar(mensaje, tipo = 'ok') {
  $aviso.innerHTML = `${icono(tipo === 'error' ? 'campana' : 'check')}<span>${esc(mensaje)}</span>`;
  $aviso.className = `aviso visible ${tipo}`;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { $aviso.className = `aviso ${tipo}`; }, tipo === 'error' ? 6000 : 2600);
}

async function copiar(texto, etiqueta, boton) {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    const area = document.createElement('textarea');
    area.value = texto;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  if (boton) {
    boton.classList.add('copiado');
    setTimeout(() => boton.classList.remove('copiado'), 1400);
  }
  avisar(`${etiqueta} copiado`);
}

function urlImagen(curso, descargar = false) {
  const v = encodeURIComponent(curso.imagen_en || '');
  return `/api/cursos/${curso.id}/imagen?v=${v}${descargar ? '&descargar=1' : ''}`;
}

// Pasa la imagen de la IA a JPEG de buena calidad para que quepa en la base de datos (máx. ~1,3 MB).
async function comprimirImagen(base64, tipo) {
  const img = new Image();
  img.src = `data:${tipo};base64,${base64}`;
  await img.decode();
  const escala = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(img.naturalWidth * escala);
  lienzo.height = Math.round(img.naturalHeight * escala);
  lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
  for (const calidad of [0.92, 0.85, 0.75, 0.6]) {
    const datos = lienzo.toDataURL('image/jpeg', calidad).split(',')[1];
    if (datos.length < 1_700_000) return { base64: datos, tipo: 'image/jpeg' };
  }
  throw new Error('No se pudo comprimir la imagen. Intenta de nuevo.');
}

// Convierte fechas de Excel (dd/mm/aaaa, aaaa-mm-dd o número de serie) a aaaa-mm-dd.
function normalizarFecha(valor) {
  const t = String(valor || '').trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(t)) {
    const [a, m, d] = t.split('-');
    return `${a}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const dmy = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (dmy) {
    const a = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${a}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  if (/^\d{5}$/.test(t)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Number(t) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return t;
}

// ---------- Horas escritas a mano: "200", "2:00", "2.30", "1430", "2pm" (igual que la agenda) ----------
// Se guardan como "HH:MM" (24 h). AM/PM se elige solo: 7:00–11:59 AM; 12:00–6:59 PM; se puede cambiar a mano.

const dos = (n) => String(n).padStart(2, '0');
const fmtH = (v) => {
  if (!v) return '';
  const [h, m] = v.split(':').map(Number);
  return `${h % 12 || 12}:${dos(m)} ${h < 12 ? 'a.m.' : 'p.m.'}`;
};
const horario = (c) => (c.hora_inicio ? `${fmtH(c.hora_inicio)} – ${fmtH(c.hora_fin)}` : '');

function parseHora(txt) {
  const raw = String(txt || '').toLowerCase().trim();
  if (!raw) return null;
  const suf = /p\.?\s*m|\bp\b/.test(raw) ? 'pm' : /a\.?\s*m|\ba\b/.test(raw) ? 'am' : '';
  const t = raw.replace(/[^0-9:.,]/g, '').replace(/[.,]$/, '');
  let h;
  let m;
  if (/[:.,]/.test(t)) {
    const [a, b = ''] = t.split(/[:.,]/);
    if (a === '') return null;
    h = Number(a);
    m = b === '' ? 0 : Number(b.padEnd(2, '0').slice(0, 2));
  } else if (t.length && t.length <= 2) { h = Number(t); m = 0; } else if (t.length === 3) { h = Number(t[0]); m = Number(t.slice(1)); } else if (t.length === 4) { h = Number(t.slice(0, 2)); m = Number(t.slice(2)); } else return null;
  if (!(h >= 0 && h <= 23 && m >= 0 && m <= 59)) return null;
  return { h, m, suf };
}
const autoAmpm = (h) => ((h >= 12 || (h >= 1 && h <= 6)) ? 'pm' : 'am');
const a24 = (p, ampm) => (p.h > 12 || p.h === 0 ? `${dos(p.h)}:${dos(p.m)}` : `${dos((p.h % 12) + (ampm === 'pm' ? 12 : 0))}:${dos(p.m)}`);

// Hora pegada desde Excel: texto ("2:00 p. m.", "14:00") o fracción del día (0,583333).
function horaDeExcel(valor) {
  const t = String(valor || '').trim();
  if (!t) return '';
  if (/^0?[.,]\d+$/.test(t)) {
    const minutos = Math.round(Number(t.replace(',', '.')) * 1440);
    return `${dos(Math.floor(minutos / 60) % 24)}:${dos(minutos % 60)}`;
  }
  const p = parseHora(t);
  if (!p) return null;
  return a24(p, p.suf || autoAmpm(p.h));
}

// Conecta un campo de hora con sus botones AM/PM.
function prepararHora(input) {
  const grupo = input.nextElementSibling;
  let manual = Boolean(input.value);
  const fijar = (v) => grupo.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
  input.leer = () => {
    const p = parseHora(input.value);
    return p ? a24(p, grupo.querySelector('[aria-pressed="true"]').dataset.v) : null;
  };
  input.addEventListener('input', () => {
    input.classList.remove('falta');
    const p = parseHora(input.value);
    if (!p) return;
    if (p.suf) { fijar(p.suf); manual = true; } else if (p.h > 12) fijar('pm');
    else if (!manual) fijar(autoAmpm(p.h));
  });
  input.addEventListener('blur', () => {
    const v = input.value.trim();
    if (!v) return;
    const p = parseHora(v);
    if (!p) { input.classList.add('falta'); return; }
    if (p.h > 12) fijar('pm'); else if (p.h === 0) fijar('am');
    input.value = `${p.h > 12 ? p.h - 12 : (p.h || 12)}:${dos(p.m)}`;
  });
  grupo.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-v]');
    if (!b) return;
    fijar(b.dataset.v);
    manual = true;
  });
}

function campoHora(nombre, etiqueta, valor, ejemplo) {
  const [h, m] = valor ? valor.split(':').map(Number) : [];
  const pm = valor ? h >= 12 : false;
  return `
    <label>${etiqueta}
      <span class="hora">
        <input name="${nombre}" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="Ej.: ${ejemplo}"
          value="${valor ? `${h % 12 || 12}:${dos(m)}` : ''}">
        <span class="ampm" role="group" aria-label="AM o PM">
          <button type="button" data-v="am" aria-pressed="${!pm}">AM</button>
          <button type="button" data-v="pm" aria-pressed="${pm}">PM</button>
        </span>
      </span>
    </label>`;
}

// ---------- Animaciones pequeñas ----------

// Cifras que suben de 0 a su valor.
function animarCifras(raiz = $app) {
  for (const el of raiz.querySelectorAll('[data-cifra]')) {
    const final = Number(el.dataset.cifra);
    if (SIN_MOVIMIENTO.matches || !final) { el.textContent = final; continue; }
    const inicio = performance.now();
    const paso = (ahora) => {
      const t = Math.min(1, (ahora - inicio) / 700);
      el.textContent = Math.round(final * (1 - (1 - t) ** 3));
      if (t < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }
}

// Chispas de colores Uninorte al terminar una tarea.
function celebrar(origen) {
  if (SIN_MOVIMIENTO.matches) return;
  const caja = origen.getBoundingClientRect();
  const capa = document.createElement('div');
  capa.className = 'chispas';
  capa.style.left = `${caja.left + caja.width / 2}px`;
  capa.style.top = `${caja.top + caja.height / 2}px`;
  const colores = ['var(--rojo)', 'var(--roble)', 'var(--ok)', 'var(--rojo)', 'var(--roble)'];
  for (let i = 0; i < 18; i += 1) {
    const s = document.createElement('i');
    const angulo = (Math.PI * 2 * i) / 18 + Math.random() * 0.4;
    const distancia = 50 + Math.random() * 70;
    s.style.setProperty('--x', `${Math.cos(angulo) * distancia}px`);
    s.style.setProperty('--y', `${Math.sin(angulo) * distancia - 30}px`);
    s.style.setProperty('--g', `${Math.random() * 360}deg`);
    s.style.background = colores[i % colores.length];
    capa.appendChild(s);
  }
  document.body.appendChild(capa);
  setTimeout(() => capa.remove(), 1100);
}

// Las imágenes aparecen con un leve enfoque cuando terminan de cargar.
$app.addEventListener('load', (ev) => {
  if (ev.target.tagName === 'IMG') ev.target.classList.add('cargada');
}, true);

// Frases mientras la IA trabaja.
const FRASES = ['Leyendo el título…', 'Imaginando la escena…', 'Buscando la mejor luz…', 'Revelando la foto…', 'Últimos detalles…'];
setInterval(() => {
  for (const el of document.querySelectorAll('[data-frase]')) {
    const i = (Number(el.dataset.frase) + 1) % FRASES.length;
    el.dataset.frase = i;
    el.textContent = FRASES[i];
  }
}, 2600);

// ---------- Saludo ----------

function saludos(nombre) {
  const h = new Date().getHours();
  const momento = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  return [`${momento}, ${nombre}`, `Hola, ${nombre}`, `¿Qué tal, ${nombre}?`];
}

function saludoHtml() {
  return `<span class="saludo" data-saludo="0">${esc(saludos(estado.yo.nombre)[0])}</span>`;
}

// Cada pocos segundos el saludo cambia por otro, con una transición suave.
setInterval(async () => {
  const el = document.querySelector('[data-saludo]');
  if (!el || !estado.yo || document.hidden) return;
  const lista = saludos(estado.yo.nombre);
  const i = (Number(el.dataset.saludo) + 1) % lista.length;
  el.classList.add('saliendo');
  await esperar(SIN_MOVIMIENTO.matches ? 0 : 320);
  el.dataset.saludo = i;
  el.textContent = lista[i];
  el.classList.remove('saliendo');
}, 7000);

// ---------- Arranque ----------

async function iniciar() {
  try {
    estado.yo = await api('yo');
  } catch (e) {
    if (e.sin_sesion) return pantallaIngreso();
    $app.innerHTML = `
      <section class="vacio">
        <h1>No se pudo abrir la app</h1>
        <p>${esc(e.message)}</p>
      </section>`;
    return;
  }

  document.body.classList.remove('sin-sesion');
  $barra.hidden = false;
  const esAdmin = estado.yo.rol === 'admin';
  $quien.innerHTML = `
    <span class="avatar" aria-hidden="true">${esc(estado.yo.nombre.charAt(0).toUpperCase())}</span>
    <span class="quien-texto"><strong>${esc(estado.yo.nombre)}</strong><small>${esAdmin ? 'Administrador' : 'Diseño'}</small></span>
    <button type="button" class="salir" id="salir" title="Salir">${icono('salir')}<span>Salir</span></button>`;
  document.getElementById('salir').addEventListener('click', async () => {
    await api('salir', { method: 'POST' }).catch(() => {});
    location.reload();
  });

  const vistas = esAdmin
    ? [['programar', 'Programar tareas', 'Tareas'], ['cursos', `Vista de ${estado.yo.otro}`], ['ajustes', 'Ajustes']]
    : [['cursos', 'Mis tareas']];
  $pestanas.innerHTML = `${vistas
    .map(([id, nombre, corto]) => `<button type="button" data-vista="${id}">${corto
      ? `<span class="largo">${esc(nombre)}</span><span class="corto">${esc(corto)}</span>` : esc(nombre)}</button>`)
    .join('')}<span class="indicador" aria-hidden="true"></span>`;
  $pestanas.addEventListener('click', (ev) => {
    const boton = ev.target.closest('[data-vista]');
    if (boton) irA(boton.dataset.vista);
  });
  addEventListener('resize', moverIndicador);
  const guardada = leerPreferencias().vista;
  irA(vistas.some(([id]) => id === guardada) ? guardada : vistas[0][0]);
  if (esAdmin) {
    revisarAvisos();
    setInterval(revisarAvisos, 60000);
  }
}

function moverIndicador() {
  const activa = $pestanas.querySelector('button.activa');
  const indicador = $pestanas.querySelector('.indicador');
  if (!activa || !indicador) return;
  indicador.style.width = `${activa.offsetWidth}px`;
  indicador.style.transform = `translateX(${activa.offsetLeft}px)`;
}

// Revisa si el diseñador terminó tareas que el administrador no ha visto.
async function revisarAvisos() {
  let cursos;
  try {
    cursos = await api('cursos?estado=lista');
  } catch {
    return;
  }
  const nuevas = cursos.filter((c) => c.aviso_nuevo);
  if (nuevas.length > estado.avisos) {
    const ultima = nuevas[nuevas.length - 1];
    avisar(nuevas.length === 1 ? `${estado.yo.otro} terminó «${ultima.nombre}»` : `${estado.yo.otro} terminó ${nuevas.length} tareas`);
    if (estado.vista === 'programar' && !document.querySelector('dialog[open]')) vistaProgramar();
  }
  estado.avisos = nuevas.length;
  const pestana = $pestanas.querySelector('[data-vista="programar"]');
  if (pestana) {
    pestana.querySelector('.contador')?.remove();
    if (nuevas.length) pestana.insertAdjacentHTML('beforeend', ` <span class="contador" title="Tareas terminadas sin revisar">${nuevas.length}</span>`);
    moverIndicador();
  }
  document.title = nuevas.length ? `(${nuevas.length}) Cursos abiertos · Uninorte` : 'Cursos abiertos · Uninorte';
}

function pantallaIngreso() {
  document.body.classList.add('sin-sesion');
  $app.innerHTML = `
    <section class="ingreso">
      <div class="ingreso-marca">
        <span class="logo" role="img" aria-label="Universidad del Norte"></span>
        <div class="ingreso-titulo">
          <p class="antetitulo">Gestión Humana · Capacitación y Desarrollo</p>
          <h1>Cursos<br>abiertos</h1>
          <p>Las actividades del boletín, con su imagen, en un solo lugar.</p>
        </div>
        <span class="aro aro-1" aria-hidden="true"></span>
        <span class="aro aro-2" aria-hidden="true"></span>
      </div>
      <div class="ingreso-form">
        <form id="form-ingreso">
          <h2>Escribe tu código</h2>
          <p class="sutil">Es el mismo que te entregaron para esta app.</p>
          <input name="clave" type="password" autocomplete="current-password" required autofocus
            aria-label="Código de acceso" placeholder="••••••••">
          <p id="error-ingreso" class="error-ingreso" role="alert"></p>
          <button type="submit" class="primario grande">Entrar</button>
        </form>
      </div>
    </section>`;
  const form = document.getElementById('form-ingreso');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const boton = form.querySelector('button');
    boton.disabled = true;
    boton.textContent = 'Entrando…';
    try {
      await api('ingresar', { method: 'POST', body: { clave: form.clave.value } });
      form.classList.add('bienvenida');
      await esperar(SIN_MOVIMIENTO.matches ? 0 : 350);
      location.reload();
    } catch (e) {
      document.getElementById('error-ingreso').textContent = e.message;
      form.classList.remove('sacudir');
      void form.offsetWidth;
      form.classList.add('sacudir');
      form.clave.select();
      boton.disabled = false;
      boton.textContent = 'Entrar';
    }
  });
}

// Marca la vista para que sus elementos entren con animación durante un momento.
let temporizadorEntrada;
function animarEntrada() {
  $app.classList.add('animar');
  clearTimeout(temporizadorEntrada);
  temporizadorEntrada = setTimeout(() => $app.classList.remove('animar'), 1500);
}

function irA(vista) {
  animarEntrada();
  estado.vista = vista;
  guardarPreferencia('vista', vista);
  for (const b of $pestanas.querySelectorAll('button')) b.classList.toggle('activa', b.dataset.vista === vista);
  moverIndicador();
  ({ programar: vistaProgramar, cursos: vistaCursos, ajustes: vistaAjustes })[vista]();
}

async function cargarCursos() {
  const ruta = estado.vista === 'cursos' ? `cursos?estado=${estado.verListas ? 'lista' : 'pendiente'}` : 'cursos';
  estado.cursos = await api(ruta);
}

async function refrescarCupo() {
  try {
    estado.yo.imagenes = (await api('yo')).imagenes;
  } catch {
    // Si falla, se queda el último dato conocido.
  }
}

function diasHasta(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((new Date(a, m - 1, d) - hoy) / 86400000);
}

function textoPlazo(dias) {
  return dias < 0 ? `Atrasada ${plural(-dias, 'día', 'días')}`
    : dias === 0 ? 'Se publica hoy'
      : dias === 1 ? 'Se publica mañana'
        : `Se publica en ${dias} días`;
}

// Etiqueta de cuándo hay que publicar en el boletín.
function plazoBoletin(c) {
  if (!c.fecha_boletin) return '';
  const dias = diasHasta(c.fecha_boletin);
  if (c.estado === 'lista') return `<span class="plazo">Boletín · ${esc(fechaCorta(c.fecha_boletin))}</span>`;
  const tipo = dias < 0 ? 'atrasada' : dias <= 2 ? 'pronto' : '';
  return `<span class="plazo ${tipo}"><i></i>${textoPlazo(dias)} · ${esc(fechaCorta(c.fecha_boletin))}</span>`;
}

function cargando(texto) {
  $app.innerHTML = `<div class="cargando"><span class="punto"></span><span class="punto"></span><span class="punto"></span><span class="visualmente-oculto">${texto}</span></div>`;
}

// ---------- Vista diseñador: tareas ----------

async function vistaCursos() {
  if (!$app.querySelector('.tarjetas')) cargando('Cargando tareas…');
  try {
    await cargarCursos();
  } catch (e) {
    $app.innerHTML = `<section class="vacio"><p>${esc(e.message)}</p></section>`;
    return;
  }
  pintarCursos();
}

function cupoHtml() {
  const cupo = estado.yo.imagenes;
  if (!cupo?.gratis) return '';
  const pct = Math.round((cupo.quedan / cupo.limite) * 100);
  return `
    <div class="dato cupo ${cupo.quedan <= 10 ? 'bajo' : ''}">
      <span class="cifra" data-cifra="${cupo.quedan}">${cupo.quedan}</span>
      <span class="dato-texto">imágenes quedan hoy</span>
      <span class="medidor" style="--pct:${pct}%"><span></span></span>
      <span class="dato-nota">Se renueva a las 7:00 p. m.</span>
    </div>`;
}

function resumenDisenador(pendientes) {
  if (estado.verListas) return 'Estas son las tareas que ya terminaste. Puedes descargar de nuevo cualquier imagen.';
  if (!pendientes.length) return `Todo al día: no tienes tareas pendientes. Cuando ${esc(estado.yo.otro)} programe una, aparecerá aquí.`;
  const proximas = pendientes.filter((c) => c.fecha_boletin).sort((a, b) => a.fecha_boletin.localeCompare(b.fecha_boletin));
  let texto = `Tienes ${plural(pendientes.length, 'tarea pendiente', 'tareas pendientes')}.`;
  if (proximas.length) {
    const dias = diasHasta(proximas[0].fecha_boletin);
    texto += dias < 0 ? ` «${esc(proximas[0].nombre)}» ya debió salir en el boletín.`
      : ` La más próxima, «${esc(proximas[0].nombre)}», ${textoPlazo(dias).toLowerCase()}.`;
  }
  return texto;
}

function pintarCursos() {
  const formato = leerPreferencias().formato || '1:1';
  const filtro = estado.busqueda.trim().toLowerCase();
  const cursos = estado.cursos.filter((c) => !filtro || c.nombre.toLowerCase().includes(filtro));
  const esAdmin = estado.yo.rol === 'admin';
  const vacio = filtro ? 'Ninguna tarea coincide con la búsqueda.'
    : estado.verListas ? 'Todavía no hay tareas realizadas.' : 'No hay nada pendiente. Buen trabajo.';

  $app.innerHTML = `
    <section class="hero">
      <div class="hero-texto">
        <p class="antetitulo">${esc(hoyEnLetras())}</p>
        <h1>${esAdmin ? `Así ve ${esc(estado.yo.otro)} sus tareas` : saludoHtml()}</h1>
        <p class="hero-resumen">${esAdmin ? 'Desde aquí también puedes generar imágenes o marcar tareas como listas.' : resumenDisenador(estado.cursos)}</p>
      </div>
      <div class="hero-datos">
        ${estado.verListas ? '' : `<div class="dato"><span class="cifra" data-cifra="${estado.cursos.length}">${estado.cursos.length}</span><span class="dato-texto">${estado.cursos.length === 1 ? 'pendiente' : 'pendientes'}</span></div>`}
        ${cupoHtml()}
      </div>
    </section>

    <section class="herramientas">
      <div class="segmento" role="group" aria-label="Qué tareas ver">
        <button type="button" data-ver="pendientes" class="${estado.verListas ? '' : 'activa'}">Pendientes</button>
        <button type="button" data-ver="listas" class="${estado.verListas ? 'activa' : ''}">Realizadas</button>
      </div>
      <input type="search" id="buscar" placeholder="Buscar actividad" value="${esc(estado.busqueda)}" aria-label="Buscar actividad">
    </section>

    ${cursos.length === 0 ? `<section class="vacio">${icono('chispa', 'grande')}<p>${vacio}</p></section>` : ''}
    <section class="tarjetas">
      ${cursos.map((c, i) => tarjetaCurso(c, formato, i)).join('')}
    </section>`;

  animarCifras();
  const $buscar = document.getElementById('buscar');
  $buscar.addEventListener('input', () => {
    estado.busqueda = $buscar.value;
    const pos = $buscar.selectionStart;
    pintarCursos();
    const nuevo = document.getElementById('buscar');
    nuevo.focus();
    nuevo.setSelectionRange(pos, pos);
  });
  for (const boton of $app.querySelectorAll('[data-ver]')) {
    boton.addEventListener('click', () => {
      estado.verListas = boton.dataset.ver === 'listas';
      animarEntrada();
      vistaCursos();
    });
  }
}

function campoCopiable(etiqueta, valorHtml, campo, hayValor = true, ico = '') {
  return `
    <div class="campo">
      <span class="etiqueta">${ico ? icono(ico) : ''}${etiqueta}</span>
      <p class="valor ${campo.startsWith('link') ? 'link' : ''}">${hayValor ? valorHtml : '<span class="sutil">Sin dato</span>'}</p>
      ${hayValor ? `<button type="button" class="copiar" data-copiar="${campo}" title="Copiar ${etiqueta.toLowerCase()}" aria-label="Copiar ${etiqueta.toLowerCase()}">${icono('copiar', 'i-copiar')}${icono('check', 'i-check')}</button>` : ''}
    </div>`;
}

function enlace(url) {
  return `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(url.replace(/^https?:\/\//, ''))}</a>`;
}

function tarjetaCurso(c, formato, i) {
  const generando = estado.generando.has(c.id);
  const opciones = ['1:1', '4:5', '3:4', '16:9', '9:16']
    .map((f) => `<label class="chip-opcion"><input type="radio" name="formato-${c.id}" value="${f}" ${f === formato ? 'checked' : ''}><span>${f}</span></label>`).join('');
  return `
    <article class="tarjeta ${c.estado === 'lista' ? 'hecha' : ''}" data-id="${c.id}" style="--i:${Math.min(i, 8)}">
      <div class="imagen ${generando ? 'generando' : ''}">
        ${c.tiene_imagen
    ? `<img src="${urlImagen(c)}" alt="Imagen generada para ${esc(c.nombre)}" loading="lazy">`
    : `<div class="sin-imagen"><span class="inicial" aria-hidden="true">${esc(c.nombre.charAt(0))}</span><span>Aún sin imagen</span></div>`}
        ${generando ? `<div class="velo"><span class="brillo"></span>${icono('chispa', 'girando')}<span data-frase="0">${FRASES[0]}</span></div>` : ''}
        ${c.tiene_imagen && !generando ? `<a class="descargar-flotante" href="${urlImagen(c, true)}" download title="Descargar imagen">${icono('descargar')}<span>Descargar</span></a>` : ''}
      </div>
      <div class="cuerpo">
        ${plazoBoletin(c)}
        <div class="titulo-tarjeta">
          <h2>${esc(c.nombre)}</h2>
          <button type="button" class="copiar" data-copiar="nombre" title="Copiar nombre" aria-label="Copiar nombre">${icono('copiar', 'i-copiar')}${icono('check', 'i-check')}</button>
        </div>
        ${campoCopiable('Fecha', esc(fechaLarga(c.fecha)), 'fecha', true, 'calendario')}
        ${campoCopiable('Horario', esc(horario(c)), 'horario', Boolean(c.hora_inicio), 'reloj')}
        ${campoCopiable('Link del curso', c.link ? enlace(c.link) : '', 'link', Boolean(c.link), 'enlace')}
        ${campoCopiable('Link de Zoom', c.link_zoom ? enlace(c.link_zoom) : '', 'link_zoom', Boolean(c.link_zoom), 'video')}

        <button type="button" class="secundario copiar-todo" data-accion="copiar-todo">${icono('copiar')} Copiar toda la información</button>

        <details class="generar" ${c.tiene_imagen || c.estado === 'lista' ? '' : 'open'}>
          <summary>${icono('chispa')} ${c.tiene_imagen ? 'Generar otra imagen' : 'Generar imagen'}</summary>
          <div class="generar-campos">
            <span class="etiqueta">Formato</span>
            <div class="chips" role="radiogroup" aria-label="Formato">${opciones}</div>
            <label>Indicación opcional
              <input type="text" data-ajuste maxlength="300" placeholder="Ej.: personas en una oficina, colores cálidos">
            </label>
          </div>
          <button type="button" class="primario" data-accion="generar" ${generando ? 'disabled' : ''}>
            ${icono('chispa')} ${generando ? 'Generando…' : c.tiene_imagen ? 'Generar de nuevo' : 'Generar imagen'}
          </button>
        </details>

        ${c.estado === 'lista'
    ? `<button type="button" class="enlace" data-accion="reabrir">${icono('volver')} Volver a pendientes</button>`
    : `<button type="button" class="listo" data-accion="lista">${icono('check')} Marcar como lista</button>`}
      </div>
    </article>`;
}

function textoCompleto(c) {
  return [
    c.nombre,
    fechaLarga(c.fecha),
    horario(c),
    c.link && `Curso: ${c.link}`,
    c.link_zoom && `Zoom: ${c.link_zoom}`,
  ].filter(Boolean).join('\n');
}

$app.addEventListener('click', async (ev) => {
  const tarjeta = ev.target.closest('.tarjeta');
  if (!tarjeta) return;
  const curso = estado.cursos.find((c) => c.id === Number(tarjeta.dataset.id));
  if (!curso) return;

  const botonCopiar = ev.target.closest('[data-copiar]');
  if (botonCopiar) {
    const campo = botonCopiar.dataset.copiar;
    const valor = campo === 'fecha' ? fechaLarga(curso.fecha) : campo === 'horario' ? horario(curso) : curso[campo];
    const etiquetas = { nombre: 'Nombre', fecha: 'Fecha', horario: 'Horario', link: 'Link del curso', link_zoom: 'Link de Zoom' };
    copiar(valor, etiquetas[campo], botonCopiar);
    return;
  }

  const boton = ev.target.closest('[data-accion]');
  const accion = boton?.dataset.accion;
  if (accion === 'copiar-todo') copiar(textoCompleto(curso), 'Información de la actividad', boton);

  if (accion === 'lista' || accion === 'reabrir') {
    try {
      await api(`cursos/${curso.id}/estado`, { method: 'PUT', body: { estado: accion === 'lista' ? 'lista' : 'pendiente' } });
      if (accion === 'lista') {
        celebrar(boton);
        avisar(`¡Lista! ${estado.yo.rol === 'admin' ? 'Tarea marcada como lista.' : `Le avisamos a ${estado.yo.otro}.`}`);
      } else {
        avisar('Tarea devuelta a pendientes');
      }
      tarjeta.classList.add('saliendo');
      await esperar(SIN_MOVIMIENTO.matches ? 0 : 420);
      vistaCursos();
    } catch (e) {
      avisar(e.message, 'error');
    }
  }

  if (accion === 'generar') {
    const formato = tarjeta.querySelector('.chips input:checked')?.value || '1:1';
    const ajuste = tarjeta.querySelector('[data-ajuste]').value;
    guardarPreferencia('formato', formato);
    estado.generando.add(curso.id);
    pintarCursos();
    try {
      const generada = await api(`cursos/${curso.id}/imagen`, { method: 'POST', body: { formato, ajuste } });
      const comprimida = await comprimirImagen(generada.base64, generada.tipo);
      const actualizado = await api(`cursos/${curso.id}/imagen`, { method: 'PUT', body: comprimida });
      Object.assign(curso, actualizado);
      avisar('Imagen lista');
    } catch (e) {
      avisar(e.message, 'error');
    } finally {
      estado.generando.delete(curso.id);
      await refrescarCupo();
      if (estado.vista === 'cursos') pintarCursos();
    }
  }
});

// ---------- Vista administrador: programar tareas ----------

async function vistaProgramar() {
  if (!$app.querySelector('.lista-tareas')) cargando('Cargando tareas…');
  try {
    await cargarCursos();
  } catch (e) {
    $app.innerHTML = `<section class="vacio"><p>${esc(e.message)}</p></section>`;
    return;
  }
  pintarProgramar();
}

function filaTarea(c, i) {
  const f = partesFecha(c.fecha);
  return `
    <li class="fila-tarea" data-id="${c.id}" style="--i:${Math.min(i, 10)}">
      <div class="dia" aria-label="${esc(fechaLarga(c.fecha))}">
        <span class="dia-semana">${esc(f.semana)}</span>
        <span class="dia-numero">${f.dia}</span>
        <span class="dia-mes">${esc(f.mes)}</span>
      </div>
      <div class="fila-principal">
        <strong>${esc(c.nombre)}</strong>
        <span class="meta">
          ${c.hora_inicio ? `<span>${icono('reloj')}${esc(horario(c))}</span>` : ''}
          ${c.link ? `<a href="${esc(c.link)}" target="_blank" rel="noopener">${icono('enlace')}Curso</a>` : ''}
          ${c.link_zoom ? `<a href="${esc(c.link_zoom)}" target="_blank" rel="noopener">${icono('video')}Zoom</a>` : ''}
        </span>
      </div>
      <div class="fila-estado">
        ${plazoBoletin(c)}
        <span class="pastilla ${c.tiene_imagen ? 'ok' : ''}">${c.tiene_imagen ? 'Con imagen' : 'Sin imagen'}</span>
      </div>
      <div class="fila-acciones">
        <button type="button" class="icono-boton" data-editar title="Editar" aria-label="Editar ${esc(c.nombre)}">${icono('editar')}</button>
        <button type="button" class="icono-boton peligro" data-borrar title="Eliminar" aria-label="Eliminar ${esc(c.nombre)}">${icono('borrar')}</button>
      </div>
    </li>`;
}

function pintarProgramar() {
  const pendientes = estado.cursos.filter((c) => c.estado !== 'lista');
  const realizadas = estado.cursos.filter((c) => c.estado === 'lista')
    .sort((x, y) => String(y.lista_en || '').localeCompare(String(x.lista_en || '')));
  const nuevas = realizadas.filter((c) => c.aviso_nuevo);
  const otro = esc(estado.yo.otro);

  const tarjetasRealizadas = realizadas.map((c, i) => `
    <article class="realizada ${c.aviso_nuevo ? 'nueva' : ''}" data-id="${c.id}" style="--i:${Math.min(i, 10)}">
      <div class="mini">
        ${c.tiene_imagen ? `<img src="${urlImagen(c)}" alt="Imagen de ${esc(c.nombre)}" loading="lazy">` : '<span>Sin imagen</span>'}
        ${c.aviso_nuevo ? '<span class="cinta">Nueva</span>' : ''}
      </div>
      <div class="realizada-cuerpo">
        <strong>${esc(c.nombre)}</strong>
        <span class="sutil pequeno">Terminada ${c.lista_en ? esc(fechaHora(c.lista_en)) : ''}</span>
        <span class="sutil pequeno">Actividad: ${esc(fechaCorta(c.fecha))}${c.fecha_boletin ? ` · Boletín: ${esc(fechaCorta(c.fecha_boletin))}` : ''}</span>
        <div class="realizada-acciones">
          ${c.tiene_imagen ? `<a class="enlace" href="${urlImagen(c, true)}" download>${icono('descargar')}Descargar</a>` : ''}
          <button type="button" class="enlace" data-reabrir>${icono('volver')}Devolver</button>
        </div>
      </div>
    </article>`).join('');

  const resumen = nuevas.length
    ? `${otro} terminó ${plural(nuevas.length, 'tarea nueva', 'tareas nuevas')}. ${nuevas.length === 1 ? 'Revísala' : 'Revísalas'} abajo.`
    : pendientes.length
      ? `${otro} tiene ${plural(pendientes.length, 'tarea pendiente', 'tareas pendientes')}.`
      : `${otro} no tiene tareas pendientes. Programa la próxima cuando quieras.`;

  $app.innerHTML = `
    <section class="hero">
      <div class="hero-texto">
        <p class="antetitulo">${esc(hoyEnLetras())}</p>
        <h1>${saludoHtml()}</h1>
        <p class="hero-resumen">${resumen}</p>
        <div class="hero-acciones">
          <button type="button" class="primario grande" id="nueva-tarea">${icono('mas')} Programar tarea</button>
          <button type="button" class="secundario" id="abrir-importar">${icono('tabla')} Pegar desde Excel</button>
        </div>
      </div>
      <div class="hero-datos">
        <div class="dato"><span class="cifra" data-cifra="${pendientes.length}">${pendientes.length}</span><span class="dato-texto">${pendientes.length === 1 ? 'pendiente' : 'pendientes'}</span></div>
        <div class="dato ok"><span class="cifra" data-cifra="${realizadas.length}">${realizadas.length}</span><span class="dato-texto">${realizadas.length === 1 ? 'realizada' : 'realizadas'}</span></div>
      </div>
    </section>

    ${nuevas.length ? `
    <section class="banner-aviso" role="status">
      <span class="banner-icono">${icono('check')}</span>
      <div>
        <strong>${nuevas.length === 1 ? `${otro} terminó una tarea` : `${otro} terminó ${nuevas.length} tareas`}</strong>
        <span>${nuevas.map((c) => esc(c.nombre)).join(' · ')}</span>
      </div>
      <button type="button" class="secundario" id="entendido">Entendido</button>
    </section>` : ''}

    <section class="bloque">
      <header class="bloque-titulo">
        <h2>Pendientes de ${otro}</h2>
        <span class="pastilla">${pendientes.length}</span>
      </header>
      ${pendientes.length ? `<ul class="lista-tareas">${pendientes.map(filaTarea).join('')}</ul>`
    : `<div class="vacio">${icono('chispa', 'grande')}<p>No hay tareas pendientes. Usa «Programar tarea» para crear una.</p></div>`}
    </section>

    <section class="bloque">
      <header class="bloque-titulo">
        <h2>Tareas realizadas</h2>
        <span class="pastilla ok">${realizadas.length}</span>
      </header>
      ${realizadas.length ? `<div class="realizadas">${tarjetasRealizadas}</div>`
    : `<div class="vacio"><p>Cuando ${otro} marque una tarea como lista, aparecerá aquí con su imagen.</p></div>`}
    </section>

    <dialog id="dialogo-tarea" class="dialogo"></dialog>
    <dialog id="dialogo-importar" class="dialogo"></dialog>`;

  animarCifras();
  document.getElementById('nueva-tarea').addEventListener('click', () => abrirTarea(null));
  document.getElementById('abrir-importar').addEventListener('click', abrirImportar);
  document.getElementById('entendido')?.addEventListener('click', async (ev) => {
    try {
      await api('cursos/avisos', { method: 'POST' });
      estado.avisos = 0;
      ev.target.closest('.banner-aviso').classList.add('saliendo');
      await esperar(SIN_MOVIMIENTO.matches ? 0 : 300);
      await vistaProgramar();
      revisarAvisos();
    } catch (e) {
      avisar(e.message, 'error');
    }
  });

  for (const fila of $app.querySelectorAll('.fila-tarea')) {
    const id = Number(fila.dataset.id);
    const curso = estado.cursos.find((c) => c.id === id);
    fila.querySelector('[data-editar]').addEventListener('click', () => abrirTarea(curso));
    fila.querySelector('[data-borrar]').addEventListener('click', async () => {
      if (!confirm(`¿Eliminar "${curso.nombre}"? También se borra su imagen.`)) return;
      try {
        await api(`cursos/${id}`, { method: 'DELETE' });
        fila.classList.add('saliendo');
        await esperar(SIN_MOVIMIENTO.matches ? 0 : 320);
        avisar('Tarea eliminada');
        vistaProgramar();
      } catch (e) {
        avisar(e.message, 'error');
      }
    });
  }
  for (const tarjeta of $app.querySelectorAll('.realizada')) {
    tarjeta.querySelector('[data-reabrir]').addEventListener('click', async () => {
      try {
        await api(`cursos/${tarjeta.dataset.id}/estado`, { method: 'PUT', body: { estado: 'pendiente' } });
        avisar('Tarea devuelta a pendientes');
        vistaProgramar();
      } catch (e) {
        avisar(e.message, 'error');
      }
    });
  }
}

function cerrarDialogo(dialogo) {
  if (SIN_MOVIMIENTO.matches) return dialogo.close();
  dialogo.classList.add('cerrando');
  setTimeout(() => { dialogo.classList.remove('cerrando'); dialogo.close(); }, 180);
}

function abrirTarea(curso) {
  const dialogo = document.getElementById('dialogo-tarea');
  dialogo.innerHTML = `
    <form method="dialog" id="form-tarea" class="form-dialogo" novalidate>
      <header>
        <div>
          <p class="antetitulo">${curso ? 'Editar' : 'Nueva tarea'}</p>
          <h2>${curso ? esc(curso.nombre) : 'Programar tarea'}</h2>
        </div>
        <button type="button" class="cerrar" data-cerrar aria-label="Cerrar">×</button>
      </header>
      <label>Nombre de la actividad
        <input name="nombre" required maxlength="200" value="${esc(curso?.nombre)}" placeholder="Ej.: Excel intermedio para analistas">
      </label>
      <div class="fila-2">
        <label>Fecha de la actividad
          <input name="fecha" type="date" required value="${esc(curso?.fecha)}">
        </label>
        <label>Publicación en el boletín
          <input name="fecha_boletin" type="date" required value="${esc(curso?.fecha_boletin)}">
        </label>
      </div>
      <div class="fila-2">
        ${campoHora('hora_inicio', 'Hora inicio', curso?.hora_inicio, '200 o 2:00')}
        ${campoHora('hora_fin', 'Hora fin', curso?.hora_fin, '400 o 4:00')}
      </div>
      <label>Link del curso (Brightspace)
        <input name="link" type="url" value="${esc(curso?.link)}" placeholder="https://…">
      </label>
      <label>Link de Zoom
        <span class="con-boton">
          <input name="link_zoom" type="url" value="${esc(curso?.link_zoom)}" placeholder="Pega aquí el link de la reunión">
          <a class="boton zoom" href="${esc(estado.yo.zoom_url)}" target="_blank" rel="noopener">${icono('video')} Generar link de Zoom</a>
        </span>
        <small class="sutil">Zoom se abre en otra pestaña: crea la reunión, copia su link y pégalo aquí.</small>
      </label>
      <p class="error-form" role="alert" hidden></p>
      <div class="botones">
        <button type="submit" class="primario">${curso ? 'Guardar cambios' : 'Programar tarea'}</button>
        <button type="button" class="secundario" data-cerrar>Cancelar</button>
      </div>
    </form>`;
  dialogo.showModal();
  for (const b of dialogo.querySelectorAll('[data-cerrar]')) b.addEventListener('click', () => cerrarDialogo(dialogo));

  const form = dialogo.querySelector('form');
  const $error = form.querySelector('.error-form');
  for (const input of form.querySelectorAll('.hora input')) prepararHora(input);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    for (const el of form.querySelectorAll('.falta')) el.classList.remove('falta');
    const datos = Object.fromEntries(new FormData(form));
    const faltan = [];
    for (const [nombre, texto] of [['nombre', 'el nombre'], ['fecha', 'la fecha'], ['fecha_boletin', 'la fecha del boletín'], ['hora_inicio', 'la hora de inicio'], ['hora_fin', 'la hora de fin']]) {
      if (!String(datos[nombre] || '').trim()) { faltan.push(texto); form[nombre].classList.add('falta'); }
    }
    datos.hora_inicio = form.hora_inicio.leer();
    datos.hora_fin = form.hora_fin.leer();
    let error = faltan.length ? `Falta ${faltan.join(', ').replace(/, ([^,]*)$/, ' y $1')}.` : '';
    if (!error && (!datos.hora_inicio || !datos.hora_fin)) {
      error = 'Escribe la hora así: 200, 2:00 o 2:30.';
      if (!datos.hora_inicio) form.hora_inicio.classList.add('falta');
      if (!datos.hora_fin) form.hora_fin.classList.add('falta');
    }
    if (!error && datos.hora_fin <= datos.hora_inicio) {
      error = 'La hora de fin debe ser después de la de inicio.';
      form.hora_fin.classList.add('falta');
    }
    $error.hidden = !error;
    $error.textContent = error;
    if (error) return;
    try {
      if (curso) {
        await api(`cursos/${curso.id}`, { method: 'PUT', body: datos });
        avisar('Tarea actualizada');
      } else {
        await api('cursos', { method: 'POST', body: datos });
        avisar(`Tarea programada. ${estado.yo.otro} ya la ve en sus pendientes.`);
      }
      cerrarDialogo(dialogo);
      vistaProgramar();
    } catch (e) {
      $error.hidden = false;
      $error.textContent = e.message;
    }
  });
}

function abrirImportar() {
  const dialogo = document.getElementById('dialogo-importar');
  dialogo.innerHTML = `
    <div class="form-dialogo">
      <header>
        <div>
          <p class="antetitulo">Varias a la vez</p>
          <h2>Pegar tareas desde Excel</h2>
        </div>
        <button type="button" class="cerrar" data-cerrar aria-label="Cerrar">×</button>
      </header>
      <p class="sutil">Copia en Excel estas columnas, en este orden, y pégalas aquí: <strong>Actividad</strong>, <strong>Fecha</strong>, <strong>Hora inicio</strong>, <strong>Hora fin</strong>, <strong>Link del curso</strong>, <strong>Link de Zoom</strong> y <strong>Fecha del boletín</strong>. Las fechas pueden ir como 05/11/2026 y las horas como 2:00 p. m. o 14:00. Los links son opcionales.</p>
      <textarea id="pegado" rows="7" placeholder="Actividad	Fecha	Hora inicio	Hora fin	Link del curso	Link de Zoom	Fecha del boletín"></textarea>
      <div id="vista-previa"></div>
      <div class="botones">
        <button type="button" class="primario" id="importar" disabled>Importar</button>
        <button type="button" class="secundario" data-cerrar>Cancelar</button>
      </div>
    </div>`;
  dialogo.showModal();
  for (const b of dialogo.querySelectorAll('[data-cerrar]')) b.addEventListener('click', () => cerrarDialogo(dialogo));

  const $pegado = dialogo.querySelector('#pegado');
  const $previa = dialogo.querySelector('#vista-previa');
  const $importar = dialogo.querySelector('#importar');
  let filasPegadas = [];
  $pegado.addEventListener('input', () => {
    filasPegadas = $pegado.value.split(/\r?\n/)
      .map((l) => l.split('\t').map((x) => x.trim()))
      .filter((cols) => cols[0] && !/^(nombre|actividad)$/i.test(cols[0]))
      .map(([nombre, fecha, inicio, fin, link, linkZoom, boletin]) => ({
        nombre,
        fecha: normalizarFecha(fecha),
        hora_inicio: horaDeExcel(inicio),
        hora_fin: horaDeExcel(fin),
        link: link || '',
        link_zoom: linkZoom || '',
        fecha_boletin: boletin ? normalizarFecha(boletin) : '',
      }));
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const malas = filasPegadas.filter((f) => !iso.test(f.fecha) || (f.fecha_boletin && !iso.test(f.fecha_boletin))
      || f.hora_inicio === null || f.hora_fin === null);
    $previa.innerHTML = filasPegadas.length
      ? `<p class="sutil">${plural(filasPegadas.length, 'tarea lista', 'tareas listas')} para importar${malas.length ? `, <span class="peligro">${malas.length} con fecha u hora no reconocida</span>` : ''}.</p>`
      : '';
    $importar.disabled = filasPegadas.length === 0 || malas.length > 0;
  });
  $importar.addEventListener('click', async () => {
    try {
      const { importados } = await api('cursos/importar', { method: 'POST', body: { filas: filasPegadas } });
      avisar(`${plural(importados, 'tarea importada', 'tareas importadas')}`);
      cerrarDialogo(dialogo);
      vistaProgramar();
    } catch (e) {
      avisar(e.message, 'error');
    }
  });
}

// ---------- Vista administrador: ajustes ----------

async function vistaAjustes() {
  cargando('Cargando ajustes…');
  let datos;
  try {
    datos = await api('ajustes');
  } catch (e) {
    $app.innerHTML = `<section class="vacio"><p>${esc(e.message)}</p></section>`;
    return;
  }
  const cupo = datos.imagenes;

  $app.innerHTML = `
    <section class="hero hero-corto">
      <div class="hero-texto">
        <p class="antetitulo">Administración</p>
        <h1>Ajustes</h1>
      </div>
    </section>

    <div class="ajustes">
      <section class="panel">
        <h2>Imágenes</h2>
        ${cupo.gratis ? `
        <div class="cupo-grande ${cupo.quedan <= 10 ? 'bajo' : ''}">
          <span class="cifra" data-cifra="${cupo.quedan}">${cupo.quedan}</span>
          <span>de ${cupo.limite} quedan hoy</span>
        </div>
        <span class="medidor grande" style="--pct:${Math.round((cupo.quedan / cupo.limite) * 100)}%"><span></span></span>
        <p class="sutil pequeno">Es un cálculo aproximado: Cloudflare da unas ${cupo.limite} imágenes gratis al día y el cupo se renueva a las 7:00 p. m. (hora de Colombia).</p>`
    : `<div class="cupo-grande"><span class="cifra" data-cifra="${cupo.hoy}">${cupo.hoy}</span><span>generadas hoy</span></div>`}
        <dl class="datos-chicos">
          <div><dt>Este mes</dt><dd>${plural(datos.imagenes_mes, 'imagen', 'imágenes')}</dd></div>
          <div><dt>Modelo</dt><dd>${esc(datos.proveedor)}</dd></div>
        </dl>
      </section>

      <section class="panel">
        <h2>Nombres del saludo</h2>
        <p class="sutil">Así saluda la app a cada quien. Cámbialos cuando llegue una persona nueva al cargo.</p>
        <form id="form-nombres" class="form-columna">
          <label>Administrador
            <input name="admin" maxlength="40" required value="${esc(datos.nombres.admin)}">
          </label>
          <label>Diseño
            <input name="disenador" maxlength="40" required value="${esc(datos.nombres.disenador)}">
          </label>
          <p class="vista-saludo" aria-live="polite"></p>
          <div class="botones"><button type="submit" class="primario">Guardar nombres</button></div>
        </form>
      </section>

      <section class="panel ancho">
        <h2>Instrucción para las imágenes</h2>
        <p class="sutil">Es el texto que recibe la IA para cada curso. <code>{titulo}</code> se reemplaza por el nombre del curso. Si el nombre menciona una marca conocida (Excel, Power BI, Python, Canva…), la app le pide a la IA que incluya su logotipo. Está en inglés porque así la IA responde mejor, pero puedes escribir en español.</p>
        <form id="form-prompt">
          <textarea name="prompt" rows="10">${esc(datos.prompt)}</textarea>
          <div class="botones">
            <button type="submit" class="primario">Guardar instrucción</button>
            <button type="button" class="secundario" id="restaurar">Volver a la original</button>
          </div>
        </form>
      </section>

      <section class="panel ancho">
        <h2>Códigos de acceso</h2>
        <p class="sutil">Cámbialos cuando llegue una persona nueva al cargo. Al cambiar un código, quien tenía el anterior debe volver a entrar.</p>
        <form id="form-clave" class="form-fila">
          <label>Código de
            <select name="rol">
              <option value="disenador">Diseño (${esc(datos.nombres.disenador)})</option>
              <option value="admin">Administrador (${esc(datos.nombres.admin)})</option>
            </select>
          </label>
          <label class="crece">Código nuevo
            <input name="clave" type="text" minlength="6" required autocomplete="off">
          </label>
          <div class="botones"><button type="submit" class="primario">Cambiar código</button></div>
        </form>
      </section>
    </div>`;

  animarCifras();

  const formNombres = document.getElementById('form-nombres');
  const $vista = formNombres.querySelector('.vista-saludo');
  const vistaPrevia = () => {
    const n = formNombres.disenador.value.trim() || '…';
    $vista.innerHTML = `Vista previa: <strong>${esc(saludos(n)[0])}</strong>`;
  };
  vistaPrevia();
  formNombres.addEventListener('input', vistaPrevia);
  formNombres.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const nombres = Object.fromEntries(new FormData(formNombres));
    try {
      await api('ajustes/nombres', { method: 'PUT', body: nombres });
      estado.yo.nombre = nombres.admin.trim();
      estado.yo.otro = nombres.disenador.trim();
      $quien.querySelector('strong').textContent = estado.yo.nombre;
      $quien.querySelector('.avatar').textContent = estado.yo.nombre.charAt(0).toUpperCase();
      $pestanas.querySelector('[data-vista="cursos"]').textContent = `Vista de ${estado.yo.otro}`;
      moverIndicador();
      avisar('Nombres guardados');
    } catch (e) {
      avisar(e.message, 'error');
    }
  });

  const formClave = document.getElementById('form-clave');
  formClave.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const datosClave = Object.fromEntries(new FormData(formClave));
    const quien = datosClave.rol === 'admin' ? 'administrador' : 'diseño';
    if (!confirm(`¿Cambiar el código de ${quien}?`)) return;
    try {
      await api('ajustes/claves', { method: 'PUT', body: datosClave });
      formClave.reset();
      avisar(`Código de ${quien} cambiado`);
    } catch (e) {
      avisar(e.message, 'error');
    }
  });

  const form = document.getElementById('form-prompt');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      await api('ajustes', { method: 'PUT', body: { prompt: form.prompt.value } });
      avisar('Instrucción guardada');
    } catch (e) {
      avisar(e.message, 'error');
    }
  });
  document.getElementById('restaurar').addEventListener('click', () => {
    form.prompt.value = datos.prompt_por_defecto;
    avisar('Restaurada. Guarda para aplicarla.');
  });
}

iniciar();
