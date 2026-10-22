// Interfaz de la app. Sin frameworks ni compilación: lo que está aquí es lo que se publica.

const $app = document.getElementById('app');
const $pestanas = document.getElementById('pestanas');
const $quien = document.getElementById('quien');
const $aviso = document.getElementById('aviso');

const estado = {
  yo: null,
  vista: null,
  cursos: [],
  verAnteriores: false,
  busqueda: '',
  editando: null,
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

function textoCompleto(curso) {
  return [curso.nombre, fechaLarga(curso.fecha), curso.link].filter(Boolean).join('\n');
}

function urlImagen(curso, descargar = false) {
  const v = encodeURIComponent(curso.imagen_en || '');
  return `/api/cursos/${curso.id}/imagen?v=${v}${descargar ? '&descargar=1' : ''}`;
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
    $app.innerHTML = `
      <section class="vacio">
        <h1>${e.sin_acceso ? 'Sin acceso' : 'No se pudo abrir la app'}</h1>
        <p>${esc(e.message)}</p>
      </section>`;
    return;
  }

  $quien.innerHTML = `<span>${esc(estado.yo.nombre || estado.yo.email)}</span>
    <span class="rol">${estado.yo.rol === 'admin' ? 'Administrador' : 'Colaborador'}</span>`;

  const vistas = estado.yo.rol === 'admin'
    ? [['programar', 'Programar cursos'], ['cursos', 'Vista colaborador'], ['accesos', 'Accesos'], ['ajustes', 'Ajustes']]
    : [['cursos', 'Cursos']];
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
}

function irA(vista) {
  estado.vista = vista;
  guardarPreferencia('vista', vista);
  for (const b of $pestanas.querySelectorAll('button')) b.classList.toggle('activa', b.dataset.vista === vista);
  ({ programar: vistaProgramar, cursos: vistaCursos, accesos: vistaAccesos, ajustes: vistaAjustes })[vista]();
}

async function cargarCursos() {
  const ruta = estado.vista === 'cursos' && !estado.verAnteriores ? `cursos?desde=${hoyISO()}` : 'cursos';
  estado.cursos = await api(ruta);
}

// ---------- Vista colaborador ----------

async function vistaCursos() {
  $app.innerHTML = '<p class="cargando">Cargando cursos…</p>';
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

  $app.innerHTML = `
    <section class="encabezado">
      <div>
        <h1>${estado.verAnteriores ? 'Todos los cursos' : 'Próximos cursos'}</h1>
        <p class="sutil">Copia la información de cada curso y genera su imagen.</p>
      </div>
      <div class="controles">
        <input type="search" id="buscar" placeholder="Buscar curso" value="${esc(estado.busqueda)}">
        <label class="interruptor"><input type="checkbox" id="anteriores" ${estado.verAnteriores ? 'checked' : ''}> Ver anteriores</label>
      </div>
    </section>
    ${cursos.length === 0 ? `<section class="vacio"><p>${filtro ? 'Ningún curso coincide con la búsqueda.' : 'No hay cursos programados todavía.'}</p></section>` : ''}
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
  document.getElementById('anteriores').addEventListener('change', async (ev) => {
    estado.verAnteriores = ev.target.checked;
    vistaCursos();
  });
}

function tarjetaCurso(c, formato) {
  const generando = estado.generando.has(c.id);
  const opciones = ['1:1', '4:5', '3:4', '16:9', '9:16']
    .map((f) => `<option value="${f}" ${f === formato ? 'selected' : ''}>${f}</option>`).join('');
  return `
    <article class="tarjeta" data-id="${c.id}">
      <div class="imagen ${c.tiene_imagen ? '' : 'sin-imagen'} ${generando ? 'generando' : ''}">
        ${c.tiene_imagen ? `<img src="${urlImagen(c)}" alt="Imagen generada para ${esc(c.nombre)}" loading="lazy">` : '<span>Sin imagen todavía</span>'}
        ${generando ? '<div class="velo"><span class="giro"></span>Generando imagen…</div>' : ''}
      </div>
      <div class="cuerpo">
        <div class="campo">
          <span class="etiqueta">Nombre</span>
          <p class="valor nombre">${esc(c.nombre)}</p>
          <button type="button" class="copiar" data-copiar="nombre" title="Copiar nombre">Copiar</button>
        </div>
        <div class="campo">
          <span class="etiqueta">Fecha</span>
          <p class="valor">${esc(fechaLarga(c.fecha))}</p>
          <button type="button" class="copiar" data-copiar="fecha" title="Copiar fecha">Copiar</button>
        </div>
        <div class="campo">
          <span class="etiqueta">Link de Brightspace</span>
          <p class="valor link">${c.link ? `<a href="${esc(c.link)}" target="_blank" rel="noopener">${esc(c.link)}</a>` : '<span class="sutil">Sin link</span>'}</p>
          ${c.link ? '<button type="button" class="copiar" data-copiar="link" title="Copiar link">Copiar</button>' : ''}
        </div>

        <div class="acciones">
          <button type="button" class="secundario" data-accion="copiar-todo">Copiar todo</button>
          ${c.tiene_imagen ? `<a class="boton secundario" href="${urlImagen(c, true)}" download>Descargar imagen</a>` : ''}
        </div>

        <details class="generar" ${c.tiene_imagen ? '' : 'open'}>
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
      </div>
    </article>`;
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
    copiar(valor, { nombre: 'Nombre', fecha: 'Fecha', link: 'Link' }[campo]);
    return;
  }

  const accion = ev.target.closest('[data-accion]')?.dataset.accion;
  if (accion === 'copiar-todo') copiar(textoCompleto(curso), 'Información del curso');
  if (accion === 'generar') {
    const formato = tarjeta.querySelector('[data-formato]').value;
    const ajuste = tarjeta.querySelector('[data-ajuste]').value;
    guardarPreferencia('formato', formato);
    estado.generando.add(curso.id);
    pintarCursos();
    try {
      const actualizado = await api(`cursos/${curso.id}/imagen`, { method: 'POST', body: { formato, ajuste } });
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

// ---------- Vista administrador: programar cursos ----------

async function vistaProgramar() {
  $app.innerHTML = '<p class="cargando">Cargando cursos…</p>';
  try {
    await cargarCursos();
  } catch (e) {
    $app.innerHTML = `<section class="vacio"><p>${esc(e.message)}</p></section>`;
    return;
  }
  pintarProgramar();
}

function pintarProgramar() {
  const editando = estado.cursos.find((c) => c.id === estado.editando);
  const hoy = hoyISO();
  const proximos = estado.cursos.filter((c) => c.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const anteriores = estado.cursos.filter((c) => c.fecha < hoy);

  const filas = (lista) => lista.map((c) => `
    <tr data-id="${c.id}" class="${c.id === estado.editando ? 'editando' : ''}">
      <td class="nowrap">${esc(fechaCorta(c.fecha))}</td>
      <td>${esc(c.nombre)}</td>
      <td class="link">${c.link ? `<a href="${esc(c.link)}" target="_blank" rel="noopener">${esc(c.link)}</a>` : '<span class="sutil">—</span>'}</td>
      <td class="nowrap">${c.tiene_imagen ? '<span class="pastilla ok">Con imagen</span>' : '<span class="pastilla">Sin imagen</span>'}</td>
      <td class="nowrap derecha">
        <button type="button" class="enlace" data-editar>Editar</button>
        <button type="button" class="enlace peligro" data-borrar>Eliminar</button>
      </td>
    </tr>`).join('');

  $app.innerHTML = `
    <section class="encabezado">
      <div>
        <h1>Programar cursos</h1>
        <p class="sutil">Lo que registres aquí aparece de inmediato en la vista del colaborador.</p>
      </div>
    </section>

    <section class="panel">
      <h2>${editando ? 'Editar curso' : 'Nuevo curso'}</h2>
      <form id="form-curso" class="form-curso">
        <label class="crece">Nombre del curso
          <input name="nombre" required maxlength="200" value="${esc(editando?.nombre)}" placeholder="Ej.: Comunicación asertiva para líderes">
        </label>
        <label>Fecha
          <input name="fecha" type="date" required value="${esc(editando?.fecha)}">
        </label>
        <label class="crece">Link de Brightspace
          <input name="link" type="url" value="${esc(editando?.link)}" placeholder="https://…">
        </label>
        <div class="botones">
          <button type="submit" class="primario">${editando ? 'Guardar cambios' : 'Agregar curso'}</button>
          ${editando ? '<button type="button" class="secundario" id="cancelar">Cancelar</button>' : ''}
        </div>
      </form>

      <details class="importar">
        <summary>Pegar varios cursos desde Excel</summary>
        <p class="sutil">Copia en Excel las columnas <strong>Nombre</strong>, <strong>Fecha</strong> y <strong>Link</strong> (en ese orden) y pégalas aquí. La fecha puede ir como 05/11/2026.</p>
        <textarea id="pegado" rows="5" placeholder="Nombre	Fecha	Link"></textarea>
        <div id="vista-previa"></div>
        <button type="button" class="secundario" id="importar" disabled>Importar</button>
      </details>
    </section>

    <section class="panel">
      <h2>Próximos (${proximos.length})</h2>
      ${proximos.length ? `<div class="tabla-envoltura"><table><thead><tr><th>Fecha</th><th>Nombre</th><th>Link</th><th>Imagen</th><th></th></tr></thead><tbody>${filas(proximos)}</tbody></table></div>` : '<p class="sutil">No hay cursos próximos.</p>'}
    </section>

    ${anteriores.length ? `
    <section class="panel">
      <details>
        <summary><h2 class="en-linea">Anteriores (${anteriores.length})</h2></summary>
        <div class="tabla-envoltura"><table><thead><tr><th>Fecha</th><th>Nombre</th><th>Link</th><th>Imagen</th><th></th></tr></thead><tbody>${filas(anteriores)}</tbody></table></div>
      </details>
    </section>` : ''}`;

  const form = document.getElementById('form-curso');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const datos = Object.fromEntries(new FormData(form));
    try {
      if (editando) {
        await api(`cursos/${editando.id}`, { method: 'PUT', body: datos });
        avisar('Curso actualizado');
      } else {
        await api('cursos', { method: 'POST', body: datos });
        avisar('Curso agregado');
      }
      estado.editando = null;
      vistaProgramar();
    } catch (e) {
      avisar(e.message, 'error');
    }
  });
  document.getElementById('cancelar')?.addEventListener('click', () => {
    estado.editando = null;
    pintarProgramar();
  });

  const $pegado = document.getElementById('pegado');
  const $previa = document.getElementById('vista-previa');
  const $importar = document.getElementById('importar');
  let filasPegadas = [];
  $pegado.addEventListener('input', () => {
    filasPegadas = $pegado.value.split(/\r?\n/)
      .map((l) => l.split('\t').map((x) => x.trim()))
      .filter((cols) => cols[0] && !/^nombre$/i.test(cols[0]))
      .map(([nombre, fecha, link]) => ({ nombre, fecha: normalizarFecha(fecha), link: link || '' }));
    const malas = filasPegadas.filter((f) => !/^\d{4}-\d{2}-\d{2}$/.test(f.fecha));
    $previa.innerHTML = filasPegadas.length
      ? `<p class="sutil">${filasPegadas.length} curso(s) listos para importar${malas.length ? `, <span class="peligro">${malas.length} con fecha no reconocida</span>` : ''}.</p>`
      : '';
    $importar.disabled = filasPegadas.length === 0 || malas.length > 0;
  });
  $importar.addEventListener('click', async () => {
    try {
      const { importados } = await api('cursos/importar', { method: 'POST', body: { filas: filasPegadas } });
      avisar(`${importados} curso(s) importados`);
      vistaProgramar();
    } catch (e) {
      avisar(e.message, 'error');
    }
  });

  for (const fila of $app.querySelectorAll('tr[data-id]')) {
    const id = Number(fila.dataset.id);
    fila.querySelector('[data-editar]').addEventListener('click', () => {
      estado.editando = id;
      pintarProgramar();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    fila.querySelector('[data-borrar]').addEventListener('click', async () => {
      const curso = estado.cursos.find((c) => c.id === id);
      if (!confirm(`¿Eliminar "${curso.nombre}"? También se borra su imagen.`)) return;
      try {
        await api(`cursos/${id}`, { method: 'DELETE' });
        avisar('Curso eliminado');
        if (estado.editando === id) estado.editando = null;
        vistaProgramar();
      } catch (e) {
        avisar(e.message, 'error');
      }
    });
  }
}

// ---------- Vista administrador: accesos ----------

async function vistaAccesos() {
  $app.innerHTML = '<p class="cargando">Cargando accesos…</p>';
  let datos;
  try {
    datos = await api('usuarios');
  } catch (e) {
    $app.innerHTML = `<section class="vacio"><p>${esc(e.message)}</p></section>`;
    return;
  }

  $app.innerHTML = `
    <section class="encabezado">
      <div>
        <h1>Accesos</h1>
        <p class="sutil">Solo los correos de esta lista pueden usar la app. Cuando alguien cambie de cargo, agrega el correo de quien llega y quita el de quien se va.</p>
      </div>
    </section>

    <section class="panel">
      <h2>Agregar o cambiar persona</h2>
      <form id="form-usuario" class="form-curso">
        <label class="crece">Correo
          <input name="email" type="email" required placeholder="nombre@uninorte.edu.co">
        </label>
        <label class="crece">Nombre
          <input name="nombre" maxlength="120" placeholder="Opcional">
        </label>
        <label>Rol
          <select name="rol">
            <option value="colaborador">Colaborador</option>
            <option value="admin">Administrador</option>
          </select>
        </label>
        <div class="botones"><button type="submit" class="primario">Guardar</button></div>
      </form>
      <p class="sutil pequeno">Si el correo ya existe, se actualizan su nombre y su rol.</p>
    </section>

    <section class="panel">
      <h2>Personas con acceso</h2>
      <div class="tabla-envoltura"><table>
        <thead><tr><th>Correo</th><th>Nombre</th><th>Rol</th><th></th></tr></thead>
        <tbody>
          ${datos.admin_inicial.map((email) => `
            <tr><td>${esc(email)}</td><td class="sutil">—</td><td><span class="pastilla ok">Administrador</span></td>
            <td class="derecha sutil pequeno">Fijo en la configuración</td></tr>`).join('')}
          ${datos.usuarios.filter((u) => !datos.admin_inicial.includes(u.email)).map((u) => `
            <tr data-email="${esc(u.email)}">
              <td>${esc(u.email)}</td>
              <td>${esc(u.nombre) || '<span class="sutil">—</span>'}</td>
              <td><span class="pastilla ${u.rol === 'admin' ? 'ok' : ''}">${u.rol === 'admin' ? 'Administrador' : 'Colaborador'}</span></td>
              <td class="derecha">${u.email === estado.yo.email ? '<span class="sutil pequeno">Tú</span>' : '<button type="button" class="enlace peligro" data-quitar>Quitar acceso</button>'}</td>
            </tr>`).join('')}
        </tbody>
      </table></div>
    </section>`;

  const form = document.getElementById('form-usuario');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      await api('usuarios', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
      avisar('Acceso guardado');
      vistaAccesos();
    } catch (e) {
      avisar(e.message, 'error');
    }
  });
  for (const boton of $app.querySelectorAll('[data-quitar]')) {
    boton.addEventListener('click', async () => {
      const email = boton.closest('tr').dataset.email;
      if (!confirm(`¿Quitarle el acceso a ${email}?`)) return;
      try {
        await api(`usuarios/${encodeURIComponent(email)}`, { method: 'DELETE' });
        avisar('Acceso quitado');
        vistaAccesos();
      } catch (e) {
        avisar(e.message, 'error');
      }
    });
  }
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
    </section>`;

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
