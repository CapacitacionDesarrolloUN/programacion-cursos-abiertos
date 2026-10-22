// Identifica a la persona que entra. El inicio de sesión lo hace Cloudflare Access
// (código al correo); aquí solo se verifica la firma del token que Access agrega
// a cada petición y se lee el correo.

let certsCache = { dominio: null, llaves: null, vence: 0 };

function base64UrlABytes(texto) {
  const b64 = texto.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}

function base64UrlAJson(texto) {
  return JSON.parse(new TextDecoder().decode(base64UrlABytes(texto)));
}

function limpiarDominio(dominio) {
  return (dominio || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

async function obtenerLlaves(dominio) {
  if (certsCache.dominio === dominio && certsCache.vence > Date.now()) return certsCache.llaves;
  const res = await fetch(`https://${dominio}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`No se pudieron leer las llaves de Access (${res.status})`);
  const { keys } = await res.json();
  certsCache = { dominio, llaves: keys, vence: Date.now() + 60 * 60 * 1000 };
  return keys;
}

async function verificarTokenAccess(token, env) {
  const dominio = limpiarDominio(env.ACCESS_TEAM_DOMAIN);
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const [h, p, firma] = partes;
  const encabezado = base64UrlAJson(h);
  const datos = base64UrlAJson(p);

  const llaves = await obtenerLlaves(dominio);
  const jwk = llaves.find((k) => k.kid === encabezado.kid);
  if (!jwk) return null;

  const llave = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
  );
  const valido = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', llave, base64UrlABytes(firma), new TextEncoder().encode(`${h}.${p}`),
  );
  if (!valido) return null;

  const ahora = Math.floor(Date.now() / 1000);
  const audiencias = Array.isArray(datos.aud) ? datos.aud : [datos.aud];
  if (datos.exp && datos.exp < ahora) return null;
  if (!audiencias.includes(env.ACCESS_AUD.trim())) return null;
  if (datos.iss !== `https://${dominio}`) return null;
  return datos.email ? String(datos.email).toLowerCase() : null;
}

// Devuelve { email } o { error, estado }.
export async function identificar(request, env) {
  const url = new URL(request.url);
  const esLocal = ['localhost', '127.0.0.1'].includes(url.hostname);

  // Solo para desarrollo en el computador: DEV_EMAIL en .dev.vars.
  if (esLocal && env.DEV_EMAIL) {
    return { email: (request.headers.get('X-Dev-Email') || env.DEV_EMAIL).toLowerCase() };
  }

  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    return { estado: 503, error: 'Falta configurar Cloudflare Access (ACCESS_TEAM_DOMAIN y ACCESS_AUD). Ver docs/INSTALACION.md.' };
  }
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return { estado: 401, error: 'Inicia sesión para continuar.' };

  try {
    const email = await verificarTokenAccess(token, env);
    if (!email) return { estado: 401, error: 'La sesión no es válida o venció. Recarga la página.' };
    return { email };
  } catch (e) {
    return { estado: 500, error: `No se pudo verificar la sesión: ${e.message}` };
  }
}

export function esAdminInicial(email, env) {
  return (env.ADMIN_INICIAL || '')
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean)
    .includes(email);
}
