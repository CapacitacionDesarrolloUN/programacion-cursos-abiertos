// API de la app. Todo lo que no empieza por /api/ lo sirve Cloudflare desde public/.

import { prepararBase, PROMPT_POR_DEFECTO } from './db.js';
import { rolDeSesion, ingresar, cookieSalida, cambiarClave, rolDeClave, ROLES } from './sesion.js';
import { armarPrompt, generarImagen, proveedorImagenes, FORMATOS } from './imagen.js';

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

class ErrorHttp extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
  }
}

function json(datos, estado = 200) {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function leerJson(request) {
  try {
    return await request.json();
  } catch {
    throw new ErrorHttp(400, 'La petición no trae datos válidos.');
  }
}

function soloAdmin(usuario) {
  if (usuario.rol !== 'admin') throw new ErrorHttp(403, 'Esta acción es solo para administradores.');
}

const ESTADOS = ['pendiente', 'lista'];

function fechaValida(fecha) {
  return FECHA_ISO.test(fecha) && !Number.isNaN(Date.parse(fecha));
}

// Cada "tarea" es un curso que el administrador le asigna al diseñador.
function validarCurso(datos) {
  const nombre = String(datos.nombre || '').trim();
  const fecha = String(datos.fecha || '').trim();
  const link = String(datos.link || '').trim();
  const linkZoom = String(datos.link_zoom || '').trim();
  const fechaBoletin = String(datos.fecha_boletin || '').trim();
  const horaInicio = String(datos.hora_inicio || '').trim();
  const horaFin = String(datos.hora_fin || '').trim();
  const observaciones = String(datos.observaciones || '').trim().slice(0, 1000);
  if (!nombre) throw new ErrorHttp(400, 'La actividad necesita un nombre.');
  for (const hora of [horaInicio, horaFin]) {
    if (hora && !HORA.test(hora)) throw new ErrorHttp(400, `La hora de "${nombre}" no es válida. Escríbela así: 2:00 o 14:00.`);
  }
  if (horaInicio && horaFin && horaFin <= horaInicio) {
    throw new ErrorHttp(400, `En "${nombre}", la hora de fin debe ser después de la de inicio.`);
  }
  if (!fechaValida(fecha)) throw new ErrorHttp(400, `La fecha de "${nombre}" no es válida.`);
  if (fechaBoletin && !fechaValida(fechaBoletin)) {
    throw new ErrorHttp(400, `La fecha de boletín de "${nombre}" no es válida.`);
  }
  for (const [valor, cual] of [[link, 'del curso'], [linkZoom, 'de Zoom']]) {
    if (valor && !/^https?:\/\//i.test(valor)) {
      throw new ErrorHttp(400, `El link ${cual} de "${nombre}" debe empezar por http:// o https://`);
    }
  }
  return { nombre, fecha, link, linkZoom, fechaBoletin: fechaBoletin || null, horaInicio: horaInicio || null, horaFin: horaFin || null, observaciones };
}

function cursoPublico(fila) {
  return {
    id: fila.id,
    nombre: fila.nombre,
    fecha: fila.fecha,
    hora_inicio: fila.hora_inicio || '',
    hora_fin: fila.hora_fin || '',
    observaciones: fila.observaciones || '',
    obs_ok: fila.obs_ok === 1,
    link: fila.link,
    link_zoom: fila.link_zoom || '',
    fecha_boletin: fila.fecha_boletin,
    estado: fila.estado || 'pendiente',
    lista_en: fila.lista_en,
    aviso_nuevo: fila.estado === 'lista' && fila.aviso_visto === 0,
    tiene_imagen: Boolean(fila.imagen_key),
    imagen_en: fila.imagen_en,
    actualizado_en: fila.actualizado_en,
    desde_agenda: Boolean(fila.agenda_id),
  };
}

async function buscarCurso(env, id) {
  const fila = await env.DB.prepare('SELECT * FROM cursos WHERE id = ?').bind(id).first();
  if (!fila) throw new ErrorHttp(404, 'Esa tarea ya no existe.');
  return fila;
}

async function leerAjuste(env, clave, porDefecto = '') {
  return (await env.DB.prepare('SELECT valor FROM ajustes WHERE clave = ?').bind(clave).first())?.valor || porDefecto;
}

// Cupo gratis de Workers AI: se cuenta lo generado desde las 00:00 UTC (7:00 p. m. en Colombia),
// que es cuando Cloudflare lo renueva. Es aproximado: Cloudflare no informa el saldo exacto.
async function cupoImagenes(env) {
  const proveedor = proveedorImagenes(env);
  const hoy = await env.DB.prepare(`SELECT COUNT(*) AS total FROM generaciones WHERE creado_en >= date('now')`).first();
  const limite = Number(env.IMAGENES_DIA || 90);
  return {
    gratis: proveedor.gratis,
    hoy: hoy?.total || 0,
    limite,
    quedan: proveedor.gratis ? Math.max(0, limite - (hoy?.total || 0)) : null,
  };
}

function nombreArchivo(nombre, tipo) {
  const base = nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'curso';
  const ext = tipo === 'image/jpeg' ? 'jpg' : tipo === 'image/webp' ? 'webp' : 'png';
  return `${base}.${ext}`;
}

// ---------- Tareas que llegan desde la agenda ----------
// La agenda (otra página, sin login) manda la tarea con el botón "Añadir a cursos abiertos".
// No usa código de acceso: solo se aceptan peticiones del navegador desde la dirección de la
// agenda (AGENDA_ORIGEN en wrangler.jsonc), igual de abierta que la agenda misma.

function origenAgenda(request, env) {
  const origen = request.headers.get('Origin') || '';
  const permitidos = String(env.AGENDA_ORIGEN || '').split(',').map((o) => o.trim()).filter(Boolean);
  return permitidos.includes(origen) ? origen : null;
}

function conCors(respuesta, origen) {
  respuesta.headers.set('Access-Control-Allow-Origin', origen);
  respuesta.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  respuesta.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  respuesta.headers.set('Access-Control-Max-Age', '86400');
  respuesta.headers.set('Vary', 'Origin');
  return respuesta;
}

async function desdeAgenda(request, env) {
  const datos = await leerJson(request);
  const agendaId = String(datos.agenda_id || '').trim().slice(0, 100);
  if (!agendaId) throw new ErrorHttp(400, 'Primero guarda la tarea en la agenda.');
  // El link del curso y la fecha del boletín los pone el administrador después.
  const curso = validarCurso({ ...datos, link: '', fecha_boletin: '' });
  const previa = await env.DB.prepare('SELECT * FROM cursos WHERE agenda_id = ?').bind(agendaId).first();
  if (previa && previa.estado === 'lista') {
    throw new ErrorHttp(409, 'Esta tarea ya está en cursos abiertos y el diseñador ya la terminó.');
  }
  if (previa) {
    await env.DB
      .prepare(`UPDATE cursos SET nombre = ?, fecha = ?, hora_inicio = ?, hora_fin = ?, link_zoom = ?, observaciones = ?,
                obs_ok = CASE WHEN observaciones = ? THEN obs_ok ELSE 0 END, actualizado_en = datetime('now')
                WHERE id = ?`)
      .bind(curso.nombre, curso.fecha, curso.horaInicio, curso.horaFin, curso.linkZoom, curso.observaciones,
        curso.observaciones, previa.id)
      .run();
    return json({ ok: true, actualizada: true });
  }
  await env.DB
    .prepare(`INSERT INTO cursos (nombre, fecha, hora_inicio, hora_fin, link_zoom, observaciones, creado_por, agenda_id)
              VALUES (?, ?, ?, ?, ?, ?, 'agenda', ?)`)
    .bind(curso.nombre, curso.fecha, curso.horaInicio, curso.horaFin, curso.linkZoom, curso.observaciones, agendaId)
    .run();
  return json({ ok: true, actualizada: false }, 201);
}

// ---------- Rutas ----------

async function rutas(request, env, usuario, partes) {
  const metodo = request.method;
  const [recurso, id, sub] = partes;

  if (recurso === 'yo' && metodo === 'GET') {
    const porDefecto = usuario.rol === 'admin' ? 'Charlie' : 'Luis';
    return json({
      rol: usuario.rol,
      nombre: await leerAjuste(env, `nombre_${usuario.rol}`, porDefecto),
      // Nombre del otro rol, para mensajes como "Luis terminó una tarea".
      otro: usuario.rol === 'admin'
        ? await leerAjuste(env, 'nombre_disenador', 'Luis')
        : await leerAjuste(env, 'nombre_admin', 'Charlie'),
      zoom_url: env.ZOOM_URL || 'https://zoom.us/meeting#/upcoming',
      imagenes: await cupoImagenes(env),
    });
  }

  if (recurso === 'cursos') {
    if (!id && metodo === 'GET') {
      const url = new URL(request.url);
      const filtro = url.searchParams.get('estado');
      const consulta = ESTADOS.includes(filtro)
        ? env.DB.prepare(`SELECT * FROM cursos WHERE estado = ?
                          ORDER BY COALESCE(fecha_boletin, fecha), fecha, hora_inicio, nombre`).bind(filtro)
        : env.DB.prepare('SELECT * FROM cursos ORDER BY COALESCE(fecha_boletin, fecha), fecha, hora_inicio, nombre');
      const { results } = await consulta.all();
      return json(results.map(cursoPublico));
    }

    if (!id && metodo === 'POST') {
      soloAdmin(usuario);
      const curso = validarCurso(await leerJson(request));
      const fila = await env.DB
        .prepare(`INSERT INTO cursos (nombre, fecha, hora_inicio, hora_fin, link, link_zoom, fecha_boletin, observaciones, creado_por)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`)
        .bind(curso.nombre, curso.fecha, curso.horaInicio, curso.horaFin, curso.link, curso.linkZoom, curso.fechaBoletin,
          curso.observaciones, usuario.rol)
        .first();
      return json(cursoPublico(fila), 201);
    }

    if (id === 'importar' && metodo === 'POST') {
      soloAdmin(usuario);
      const { filas } = await leerJson(request);
      if (!Array.isArray(filas) || filas.length === 0) throw new ErrorHttp(400, 'No hay filas para importar.');
      if (filas.length > 200) throw new ErrorHttp(400, 'Importa máximo 200 tareas a la vez.');
      const cursos = filas.map(validarCurso);
      await env.DB.batch(cursos.map((c) => env.DB
        .prepare(`INSERT INTO cursos (nombre, fecha, hora_inicio, hora_fin, link, link_zoom, fecha_boletin, observaciones, creado_por)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(c.nombre, c.fecha, c.horaInicio, c.horaFin, c.link, c.linkZoom, c.fechaBoletin, c.observaciones, usuario.rol)));
      return json({ importados: cursos.length }, 201);
    }

    // El administrador confirma que ya vio los avisos de tareas terminadas.
    if (id === 'avisos' && metodo === 'POST') {
      soloAdmin(usuario);
      await env.DB.prepare(`UPDATE cursos SET aviso_visto = 1 WHERE aviso_visto = 0`).run();
      return json({ ok: true });
    }

    const cursoId = Number(id);
    if (!Number.isInteger(cursoId)) throw new ErrorHttp(404, 'Ruta no encontrada.');

    if (!sub && metodo === 'PUT') {
      soloAdmin(usuario);
      await buscarCurso(env, cursoId);
      const curso = validarCurso(await leerJson(request));
      const fila = await env.DB
        .prepare(`UPDATE cursos SET nombre = ?, fecha = ?, hora_inicio = ?, hora_fin = ?, link = ?, link_zoom = ?,
                  fecha_boletin = ?, observaciones = ?,
                  obs_ok = CASE WHEN observaciones = ? THEN obs_ok ELSE 0 END,
                  actualizado_en = datetime('now') WHERE id = ? RETURNING *`)
        .bind(curso.nombre, curso.fecha, curso.horaInicio, curso.horaFin, curso.link, curso.linkZoom, curso.fechaBoletin,
          curso.observaciones, curso.observaciones, cursoId)
        .first();
      return json(cursoPublico(fila));
    }

    // El diseñador marca la tarea como lista (o la reabre). El administrador también puede.
    if (sub === 'estado' && metodo === 'PUT') {
      await buscarCurso(env, cursoId);
      const { estado } = await leerJson(request);
      if (!ESTADOS.includes(estado)) throw new ErrorHttp(400, 'Estado no válido.');
      const fila = await env.DB
        .prepare(`UPDATE cursos SET estado = ?, lista_en = CASE WHEN ? = 'lista' THEN datetime('now') END,
                  aviso_visto = CASE WHEN ? = 'lista' AND ? = 'disenador' THEN 0 ELSE 1 END
                  WHERE id = ? RETURNING *`)
        .bind(estado, estado, estado, usuario.rol, cursoId)
        .first();
      return json(cursoPublico(fila));
    }

    // El diseñador marca las observaciones como realizadas (o las reabre), como en la agenda.
    if (sub === 'observaciones' && metodo === 'PUT') {
      await buscarCurso(env, cursoId);
      const { ok } = await leerJson(request);
      const fila = await env.DB.prepare('UPDATE cursos SET obs_ok = ? WHERE id = ? RETURNING *')
        .bind(ok ? 1 : 0, cursoId).first();
      return json(cursoPublico(fila));
    }

    if (!sub && metodo === 'DELETE') {
      soloAdmin(usuario);
      const fila = await buscarCurso(env, cursoId);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM imagenes WHERE curso_id = ?').bind(cursoId),
        env.DB.prepare('DELETE FROM cursos WHERE id = ?').bind(cursoId),
      ]);
      return json({ ok: true });
    }

    if (sub === 'imagen' && metodo === 'GET') {
      const fila = await buscarCurso(env, cursoId);
      const imagen = await env.DB.prepare('SELECT tipo, datos FROM imagenes WHERE curso_id = ?').bind(cursoId).first();
      if (!imagen) throw new ErrorHttp(404, 'Esta tarea todavía no tiene imagen.');
      const descargar = new URL(request.url).searchParams.has('descargar');
      const encabezados = { 'Content-Type': imagen.tipo, 'Cache-Control': 'private, max-age=31536000, immutable' };
      if (descargar) encabezados['Content-Disposition'] = `attachment; filename="${nombreArchivo(fila.nombre, imagen.tipo)}"`;
      return new Response(Buffer.from(imagen.datos, 'base64'), { headers: encabezados });
    }

    if (sub === 'imagen' && metodo === 'POST') {
      const fila = await buscarCurso(env, cursoId);
      const { formato, ajuste } = await leerJson(request);
      const plantilla = (await env.DB.prepare(`SELECT valor FROM ajustes WHERE clave = 'prompt'`).first())?.valor
        || PROMPT_POR_DEFECTO;
      const prompt = armarPrompt(plantilla, fila.nombre, String(ajuste || '').trim().slice(0, 500));

      let imagen;
      try {
        imagen = await generarImagen(env, prompt, formato);
      } catch (e) {
        throw new ErrorHttp(502, e.message);
      }

      // Se devuelve sin guardar: el navegador la comprime y la sube con PUT.
      await env.DB.prepare('INSERT INTO generaciones (curso_id, rol) VALUES (?, ?)').bind(cursoId, usuario.rol).run();
      return json(imagen);
    }

    if (sub === 'imagen' && metodo === 'PUT') {
      await buscarCurso(env, cursoId);
      const { base64, tipo } = await leerJson(request);
      const datos = String(base64 || '');
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(tipo)) throw new ErrorHttp(400, 'Formato de imagen no válido.');
      if (!datos || !/^[A-Za-z0-9+/=]+$/.test(datos)) throw new ErrorHttp(400, 'La imagen llegó dañada. Genérala de nuevo.');
      if (datos.length > 1_800_000) throw new ErrorHttp(413, 'La imagen es demasiado grande para guardarla.');
      const [, actualizado] = await env.DB.batch([
        env.DB.prepare(`INSERT INTO imagenes (curso_id, tipo, datos) VALUES (?, ?, ?)
                        ON CONFLICT(curso_id) DO UPDATE SET tipo = excluded.tipo, datos = excluded.datos,
                        creado_en = datetime('now')`).bind(cursoId, tipo, datos),
        env.DB.prepare(`UPDATE cursos SET imagen_key = 'd1', imagen_tipo = ?, imagen_en = datetime('now')
                        WHERE id = ? RETURNING *`).bind(tipo, cursoId),
      ]);
      return json(cursoPublico(actualizado.results[0]));
    }
  }

  if (recurso === 'ajustes') {
    soloAdmin(usuario);
    if (id === 'claves' && metodo === 'PUT') {
      const { rol, clave } = await leerJson(request);
      const nueva = String(clave || '');
      if (!ROLES.includes(rol)) throw new ErrorHttp(400, 'Rol no válido.');
      if (nueva.length < 6) throw new ErrorHttp(400, 'El código debe tener al menos 6 caracteres.');
      const duena = (await rolDeClave(env.DB, nueva)).rol;
      if (duena && duena !== rol) throw new ErrorHttp(400, 'Ese código ya lo usa el otro rol. Elige uno distinto.');
      await cambiarClave(env.DB, rol, nueva);
      // Cambiar la propia contraseña cierra la sesión actual; se renueva para no sacar al admin.
      const respuesta = json({ ok: true });
      if (rol === 'admin') {
        const { cookie } = await ingresar(request, env.DB, nueva);
        if (cookie) respuesta.headers.append('Set-Cookie', cookie);
      }
      return respuesta;
    }
    if (id === 'nombres' && metodo === 'PUT') {
      const datos = await leerJson(request);
      const nombres = ROLES.map((rol) => [rol, String(datos[rol] || '').trim()]);
      for (const [, nombre] of nombres) {
        if (!nombre || nombre.length > 40) throw new ErrorHttp(400, 'Cada nombre debe tener entre 1 y 40 caracteres.');
      }
      await env.DB.batch(nombres.map(([rol, nombre]) => env.DB
        .prepare(`INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`)
        .bind(`nombre_${rol}`, nombre)));
      return json({ ok: true });
    }
    if (!id && metodo === 'GET') {
      const mes = await env.DB
        .prepare(`SELECT COUNT(*) AS total FROM generaciones WHERE creado_en >= date('now', 'start of month')`)
        .first();
      return json({
        prompt: await leerAjuste(env, 'prompt', PROMPT_POR_DEFECTO),
        prompt_por_defecto: PROMPT_POR_DEFECTO,
        nombres: {
          admin: await leerAjuste(env, 'nombre_admin', 'Charlie'),
          disenador: await leerAjuste(env, 'nombre_disenador', 'Luis'),
        },
        imagenes: await cupoImagenes(env),
        imagenes_mes: mes?.total || 0,
        modelo: proveedorImagenes(env).modelo,
        proveedor: proveedorImagenes(env).nombre,
        formatos: FORMATOS,
      });
    }
    if (!id && metodo === 'PUT') {
      const { prompt } = await leerJson(request);
      const texto = String(prompt || '').trim();
      if (texto.length < 20) throw new ErrorHttp(400, 'El prompt es muy corto.');
      await env.DB
        .prepare(`INSERT INTO ajustes (clave, valor) VALUES ('prompt', ?)
                  ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`)
        .bind(texto)
        .run();
      return json({ ok: true });
    }
  }

  throw new ErrorHttp(404, 'Ruta no encontrada.');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    if (url.pathname === '/api/desde-agenda') {
      const origen = origenAgenda(request, env);
      if (!origen) return json({ error: 'Solo la agenda puede enviar tareas por aquí.' }, 403);
      if (request.method === 'OPTIONS') return conCors(new Response(null, { status: 204 }), origen);
      if (request.method !== 'POST') return conCors(json({ error: 'Ruta no encontrada.' }, 404), origen);
      try {
        await prepararBase(env.DB, env);
        return conCors(await desdeAgenda(request, env), origen);
      } catch (e) {
        if (e instanceof ErrorHttp) return conCors(json({ error: e.message }, e.estado), origen);
        console.error(e);
        return conCors(json({ error: 'Ocurrió un error inesperado. Intenta de nuevo.' }, 500), origen);
      }
    }

    try {
      await prepararBase(env.DB, env);

      if (url.pathname === '/api/ingresar' && request.method === 'POST') {
        const { clave } = await leerJson(request);
        const resultado = await ingresar(request, env.DB, clave);
        if (resultado.error) return json({ error: resultado.error }, resultado.estado);
        const respuesta = json({ rol: resultado.rol });
        respuesta.headers.append('Set-Cookie', resultado.cookie);
        return respuesta;
      }
      if (url.pathname === '/api/salir' && request.method === 'POST') {
        const respuesta = json({ ok: true });
        respuesta.headers.append('Set-Cookie', cookieSalida(request));
        return respuesta;
      }

      const rol = await rolDeSesion(request, env.DB);
      if (!rol) return json({ error: 'Escribe tu código para continuar.', sin_sesion: true }, 401);
      const usuario = { rol };

      const partes = url.pathname.replace(/^\/api\/+/, '').split('/').filter(Boolean);
      return await rutas(request, env, usuario, partes);
    } catch (e) {
      if (e instanceof ErrorHttp) return json({ error: e.message }, e.estado);
      console.error(e);
      return json({ error: 'Ocurrió un error inesperado. Intenta de nuevo.' }, 500);
    }
  },
};
