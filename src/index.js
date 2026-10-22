// API de la app. Todo lo que no empieza por /api/ lo sirve Cloudflare desde public/.

import { identificar, esAdminInicial } from './auth.js';
import { prepararBase, PROMPT_POR_DEFECTO } from './db.js';
import { armarPrompt, generarImagen, FORMATOS } from './imagen.js';

const ROLES = ['admin', 'colaborador'];
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

function validarCurso(datos) {
  const nombre = String(datos.nombre || '').trim();
  const fecha = String(datos.fecha || '').trim();
  const link = String(datos.link || '').trim();
  if (!nombre) throw new ErrorHttp(400, 'El curso necesita un nombre.');
  if (!FECHA_ISO.test(fecha) || Number.isNaN(Date.parse(fecha))) {
    throw new ErrorHttp(400, `La fecha de "${nombre}" no es válida.`);
  }
  if (link && !/^https?:\/\//i.test(link)) {
    throw new ErrorHttp(400, `El link de "${nombre}" debe empezar por http:// o https://`);
  }
  return { nombre, fecha, link };
}

function cursoPublico(fila) {
  return {
    id: fila.id,
    nombre: fila.nombre,
    fecha: fila.fecha,
    link: fila.link,
    tiene_imagen: Boolean(fila.imagen_key),
    imagen_en: fila.imagen_en,
    actualizado_en: fila.actualizado_en,
  };
}

async function buscarCurso(env, id) {
  const fila = await env.DB.prepare('SELECT * FROM cursos WHERE id = ?').bind(id).first();
  if (!fila) throw new ErrorHttp(404, 'Ese curso ya no existe.');
  return fila;
}

async function cargarUsuario(env, email) {
  const fila = await env.DB.prepare('SELECT * FROM usuarios WHERE email = ?').bind(email).first();
  if (esAdminInicial(email, env)) return { email, nombre: fila?.nombre || '', rol: 'admin' };
  return fila ? { email, nombre: fila.nombre, rol: fila.rol } : null;
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
    return json({ email: usuario.email, nombre: usuario.nombre, rol: usuario.rol });
  }

  if (recurso === 'cursos') {
    if (!id && metodo === 'GET') {
      const url = new URL(request.url);
      const desde = url.searchParams.get('desde');
      const consulta = desde && FECHA_ISO.test(desde)
        ? env.DB.prepare('SELECT * FROM cursos WHERE fecha >= ? ORDER BY fecha, nombre').bind(desde)
        : env.DB.prepare('SELECT * FROM cursos ORDER BY fecha DESC, nombre');
      const { results } = await consulta.all();
      return json(results.map(cursoPublico));
    }

    if (!id && metodo === 'POST') {
      soloAdmin(usuario);
      const curso = validarCurso(await leerJson(request));
      const fila = await env.DB
        .prepare('INSERT INTO cursos (nombre, fecha, link, creado_por) VALUES (?, ?, ?, ?) RETURNING *')
        .bind(curso.nombre, curso.fecha, curso.link, usuario.email)
        .first();
      return json(cursoPublico(fila), 201);
    }

    if (id === 'importar' && metodo === 'POST') {
      soloAdmin(usuario);
      const { filas } = await leerJson(request);
      if (!Array.isArray(filas) || filas.length === 0) throw new ErrorHttp(400, 'No hay filas para importar.');
      if (filas.length > 200) throw new ErrorHttp(400, 'Importa máximo 200 cursos a la vez.');
      const cursos = filas.map(validarCurso);
      await env.DB.batch(cursos.map((c) => env.DB
        .prepare('INSERT INTO cursos (nombre, fecha, link, creado_por) VALUES (?, ?, ?, ?)')
        .bind(c.nombre, c.fecha, c.link, usuario.email)));
      return json({ importados: cursos.length }, 201);
    }

    const cursoId = Number(id);
    if (!Number.isInteger(cursoId)) throw new ErrorHttp(404, 'Ruta no encontrada.');

    if (!sub && metodo === 'PUT') {
      soloAdmin(usuario);
      await buscarCurso(env, cursoId);
      const curso = validarCurso(await leerJson(request));
      const fila = await env.DB
        .prepare(`UPDATE cursos SET nombre = ?, fecha = ?, link = ?, actualizado_en = datetime('now')
                  WHERE id = ? RETURNING *`)
        .bind(curso.nombre, curso.fecha, curso.link, cursoId)
        .first();
      return json(cursoPublico(fila));
    }

    if (!sub && metodo === 'DELETE') {
      soloAdmin(usuario);
      const fila = await buscarCurso(env, cursoId);
      if (fila.imagen_key) await env.IMAGENES.delete(fila.imagen_key);
      await env.DB.prepare('DELETE FROM cursos WHERE id = ?').bind(cursoId).run();
      return json({ ok: true });
    }

    if (sub === 'imagen' && metodo === 'GET') {
      const fila = await buscarCurso(env, cursoId);
      if (!fila.imagen_key) throw new ErrorHttp(404, 'Este curso todavía no tiene imagen.');
      const objeto = await env.IMAGENES.get(fila.imagen_key);
      if (!objeto) throw new ErrorHttp(404, 'No se encontró la imagen. Genérala de nuevo.');
      const descargar = new URL(request.url).searchParams.has('descargar');
      const tipo = fila.imagen_tipo || 'image/png';
      const encabezados = { 'Content-Type': tipo, 'Cache-Control': 'private, max-age=31536000, immutable' };
      if (descargar) encabezados['Content-Disposition'] = `attachment; filename="${nombreArchivo(fila.nombre, tipo)}"`;
      return new Response(objeto.body, { headers: encabezados });
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

      const clave = `cursos/${cursoId}/${Date.now()}`;
      await env.IMAGENES.put(clave, imagen.bytes, { httpMetadata: { contentType: imagen.tipo } });
      if (fila.imagen_key) await env.IMAGENES.delete(fila.imagen_key);
      const actualizado = await env.DB
        .prepare(`UPDATE cursos SET imagen_key = ?, imagen_tipo = ?, imagen_en = datetime('now') WHERE id = ? RETURNING *`)
        .bind(clave, imagen.tipo, cursoId)
        .first();
      await env.DB.prepare('INSERT INTO generaciones (curso_id, email) VALUES (?, ?)').bind(cursoId, usuario.email).run();
      return json(cursoPublico(actualizado));
    }
  }

  if (recurso === 'usuarios') {
    soloAdmin(usuario);
    if (!id && metodo === 'GET') {
      const { results } = await env.DB.prepare('SELECT email, nombre, rol, creado_en FROM usuarios ORDER BY rol, email').all();
      const iniciales = (env.ADMIN_INICIAL || '').split(',').map((c) => c.trim().toLowerCase()).filter(Boolean);
      return json({ usuarios: results, admin_inicial: iniciales });
    }
    if (!id && metodo === 'POST') {
      const datos = await leerJson(request);
      const email = String(datos.email || '').trim().toLowerCase();
      const nombre = String(datos.nombre || '').trim();
      const rol = String(datos.rol || '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorHttp(400, 'Ese correo no es válido.');
      if (!ROLES.includes(rol)) throw new ErrorHttp(400, 'El rol debe ser admin o colaborador.');
      await env.DB
        .prepare(`INSERT INTO usuarios (email, nombre, rol) VALUES (?, ?, ?)
                  ON CONFLICT(email) DO UPDATE SET nombre = excluded.nombre, rol = excluded.rol`)
        .bind(email, nombre, rol)
        .run();
      return json({ ok: true }, 201);
    }
    if (id && metodo === 'DELETE') {
      const email = decodeURIComponent(id).toLowerCase();
      if (email === usuario.email) throw new ErrorHttp(400, 'No puedes quitarte tu propio acceso.');
      await env.DB.prepare('DELETE FROM usuarios WHERE email = ?').bind(email).run();
      return json({ ok: true });
    }
  }

  if (recurso === 'ajustes') {
    soloAdmin(usuario);
    if (metodo === 'GET') {
      const fila = await env.DB.prepare(`SELECT valor FROM ajustes WHERE clave = 'prompt'`).first();
      const mes = await env.DB
        .prepare(`SELECT COUNT(*) AS total FROM generaciones WHERE creado_en >= date('now', 'start of month')`)
        .first();
      return json({
        prompt: fila?.valor || PROMPT_POR_DEFECTO,
        prompt_por_defecto: PROMPT_POR_DEFECTO,
        imagenes_mes: mes?.total || 0,
        costo_imagen_usd: Number(env.COSTO_IMAGEN_USD || 0.039),
        modelo: env.GEMINI_MODEL || 'gemini-2.5-flash-image',
        formatos: FORMATOS,
      });
    }
    if (metodo === 'PUT') {
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
      const sesion = await identificar(request, env);
      if (sesion.error) return json({ error: sesion.error }, sesion.estado);

      await prepararBase(env.DB);
      const usuario = await cargarUsuario(env, sesion.email);
      if (!usuario) {
        return json({
          error: `El correo ${sesion.email} no tiene acceso. Pídele a un administrador de la app que lo agregue.`,
          sin_acceso: true,
          email: sesion.email,
        }, 403);
      }

      const partes = url.pathname.replace(/^\/api\/+/, '').split('/').filter(Boolean);
      return await rutas(request, env, usuario, partes);
    } catch (e) {
      if (e instanceof ErrorHttp) return json({ error: e.message }, e.estado);
      console.error(e);
      return json({ error: 'Ocurrió un error inesperado. Intenta de nuevo.' }, 500);
    }
  },
};
