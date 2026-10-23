// Interfaz de la app. Sin frameworks ni compilación: lo que está aquí es lo que se publica.

const $app = document.getElementById('app');
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

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fechaLarga(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  const texto = new Date(a, m - 1, d).toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function fechaCorta(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// Convierte "aaaa-mm-dd hh:mm:ss" (UTC, como lo guarda la base) a fecha y hora local.
function fechaHora(utc) {
  const d = new Date(`${utc.replace(' ', 'T')}Z`);
  return d.toLocaleString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

let temporizadorAviso;
function avisar(mensaje, tipo = 'ok') {
  $aviso.textContent = mensaje;
  $aviso.className = `aviso visible ${tipo}`;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { $aviso.className = 'aviso'; }, tipo === 'error' ? 6000 : 2500);
}

async function copiar(texto, etiqueta) {
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

  $quien.innerHTML = `<span class="rol">${estado.yo.rol === 'admin' ? 'Administrador' : 'Diseñador'}</span>
    <button type="button" class="enlace" id="salir">Salir</button>`;
  document.getElementById('salir').addEventListener('click', async () => {
    await api('salir', { method: 'POST' }).catch(() => {});
    location.reload();
  });

  const vistas = estado.yo.rol === 'admin'
    ? [['programar', 'Programar tareas'], ['cursos', 'Vista diseñador'], ['ajustes', 'Ajustes']]
    : [['cursos', 'Tareas pendientes']];
  if (vistas.length > 1) {
    $pestanas.hidden = false;
    $pestanas.innerHTML = vistas
      .map(([id, nombre]) => `<button type="button" data-vista="${id}">${nombre}</button>`)
      .join('');
    $pestanas.addEventListener('click', (ev) => {
      const boton = ev.target.closest('[data-vista]');
      if (boton) irA(boton.dataset.vista);
    });
  }
  const guardada = leerPreferencias().vista;
  irA(vistas.some(([id]) => id === guardada) ? guardada : vistas[0][0]);
  if (estado.yo.rol === 'admin') {
    revisarAvisos();
    setInterval(revisarAvisos, 60000);
  }
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
    avisar(nuevas.length === 1 ? `El diseñador terminó «${ultima.nombre}»` : `El diseñador terminó ${nuevas.length} tareas`);
    if (estado.vista === 'programar' && !document.querySelector('dialog[open]')) vistaProgramar();
  }
  estado.avisos = nuevas.length;
  const pestana = $pestanas.querySelector('[data-vista="programar"]');
  if (pestana) {
    pestana.querySelector('.contador')?.remove();
    if (nuevas.length) pestana.insertAdjacentHTML('beforeend', ` <span class="contador" title="Tareas terminadas sin revisar">${nuevas.length}</span>`);
  }
  document.title = nuevas.length ? `(${nuevas.length}) Cursos abiertos` : 'Cursos abiertos';
}

function pantallaIngreso() {
  $app.innerHTML = `
    <section class="ingreso">
      <h1>Ingresar</h1>
      <p class="sutil">Escribe tu contraseña. Según la contraseña entras como administrador o como diseñador.</p>
      <form id="form-ingreso">
        <label>Contraseña
          <input name="clave" type="password" autocomplete="current-password" required autofocus>
        </label>
        <p id="error-ingreso" class="peligro pequeno" role="alert"></p>
        <button type="submit" class="primario">Entrar</button>
      </form>
    </section>`;
  const form = document.getElementById('form-ingreso');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const boton = form.querySelector('button');
    boton.disabled = true;
    try {
      await api('ingresar', { method: 'POST', body: { clave: form.clave.value } });
      location.reload();
    } catch (e) {
      document.getElementById('error-ingreso').textContent = e.message;
      form.clave.select();
      boton.disabled = false;
    }
  });
}

function irA(vista) {
  estado.vista = vista;
  guardarPreferencia('vista', vista);
  for (const b of $pestanas.querySelectorAll('button')) b.classList.toggle('activa', b.dataset.vista === vista);
  ({ programar: vistaProgramar, cursos: vistaCursos, ajustes: vistaAjustes })[vista]();
}

async function cargarCursos() {
  const ruta = estado.vista === 'cursos' ? `cursos?estado=${estado.verListas ? 'lista' : 'pendiente'}` : 'cursos';
  estado.cursos = await api(ruta);
}

function diasHasta(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((new Date(a, m - 1, d) - hoy) / 86400000);
}

// Etiqueta de cuándo hay que publicar en el boletín.
function plazoBoletin(c) {
  if (!c.fecha_boletin) return '';
  const dias = diasHasta(c.fecha_boletin);
  if (c.estado === 'lista') return `<span class="plazo">Boletín: ${esc(fechaCorta(c.fecha_boletin))}</span>`;
  const texto = dias < 0 ? `Atrasada ${-dias} día${dias === -1 ? '' : 's'}`
    : dias === 0 ? 'Se publica hoy'
      : dias === 1 ? 'Se publica mañana'
        : `Se publica en ${dias} días`;
  const tipo = dias < 0 ? 'atrasada' : dias <= 2 ? 'pronto' : '';
  return `<span class="plazo ${tipo}">${texto} · ${esc(fechaCorta(c.fecha_boletin))}</span>`;
}

// ---------- Vista diseñador: tareas ----------

async function vistaCursos() {
  $app.innerHTML = '<p class="cargando">Cargando tareas…</p>';
  try {
    await cargarCursos();
  } catch (e) {
    $app.innerHTML = `<section class="vacio"><p>${esc(e.message)}</p></section>`;
    return;
  }
  pintarCursos();
}

function pintarCursos() {
  const formato = leerPreferencias().formato || '1:1';
  const filtro = estado.busqueda.trim().toLowerCase();
  const cursos = estado.cursos.filter((c) => !filtro || c.nombre.toLowerCase().includes(filtro));
  const vacio = filtro ? 'Ninguna tarea coincide con la búsqueda.'
    : estado.verListas ? 'Todavía no hay tareas realizadas.' : 'No tienes tareas pendientes. 🎉';

  $app.innerHTML = `
    <section class="encabezado">
      <div>
        <h1>${estado.verListas ? 'Tareas realizadas' : 'Tareas pendientes'}</h1>
        <p class="sutil">${estado.verListas ? 'Tareas que ya marcaste como listas. El administrador recibe un aviso de cada una.' : 'Copia la información de cada actividad, genera su imagen y márcala como lista.'}</p>
      </div>
      <div class="controles">
        <input type="search" id="buscar" placeholder="Buscar actividad" value="${esc(estado.busqueda)}">
        <div class="segmento" role="group">
          <button type="button" data-ver="pendientes" class="${estado.verListas ? '' : 'activa'}">Pendientes</button>
          <button type="button" data-ver="listas" class="${estado.verListas ? 'activa' : ''}">Realizadas</button>
        </div>
      </div>
    </section>
    ${cursos.length === 0 ? `<section class="vacio"><p>${vacio}</p></section>` : ''}
    <section class="tarjetas">
      ${cursos.map((c) => tarjetaCurso(c, formato)).join('')}
    </section>`;

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
      vistaCursos();
    });
  }
}

function campoCopiable(etiqueta, valorHtml, campo, hayValor = true) {
  return `
    <div class="campo">
      <span class="etiqueta">${etiqueta}</span>
      <p class="valor ${campo === 'nombre' ? 'nombre' : ''} ${campo.startsWith('link') ? 'link' : ''}">${hayValor ? valorHtml : '<span class="sutil">—</span>'}</p>
      ${hayValor ? `<button type="button" class="copiar" data-copiar="${campo}" title="Copiar">Copiar</button>` : ''}
    </div>`;
}

function enlace(url) {
  return `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>`;
}

function tarjetaCurso(c, formato) {
  const generando = estado.generando.has(c.id);
  const opciones = ['1:1', '4:5', '3:4', '16:9', '9:16']
    .map((f) => `<option value="${f}" ${f === formato ? 'selected' : ''}>${f}</option>`).join('');
  return `
    <article class="tarjeta ${c.estado === 'lista' ? 'hecha' : ''}" data-id="${c.id}">
      <div class="imagen ${c.tiene_imagen ? '' : 'sin-imagen'} ${generando ? 'generando' : ''}">
        ${c.tiene_imagen ? `<img src="${urlImagen(c)}" alt="Imagen generada para ${esc(c.nombre)}" loading="lazy">` : '<span>Sin imagen todavía</span>'}
        ${generando ? '<div class="velo"><span class="giro"></span>Generando imagen…</div>' : ''}
      </div>
      <div class="cuerpo">
        ${plazoBoletin(c)}
        ${campoCopiable('Actividad', esc(c.nombre), 'nombre')}
        ${campoCopiable('Fecha de la actividad', esc(fechaLarga(c.fecha)), 'fecha')}
        ${campoCopiable('Link del curso', c.link ? enlace(c.link) : '', 'link', Boolean(c.link))}
        ${campoCopiable('Link de Zoom', c.link_zoom ? enlace(c.link_zoom) : '', 'link_zoom', Boolean(c.link_zoom))}

        <div class="acciones">
          <button type="button" class="secundario" data-accion="copiar-todo">Copiar todo</button>
          ${c.tiene_imagen ? `<a class="boton secundario" href="${urlImagen(c, true)}" download>Descargar imagen</a>` : ''}
        </div>

        <details class="generar" ${c.tiene_imagen || c.estado === 'lista' ? '' : 'open'}>
          <summary>${c.tiene_imagen ? 'Generar otra imagen' : 'Generar imagen'}</summary>
          <div class="generar-campos">
            <label>Formato
              <select data-formato>${opciones}</select>
            </label>
            <label class="crece">Indicación opcional
              <input type="text" data-ajuste maxlength="300" placeholder="Ej.: personas en una oficina, colores cálidos">
            </label>
          </div>
          <button type="button" class="primario" data-accion="generar" ${generando ? 'disabled' : ''}>
            ${generando ? 'Generando…' : c.tiene_imagen ? 'Generar de nuevo' : 'Generar imagen'}
          </button>
        </details>

        ${c.estado === 'lista'
    ? '<button type="button" class="enlace" data-accion="reabrir">Volver a pendientes</button>'
    : '<button type="button" class="listo" data-accion="lista">✓ Marcar como lista</button>'}
      </div>
    </article>`;
}

function textoCompleto(c) {
  return [
    c.nombre,
    fechaLarga(c.fecha),
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
    const valor = campo === 'fecha' ? fechaLarga(curso.fecha) : curso[campo];
    copiar(valor, { nombre: 'Nombre', fecha: 'Fecha', link: 'Link del curso', link_zoom: 'Link de Zoom' }[campo]);
    return;
  }

  const accion = ev.target.closest('[data-accion]')?.dataset.accion;
  if (accion === 'copiar-todo') copiar(textoCompleto(curso), 'Información de la actividad');

  if (accion === 'lista' || accion === 'reabrir') {
    try {
      await api(`cursos/${curso.id}/estado`, { method: 'PUT', body: { estado: accion === 'lista' ? 'lista' : 'pendiente' } });
      avisar(accion === 'lista' ? 'Tarea lista. Se le avisó al administrador.' : 'Tarea devuelta a pendientes');
      vistaCursos();
    } catch (e) {
      avisar(e.message, 'error');
    }
  }

  if (accion === 'generar') {
    const formato = tarjeta.querySelector('[data-formato]').value;
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
      if (estado.vista === 'cursos') pintarCursos();
    }
  }
});

// ---------- Vista administrador: programar tareas ----------

async function vistaProgramar() {
  $app.innerHTML = '<p class="cargando">Cargando tareas…</p>';
  try {
    await cargarCursos();
  } catch (e) {
    $app.innerHTML = `<section class="vacio"><p>${esc(e.message)}</p></section>`;
    return;
  }
  pintarProgramar();
}

function pintarProgramar() {
  const pendientes = estado.cursos.filter((c) => c.estado !== 'lista');
  const realizadas = estado.cursos.filter((c) => c.estado === 'lista')
    .sort((x, y) => String(y.lista_en || '').localeCompare(String(x.lista_en || '')));
  const nuevas = realizadas.filter((c) => c.aviso_nuevo);

  const filas = pendientes.map((c) => `
    <tr data-id="${c.id}">
      <td>${esc(c.nombre)}
        <div class="enlaces-fila">
          ${c.link ? `<a href="${esc(c.link)}" target="_blank" rel="noopener">Curso</a>` : ''}
          ${c.link_zoom ? `<a href="${esc(c.link_zoom)}" target="_blank" rel="noopener">Zoom</a>` : ''}
        </div>
      </td>
      <td class="nowrap">${esc(fechaCorta(c.fecha))}</td>
      <td class="nowrap">${c.fecha_boletin ? esc(fechaCorta(c.fecha_boletin)) : '<span class="sutil">—</span>'}</td>
      <td class="nowrap"><span class="pastilla">${c.tiene_imagen ? 'Imagen generada' : 'Sin imagen'}</span></td>
      <td class="nowrap derecha">
        <button type="button" class="enlace" data-editar>Editar</button>
        <button type="button" class="enlace peligro" data-borrar>Eliminar</button>
      </td>
    </tr>`).join('');

  const tarjetasRealizadas = realizadas.map((c) => `
    <article class="realizada ${c.aviso_nuevo ? 'nueva' : ''}" data-id="${c.id}">
      <div class="mini">
        ${c.tiene_imagen ? `<img src="${urlImagen(c)}" alt="Imagen de ${esc(c.nombre)}" loading="lazy">` : '<span>Sin imagen</span>'}
      </div>
      <div class="realizada-cuerpo">
        ${c.aviso_nuevo ? '<span class="pastilla nueva">Nueva</span>' : ''}
        <strong>${esc(c.nombre)}</strong>
        <span class="sutil pequeno">Terminada ${c.lista_en ? esc(fechaHora(c.lista_en)) : ''}</span>
        <span class="sutil pequeno">Actividad: ${esc(fechaCorta(c.fecha))}${c.fecha_boletin ? ` · Boletín: ${esc(fechaCorta(c.fecha_boletin))}` : ''}</span>
        <div class="realizada-acciones">
          ${c.tiene_imagen ? `<a class="enlace" href="${urlImagen(c, true)}" download>Descargar imagen</a>` : ''}
          <button type="button" class="enlace" data-reabrir>Devolver a pendientes</button>
        </div>
      </div>
    </article>`).join('');

  $app.innerHTML = `
    <section class="encabezado">
      <div>
        <h1>Programar tareas</h1>
        <p class="sutil">Cada tarea le aparece al diseñador en sus pendientes para que genere la imagen.</p>
      </div>
      <div class="controles">
        <button type="button" class="secundario" id="abrir-importar">Pegar desde Excel</button>
        <button type="button" class="primario grande" id="nueva-tarea">+ Programar tarea</button>
      </div>
    </section>

    ${nuevas.length ? `
    <section class="banner-aviso" role="status">
      <div>
        <strong>${nuevas.length === 1 ? 'El diseñador terminó una tarea' : `El diseñador terminó ${nuevas.length} tareas`}</strong>
        <span>${nuevas.map((c) => esc(c.nombre)).join(' · ')}</span>
      </div>
      <button type="button" class="secundario" id="entendido">Entendido</button>
    </section>` : ''}

    <section class="resumen-tareas">
      <div><span class="cifra">${pendientes.length}</span><span class="sutil">pendientes</span></div>
      <div class="ok"><span class="cifra">${realizadas.length}</span><span class="sutil">realizadas</span></div>
    </section>

    <section class="panel">
      <h2>Pendientes del diseñador</h2>
      ${pendientes.length ? `<div class="tabla-envoltura"><table>
        <thead><tr><th>Actividad</th><th>Fecha</th><th>Boletín</th><th>Imagen</th><th></th></tr></thead>
        <tbody>${filas}</tbody></table></div>` : '<p class="sutil">No hay tareas pendientes. Usa «Programar tarea» para crear una.</p>'}
    </section>

    <section class="panel panel-realizadas">
      <h2>✓ Tareas realizadas</h2>
      ${realizadas.length ? `<div class="realizadas">${tarjetasRealizadas}</div>` : '<p class="sutil">Cuando el diseñador marque una tarea como lista, aparecerá aquí con su imagen.</p>'}
    </section>

    <dialog id="dialogo-tarea" class="dialogo"></dialog>
    <dialog id="dialogo-importar" class="dialogo"></dialog>`;

  document.getElementById('nueva-tarea').addEventListener('click', () => abrirTarea(null));
  document.getElementById('abrir-importar').addEventListener('click', abrirImportar);
  document.getElementById('entendido')?.addEventListener('click', async () => {
    try {
      await api('cursos/avisos', { method: 'POST' });
      estado.avisos = 0;
      await vistaProgramar();
      revisarAvisos();
    } catch (e) {
      avisar(e.message, 'error');
    }
  });

  for (const fila of $app.querySelectorAll('tr[data-id]')) {
    const id = Number(fila.dataset.id);
    const curso = estado.cursos.find((c) => c.id === id);
    fila.querySelector('[data-editar]').addEventListener('click', () => abrirTarea(curso));
    fila.querySelector('[data-borrar]').addEventListener('click', async () => {
      if (!confirm(`¿Eliminar "${curso.nombre}"? También se borra su imagen.`)) return;
      try {
        await api(`cursos/${id}`, { method: 'DELETE' });
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

function abrirTarea(curso) {
  const dialogo = document.getElementById('dialogo-tarea');
  dialogo.innerHTML = `
    <form method="dialog" id="form-tarea" class="form-dialogo">
      <header>
        <h2>${curso ? 'Editar tarea' : 'Programar tarea'}</h2>
        <button type="button" class="cerrar" data-cerrar aria-label="Cerrar">×</button>
      </header>
      <label>Nombre de la actividad
        <input name="nombre" required maxlength="200" value="${esc(curso?.nombre)}" placeholder="Ej.: Comunicación asertiva para líderes">
      </label>
      <div class="fila-2">
        <label>Fecha de la actividad
          <input name="fecha" type="date" required value="${esc(curso?.fecha)}">
        </label>
        <label>Fecha de publicación en el boletín
          <input name="fecha_boletin" type="date" required value="${esc(curso?.fecha_boletin)}">
        </label>
      </div>
      <label>Link del curso (Brightspace)
        <input name="link" type="url" value="${esc(curso?.link)}" placeholder="https://…">
      </label>
      <label>Link de Zoom
        <div class="con-boton">
          <input name="link_zoom" type="url" value="${esc(curso?.link_zoom)}" placeholder="Pega aquí el link de la reunión">
          <a class="boton zoom" href="${esc(estado.yo.zoom_url)}" target="_blank" rel="noopener">Generar link de Zoom</a>
        </div>
        <small class="sutil">Se abre Zoom en otra pestaña: crea la reunión, copia su link y pégalo aquí.</small>
      </label>
      <div class="botones">
        <button type="submit" class="primario">${curso ? 'Guardar cambios' : 'Programar tarea'}</button>
        <button type="button" class="secundario" data-cerrar>Cancelar</button>
      </div>
    </form>`;
  dialogo.showModal();
  for (const b of dialogo.querySelectorAll('[data-cerrar]')) b.addEventListener('click', () => dialogo.close());

  const form = dialogo.querySelector('form');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const datos = Object.fromEntries(new FormData(form));
    try {
      if (curso) {
        await api(`cursos/${curso.id}`, { method: 'PUT', body: datos });
        avisar('Tarea actualizada');
      } else {
        await api('cursos', { method: 'POST', body: datos });
        avisar('Tarea programada');
      }
      dialogo.close();
      vistaProgramar();
    } catch (e) {
      avisar(e.message, 'error');
    }
  });
}

function abrirImportar() {
  const dialogo = document.getElementById('dialogo-importar');
  dialogo.innerHTML = `
    <div class="form-dialogo">
      <header>
        <h2>Pegar varias tareas desde Excel</h2>
        <button type="button" class="cerrar" data-cerrar aria-label="Cerrar">×</button>
      </header>
      <p class="sutil">Copia en Excel estas columnas, en este orden, y pégalas aquí: <strong>Actividad</strong>, <strong>Fecha</strong>, <strong>Link del curso</strong>, <strong>Link de Zoom</strong> y <strong>Fecha del boletín</strong>. Las fechas pueden ir como 05/11/2026. Los links son opcionales.</p>
      <textarea id="pegado" rows="7" placeholder="Actividad	Fecha	Link del curso	Link de Zoom	Fecha del boletín"></textarea>
      <div id="vista-previa"></div>
      <div class="botones">
        <button type="button" class="primario" id="importar" disabled>Importar</button>
        <button type="button" class="secundario" data-cerrar>Cancelar</button>
      </div>
    </div>`;
  dialogo.showModal();
  for (const b of dialogo.querySelectorAll('[data-cerrar]')) b.addEventListener('click', () => dialogo.close());

  const $pegado = dialogo.querySelector('#pegado');
  const $previa = dialogo.querySelector('#vista-previa');
  const $importar = dialogo.querySelector('#importar');
  let filasPegadas = [];
  $pegado.addEventListener('input', () => {
    filasPegadas = $pegado.value.split(/\r?\n/)
      .map((l) => l.split('\t').map((x) => x.trim()))
      .filter((cols) => cols[0] && !/^(nombre|actividad)$/i.test(cols[0]))
      .map(([nombre, fecha, link, linkZoom, boletin]) => ({
        nombre,
        fecha: normalizarFecha(fecha),
        link: link || '',
        link_zoom: linkZoom || '',
        fecha_boletin: boletin ? normalizarFecha(boletin) : '',
      }));
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const malas = filasPegadas.filter((f) => !iso.test(f.fecha) || (f.fecha_boletin && !iso.test(f.fecha_boletin)));
    $previa.innerHTML = filasPegadas.length
      ? `<p class="sutil">${filasPegadas.length} tarea(s) listas para importar${malas.length ? `, <span class="peligro">${malas.length} con fecha no reconocida</span>` : ''}.</p>`
      : '';
    $importar.disabled = filasPegadas.length === 0 || malas.length > 0;
  });
  $importar.addEventListener('click', async () => {
    try {
      const { importados } = await api('cursos/importar', { method: 'POST', body: { filas: filasPegadas } });
      avisar(`${importados} tarea(s) importadas`);
      dialogo.close();
      vistaProgramar();
    } catch (e) {
      avisar(e.message, 'error');
    }
  });
}

// ---------- Vista administrador: ajustes ----------

async function vistaAjustes() {
  $app.innerHTML = '<p class="cargando">Cargando ajustes…</p>';
  let datos;
  try {
    datos = await api('ajustes');
  } catch (e) {
    $app.innerHTML = `<section class="vacio"><p>${esc(e.message)}</p></section>`;
    return;
  }
  const costo = (datos.imagenes_mes * datos.costo_imagen_usd).toFixed(2);

  $app.innerHTML = `
    <section class="encabezado">
      <div><h1>Ajustes</h1></div>
    </section>

    <section class="panel resumen">
      <div><span class="cifra">${datos.imagenes_mes}</span><span class="sutil">imágenes generadas este mes</span></div>
      <div><span class="cifra">US$ ${costo}</span><span class="sutil">costo aproximado del mes</span></div>
      <div><span class="cifra pequena">${esc(datos.modelo)}</span><span class="sutil">modelo de Google Gemini</span></div>
    </section>

    <section class="panel">
      <h2>Instrucción para las imágenes</h2>
      <p class="sutil">Es el texto que recibe la IA para cada curso. <code>{titulo}</code> se reemplaza por el nombre del curso. Está en inglés porque así la IA responde con mejores resultados, pero puedes escribirlo en español.</p>
      <form id="form-prompt">
        <textarea name="prompt" rows="12">${esc(datos.prompt)}</textarea>
        <div class="botones">
          <button type="submit" class="primario">Guardar instrucción</button>
          <button type="button" class="secundario" id="restaurar">Volver a la original</button>
        </div>
      </form>
    </section>

    <section class="panel">
      <h2>Contraseñas</h2>
      <p class="sutil">Cámbialas cuando llegue una persona nueva al cargo. Al cambiar una contraseña, quien tenía la anterior debe volver a ingresar.</p>
      <form id="form-clave" class="form-curso">
        <label>Contraseña de
          <select name="rol">
            <option value="disenador">Diseñador</option>
            <option value="admin">Administrador</option>
          </select>
        </label>
        <label class="crece">Nueva contraseña
          <input name="clave" type="text" minlength="6" required autocomplete="off">
        </label>
        <div class="botones"><button type="submit" class="primario">Cambiar contraseña</button></div>
      </form>
    </section>`;

  const formClave = document.getElementById('form-clave');
  formClave.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const datos = Object.fromEntries(new FormData(formClave));
    const quien = datos.rol === 'admin' ? 'administrador' : 'diseñador';
    if (!confirm(`¿Cambiar la contraseña de ${quien}?`)) return;
    try {
      await api('ajustes/claves', { method: 'PUT', body: datos });
      formClave.reset();
      avisar(`Contraseña de ${quien} cambiada`);
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
