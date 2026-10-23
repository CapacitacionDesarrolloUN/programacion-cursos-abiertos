import { prepararSesiones } from './sesion.js';

// Estructura de la base de datos. Las tablas se crean solas la primera vez que
// la app recibe una petición, así no hay que correr migraciones a mano.

export const PROMPT_POR_DEFECTO = `A realistic, natural-looking photograph that represents the training course titled "{titulo}". The image should capture and convey the essence of the topic as completely as possible, showing real people, places or objects related to it in an authentic workplace or learning setting.

Style: candid documentary photography, natural light, true-to-life colors, real skin texture and small everyday imperfections, shot on a full-frame camera with a 35mm lens. It must not look artificial, staged, CGI, 3D rendered, illustrated or overly polished.

Apart from the brand logo described below (if any), the image is purely visual and clean: no signage, no captions, no watermarks, no readable words or lettering anywhere.`;

// Versiones anteriores de la instrucción por defecto. Si la guardada es una de ellas, se actualiza sola.
const FINALES_ANTERIORES = [
  'Strictly no text of any kind: no letters, words, numbers, captions, signs, screens with writing, logos or watermarks.',
  'The image is purely visual and clean: blank surfaces, no signage, no screens showing writing, no logos, no watermarks, no captions, no lettering anywhere.',
];

const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS cursos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    fecha TEXT NOT NULL,
    link TEXT NOT NULL DEFAULT '',
    imagen_key TEXT,
    imagen_tipo TEXT,
    imagen_en TEXT,
    creado_por TEXT,
    creado_en TEXT NOT NULL DEFAULT (datetime('now')),
    actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS cursos_fecha ON cursos (fecha)`,
  `CREATE TABLE IF NOT EXISTS ajustes (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  )`,
  // Imágenes ya comprimidas a JPEG por el navegador, en base64 (una por tarea).
  `CREATE TABLE IF NOT EXISTS imagenes (
    curso_id INTEGER PRIMARY KEY,
    tipo TEXT NOT NULL,
    datos TEXT NOT NULL,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS generaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    curso_id INTEGER,
    rol TEXT,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS intentos (
    ip TEXT NOT NULL,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
];

// Columnas agregadas después de la primera versión. Se agregan solas si faltan.
const COLUMNAS_NUEVAS = {
  cursos: {
    link_zoom: "TEXT NOT NULL DEFAULT ''",
    fecha_boletin: 'TEXT',
    estado: "TEXT NOT NULL DEFAULT 'pendiente'",
    lista_en: 'TEXT',
    // 0 = el administrador todavía no ha visto que la tarea quedó lista.
    aviso_visto: 'INTEGER NOT NULL DEFAULT 1',
    // Horas en formato 24 h ("14:00"), como en la agenda de Capacitación.
    hora_inicio: 'TEXT',
    hora_fin: 'TEXT',
    // Notas del administrador para el diseñador. obs_ok = 1 cuando el diseñador las marca como realizadas.
    observaciones: "TEXT NOT NULL DEFAULT ''",
    obs_ok: 'INTEGER NOT NULL DEFAULT 0',
    // id de la tarea en la agenda (Supabase) cuando llegó con el botón "Añadir a cursos abiertos".
    agenda_id: 'TEXT',
  },
};

async function agregarColumnasFaltantes(db) {
  for (const [tabla, columnas] of Object.entries(COLUMNAS_NUEVAS)) {
    const { results } = await db.prepare(`PRAGMA table_info(${tabla})`).all();
    const existentes = new Set(results.map((c) => c.name));
    for (const [nombre, tipo] of Object.entries(columnas)) {
      if (!existentes.has(nombre)) await db.prepare(`ALTER TABLE ${tabla} ADD COLUMN ${nombre} ${tipo}`).run();
    }
  }
}

let listo = false;

export async function prepararBase(db, env) {
  if (listo) return;
  await db.batch(ESQUEMA.map((sql) => db.prepare(sql)));
  await agregarColumnasFaltantes(db);
  await db
    .prepare(`INSERT OR IGNORE INTO ajustes (clave, valor) VALUES ('prompt', ?)`)
    .bind(PROMPT_POR_DEFECTO)
    .run();
  // Nombres para el saludo de cada vista. Se cambian en Ajustes.
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO ajustes (clave, valor) VALUES ('nombre_admin', 'Charlie')`),
    db.prepare(`INSERT OR IGNORE INTO ajustes (clave, valor) VALUES ('nombre_disenador', 'Luis')`),
  ]);
  const final = PROMPT_POR_DEFECTO.slice(PROMPT_POR_DEFECTO.lastIndexOf('\n\n') + 2);
  for (const anterior of FINALES_ANTERIORES) {
    await db
      .prepare(`UPDATE ajustes SET valor = ? WHERE clave = 'prompt' AND valor = ?`)
      .bind(PROMPT_POR_DEFECTO, PROMPT_POR_DEFECTO.replace(final, anterior))
      .run();
  }
  await prepararSesiones(db, env);
  listo = true;
}
