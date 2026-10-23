# Notas para mantener este repo

App de Capacitación y Desarrollo (Uninorte) para programar cursos abiertos. La usan pocas personas, una vez por semana, y la mantendrán personas sin perfil técnico. Prioriza la simplicidad sobre lo novedoso.

- Todo el código, los textos y los comentarios van en español.
- Stack: Cloudflare Workers con assets estáticos y D1. No uses R2: pide tarjeta y la cuenta debe quedar sin tarjeta. Las imágenes van en la tabla `imagenes` (base64), comprimidas a JPEG en el navegador; `POST /imagen` genera y devuelve sin guardar, y `PUT /imagen` guarda. La interfaz en `public/` es JS vanilla sin build. No agregues frameworks, bundlers ni dependencias de runtime sin una razón fuerte.
- `src/index.js` tiene la API y las rutas, `src/sesion.js` maneja el ingreso por contraseña (PBKDF2 en la tabla `ajustes`, cookie firmada con HMAC y versión por rol para invalidar sesiones al cambiar la clave, límite de intentos por IP), `src/db.js` tiene el esquema (se crea con `CREATE TABLE IF NOT EXISTS`; si cambias columnas, agrega un `ALTER TABLE` idempotente ahí mismo) y `src/imagen.js` la llamada a Gemini.
- En la interfaz, los cursos se llaman "tareas". En la base de datos siguen en la tabla `cursos`, con `link_zoom`, `fecha_boletin` y `estado` (`pendiente` o `lista`). `aviso_visto = 0` marca una tarea que el diseñador terminó y el admin no ha visto (banner y contador en la pestaña, revisión cada minuto).
- Roles: `admin` y `disenador`, sin cuentas individuales: cada rol tiene una contraseña. Las iniciales salen de los secretos `CLAVE_ADMIN` y `CLAVE_DISENADOR` solo si no hay una guardada. Nunca pongas contraseñas en el repo, porque es público.
- Prueba local: `cp .dev.vars.example .dev.vars && npm run dev`. Con `IMAGEN_DE_PRUEBA=1` y sin `GEMINI_API_KEY`, la app devuelve una imagen gris de prueba.
- Despliegue: push a `main` y Workers Builds lo publica.
- Si cambias un flujo, actualiza `docs/` (INSTALACION, TRASPASO, MANTENIMIENTO).
