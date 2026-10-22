// Ingreso con contraseña por rol. Hay dos contraseñas: una para el administrador y otra
// para el diseñador. Se guardan cifradas (PBKDF2) en la tabla ajustes y el administrador
// puede cambiarlas desde la app. La primera vez se toman de los secretos CLAVE_ADMIN y
// CLAVE_DISENADOR del panel de Cloudflare.

export const ROLES = ['admin', 'disenador'];
const COOKIE = 'sesion';
const DURACION_DIAS = 30;
const ITERACIONES = 10000; // bajo a propósito: el plan gratuito limita el tiempo de CPU
const MAX_INTENTOS = 8;    // intentos fallidos por IP cada 15 minutos

const codificar = (bytes) => Buffer.from(bytes).toString('base64url');
const decodificar = (texto) => Uint8Array.from(Buffer.from(texto, 'base64url'));

async function leerAjuste(db, clave) {
  return (await db.prepare('SELECT valor FROM ajustes WHERE clave = ?').bind(clave).first())?.valor ?? null;
}

async function guardarAjuste(db, clave, valor) {
  await db
    .prepare('INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor')
    .bind(clave, valor)
    .run();
}

async function derivar(clave, sal) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: ITERACIONES }, base, 256,
  );
  return new Uint8Array(bits);
}

async function cifrarClave(clave) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERACIONES}$${codificar(sal)}$${codificar(await derivar(clave, sal))}`;
}

async function claveCoincide(clave, guardada) {
  const [, , sal, hash] = guardada.split('$');
  const calculado = await derivar(clave, decodificar(sal));
  const esperado = decodificar(hash);
  if (calculado.length !== esperado.length) return false;
  let diferencia = 0;
  for (let i = 0; i < calculado.length; i++) diferencia |= calculado[i] ^ esperado[i];
  return diferencia === 0;
}

// Prepara llave de firma y contraseñas iniciales si todavía no existen.
export async function prepararSesiones(db, env) {
  if (!(await leerAjuste(db, 'llave_sesion'))) {
    await guardarAjuste(db, 'llave_sesion', codificar(crypto.getRandomValues(new Uint8Array(32))));
  }
  const iniciales = { admin: env.CLAVE_ADMIN, disenador: env.CLAVE_DISENADOR };
  for (const rol of ROLES) {
    if (!(await leerAjuste(db, `clave_${rol}`)) && iniciales[rol]) {
      await guardarAjuste(db, `clave_${rol}`, await cifrarClave(iniciales[rol]));
    }
  }
}

async function llaveFirma(db) {
  const llave = await leerAjuste(db, 'llave_sesion');
  return crypto.subtle.importKey('raw', decodificar(llave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function crearToken(db, rol) {
  const version = (await leerAjuste(db, `version_${rol}`)) || '0';
  const datos = codificar(new TextEncoder().encode(JSON.stringify({
    rol, v: version, exp: Date.now() + DURACION_DIAS * 86400000,
  })));
  const firma = await crypto.subtle.sign('HMAC', await llaveFirma(db), new TextEncoder().encode(datos));
  return `${datos}.${codificar(new Uint8Array(firma))}`;
}

function leerCookie(request) {
  const cookies = request.headers.get('Cookie') || '';
  const par = cookies.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`));
  return par ? par.slice(COOKIE.length + 1) : null;
}

function cookieSesion(request, valor, maxAge) {
  const segura = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${valor}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${segura}`;
}

// Devuelve el rol de la sesión activa, o null.
export async function rolDeSesion(request, db) {
  const token = leerCookie(request);
  if (!token || !token.includes('.')) return null;
  const [datos, firma] = token.split('.');
  try {
    const valida = await crypto.subtle.verify(
      'HMAC', await llaveFirma(db), decodificar(firma), new TextEncoder().encode(datos),
    );
    if (!valida) return null;
    const { rol, v, exp } = JSON.parse(new TextDecoder().decode(decodificar(datos)));
    if (!ROLES.includes(rol) || exp < Date.now()) return null;
    // Si la contraseña cambió, las sesiones anteriores dejan de servir.
    if (((await leerAjuste(db, `version_${rol}`)) || '0') !== v) return null;
    return rol;
  } catch {
    return null;
  }
}

// Busca a qué rol pertenece una contraseña.
export async function rolDeClave(db, texto) {
  let hayClaves = false;
  if (!texto) return { rol: null, hayClaves };
  for (const rol of ROLES) {
    const guardada = await leerAjuste(db, `clave_${rol}`);
    if (!guardada) continue;
    hayClaves = true;
    if (await claveCoincide(texto, guardada)) return { rol, hayClaves };
  }
  return { rol: null, hayClaves };
}

// Revisa la contraseña. Devuelve { rol, cookie } o { error, estado }.
export async function ingresar(request, db, clave) {
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const { fallidos } = await db
    .prepare(`SELECT COUNT(*) AS fallidos FROM intentos WHERE ip = ? AND creado_en >= datetime('now', '-15 minutes')`)
    .bind(ip)
    .first();
  if (fallidos >= MAX_INTENTOS) {
    return { estado: 429, error: 'Demasiados intentos fallidos. Espera 15 minutos y vuelve a intentar.' };
  }

  const texto = String(clave || '');
  const { rol: rolEncontrado, hayClaves } = await rolDeClave(db, texto);
  if (!rolEncontrado) {
    if (!hayClaves && texto) {
      return { estado: 503, error: 'Todavía no hay contraseñas configuradas (CLAVE_ADMIN y CLAVE_DISENADOR). Ver docs/INSTALACION.md.' };
    }
    await db.batch([
      db.prepare('INSERT INTO intentos (ip) VALUES (?)').bind(ip),
      db.prepare(`DELETE FROM intentos WHERE creado_en < datetime('now', '-1 day')`),
    ]);
    return { estado: 401, error: 'Contraseña incorrecta.' };
  }
  const token = await crearToken(db, rolEncontrado);
  return { rol: rolEncontrado, cookie: cookieSesion(request, token, DURACION_DIAS * 86400) };
}

export function cookieSalida(request) {
  return cookieSesion(request, '', 0);
}

export async function cambiarClave(db, rol, nueva) {
  await guardarAjuste(db, `clave_${rol}`, await cifrarClave(nueva));
  const version = Number((await leerAjuste(db, `version_${rol}`)) || '0') + 1;
  await guardarAjuste(db, `version_${rol}`, String(version));
}
