import { prepararSesiones } from './sesion.js';

// Estructura de la base de datos. Las tablas se crean solas la primera vez que
// la app recibe una petición, así no hay que correr migraciones a mano.

export const PROMPT_POR_DEFECTO = `A realistic, natural-looking photograph that represents the training course titled "{titulo}". The image should capture and convey the essence of the topic as completely as possible, showing real people, places or objects related to it in an authentic workplace or learning setting.

Style: candid documentary photography, natural light, true-to-life colors, real skin texture and small everyday imperfections, shot on a full-frame camera with a 35mm lens. It must not look artificial, staged, CGI, 3D rendered, illustrated or overly polished.

Strictly no text of any kind: no letters, words, numbers, captions, signs, screens with writing, logos or watermarks.`;

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
  await prepararSesiones(db, env);
  listo = true;
}
