// API de la app. Todo lo que no empieza por /api/ lo sirve Cloudflare desde public/.

import { prepararBase, PROMPT_POR_DEFECTO } from './db.js';
import { rolDeSesion, ingresar, cookieSalida, cambiarClave, rolDeClave, ROLES } from './sesion.js';
import { armarPrompt, generarImagen, FORMATOS } from './imagen.js';

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

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
  if (!nombre) throw new ErrorHttp(400, 'La actividad necesita un nombre.');
  if (!fechaValida(fecha)) throw new ErrorHttp(400, `La fecha de "${nombre}" no es válida.`);
  if (fechaBoletin && !fechaValida(fechaBoletin)) {
    throw new ErrorHttp(400, `La fecha de boletín de "${nombre}" no es válida.`);
  }
  for (const [valor, cual] of [[link, 'del curso'], [linkZoom, 'de Zoom']]) {
    if (valor && !/^https?:\/\//i.test(valor)) {
      throw new ErrorHttp(400, `El link ${cual} de "${nombre}" debe empezar por http:// o https://`);
    }
  }
  return { nombre, fecha, link, linkZoom, fechaBoletin: fechaBoletin || null };
}

function cursoPublico(fila) {
  return {
    id: fila.id,
    nombre: fila.nombre,
    fecha: fila.fecha,
    link: fila.link,
    link_zoom: fila.link_zoom || '',
    fecha_boletin: fila.fecha_boletin,
    estado: fila.estado || 'pendiente',
    lista_en: fila.lista_en,
    aviso_nuevo: fila.estado === 'lista' && fila.aviso_visto === 0,
    tiene_imagen: Boolean(fila.imagen_key),
    imagen_en: fila.imagen_en,
    actualizado_en: fila.actualizado_en,
  };
}

async function buscarCurso(env, id) {
  const fila = await env.DB.prepare('SELECT * FROM cursos WHERE id = ?').bind(id).first();
  if (!fila) throw new ErrorHttp(404, 'Esa tarea ya no existe.');
  return fila;
}

function nombreArchivo(nombre, tipo) {
  const base = nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'curso';
  const ext = tipo === 'image/jpeg' ? 'jpg' : tipo === 'image/webp' ? 'webp' : 'png';
  return `${base}.${ext}`;
}

// ---------- Rutas ----------

async function rutas(request, env, usuario, partes) {
  const metodo = request.method;
  const [recurso, id, sub] = partes;

  if (recurso === 'yo' && metodo === 'GET') {
    return json({ rol: usuario.rol, zoom_url: env.ZOOM_URL || 'https://zoom.us/meeting#/upcoming' });
  }

  if (recurso === 'cursos') {
    if (!id && metodo === 'GET') {
      const url = new URL(request.url);
      const filtro = url.searchParams.get('estado');
      const consulta = ESTADOS.includes(filtro)
        ? env.DB.prepare(`SELECT * FROM cursos WHERE estado = ?
                          ORDER BY COALESCE(fecha_boletin, fecha), fecha, nombre`).bind(filtro)
        : env.DB.prepare('SELECT * FROM cursos ORDER BY COALESCE(fecha_boletin, fecha), fecha, nombre');
      const { results } = await consulta.all();
      return json(results.map(cursoPublico));
    }

    if (!id && metodo === 'POST') {
      soloAdmin(usuario);
      const curso = validarCurso(await leerJson(request));
      const fila = await env.DB
        .prepare(`INSERT INTO cursos (nombre, fecha, link, link_zoom, fecha_boletin, creado_por)
                  VALUES (?, ?, ?, ?, ?, ?) RETURNING *`)
        .bind(curso.nombre, curso.fecha, curso.link, curso.linkZoom, curso.fechaBoletin, usuario.rol)
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
        .prepare(`INSERT INTO cursos (nombre, fecha, link, link_zoom, fecha_boletin, creado_por)
                  VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(c.nombre, c.fecha, c.link, c.linkZoom, c.fechaBoletin, usuario.rol)));
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
        .prepare(`UPDATE cursos SET nombre = ?, fecha = ?, link = ?, link_zoom = ?, fecha_boletin = ?,
                  actualizado_en = datetime('now') WHERE id = ? RETURNING *`)
        .bind(curso.nombre, curso.fecha, curso.link, curso.linkZoom, curso.fechaBoletin, cursoId)
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
      if (nueva.length < 6) throw new ErrorHttp(400, 'La contraseña debe tener al menos 6 caracteres.');
      const duena = (await rolDeClave(env.DB, nueva)).rol;
      if (duena && duena !== rol) throw new ErrorHttp(400, 'Esa contraseña ya la usa el otro rol. Elige una distinta.');
      await cambiarClave(env.DB, rol, nueva);
      // Cambiar la propia contraseña cierra la sesión actual; se renueva para no sacar al admin.
      const respuesta = json({ ok: true });
      if (rol === 'admin') {
        const { cookie } = await ingresar(request, env.DB, nueva);
        if (cookie) respuesta.headers.append('Set-Cookie', cookie);
      }
      return respuesta;
    }
    if (!id && metodo === 'GET') {
      const fila = await env.DB.prepare(`SELECT valor FROM ajustes WHERE clave = 'prompt'`).first();
      const mes = await env.DB
        .prepare(`SELECT COUNT(*) AS total FROM generaciones WHERE creado_en >= date('now', 'start of month')`)
        .first();
      return json({
        prompt: fila?.valor || PROMPT_POR_DEFECTO,
        prompt_por_defecto: PROMPT_POR_DEFECTO,
        imagenes_mes: mes?.total || 0,
        costo_imagen_usd: Number(env.COSTO_IMAGEN_USD || 0.039),
        modelo: env.GEMINI_MODEL || 'gemini-3.1-flash-lite-image',
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
      if (!rol) return json({ error: 'Ingresa la contraseña para continuar.', sin_sesion: true }, 401);
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
