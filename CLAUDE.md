# Notas para mantener este repo

App de Capacitación y Desarrollo (Uninorte) para programar cursos abiertos. La usan pocas personas, una vez por semana, y la mantendrán personas sin perfil técnico. Prioriza la simplicidad sobre lo novedoso.

- Todo el código, los textos y los comentarios van en español.
- Stack: Cloudflare Workers con assets estáticos, D1 y R2. La interfaz en `public/` es JS vanilla sin build. No agregues frameworks, bundlers ni dependencias de runtime sin una razón fuerte.
- `src/index.js` tiene la API y las rutas, `src/auth.js` verifica el JWT de Cloudflare Access, `src/db.js` tiene el esquema (se crea con `CREATE TABLE IF NOT EXISTS`; si cambias columnas, agrega un `ALTER TABLE` idempotente ahí mismo) y `src/imagen.js` la llamada a Gemini.
- Roles: `admin` y `colaborador`, guardados en la tabla `usuarios`. `ADMIN_INICIAL` (variable del panel) siempre es admin.
- `DEV_EMAIL` en `.dev.vars` simula la sesión, y solo en localhost. El encabezado `X-Dev-Email` permite probar otros roles en local.
- Prueba local: `npm run dev`. Sin `GEMINI_API_KEY`, la app devuelve una imagen gris de prueba.
- Despliegue: push a `main` y Workers Builds lo publica.
- Si cambias un flujo, actualiza `docs/` (INSTALACION, TRASPASO, MANTENIMIENTO).
