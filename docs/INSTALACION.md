# Instalación (una sola vez)

Toma unos 15 minutos y **no pide tarjeta**. Necesitas acceso a la organización de GitHub `CapacitacionDesarrolloUN`, un correo institucional y las dos contraseñas que vas a usar (administrador y diseñador).

> **Importante para el traspaso:** crea la cuenta de Cloudflare con un **correo institucional del área** (ideal: un buzón compartido de Capacitación), no con un correo personal. Si eso no es posible, usa tu correo institucional y agrega a un segundo miembro del área en la cuenta (ver [TRASPASO.md](TRASPASO.md)).

## 1. Cloudflare: publicar la app

El plan gratuito de Cloudflare alcanza para esta app y **no pide tarjeta**. Las imágenes las genera la IA de Cloudflare (Workers AI), que es gratis hasta unas 90 imágenes al día. La app no usa R2, que es el servicio de Cloudflare que sí pide tarjeta: las imágenes se guardan comprimidas en la base de datos.

1. Crea una cuenta en <https://dash.cloudflare.com/sign-up>.
2. Ve a **Compute → Workers & Pages → Create → Import a repository**.
3. Conecta GitHub, autoriza la organización `CapacitacionDesarrolloUN` y elige el repo `programacion-cursos-abiertos`.
4. Deja los valores que propone (comando de despliegue `npx wrangler deploy`) y pulsa **Deploy**.

En el primer despliegue Cloudflare crea sola la base de datos `programacion-cursos`. Al terminar te da una dirección del tipo `https://programacion-cursos-abiertos.<tu-cuenta>.workers.dev`.

Si el despliegue falla porque no pudo crear la base de datos, créala a mano en **Storage & Databases → D1** con el nombre `programacion-cursos`. Después copia su **Database ID** en `wrangler.jsonc`, dentro de `d1_databases`, como `"database_id": "..."`, y vuelve a desplegar.

## 2. Contraseñas

En el Worker: **Settings → Variables and Secrets → Add**. Agrega las dos como tipo **Secret**, no como *Variable*:

| Nombre | Valor |
|---|---|
| `CLAVE_ADMIN` | Contraseña inicial del administrador |
| `CLAVE_DISENADOR` | Contraseña inicial del diseñador |

Si Cloudflare muestra un aviso amarillo que propone copiar valores a `wrangler.jsonc`, ciérralo y no lo sigas.

Guarda los cambios (**Deploy**). Las contraseñas **nunca** se escriben en el código, porque el repositorio es público.

Las dos contraseñas solo se leen de aquí la primera vez. Después viven cifradas en la base de datos y se cambian desde la app, en **Ajustes → Códigos de acceso** (en la app se les llama «código»). Por eso, cambiar estos secretos más adelante no tiene efecto; para recuperar el acceso, ver [MANTENIMIENTO.md](MANTENIMIENTO.md).

## 3. Primer uso

1. Abre la dirección `workers.dev` y entra con la contraseña de administrador.
2. Con **+ Programar tarea**, crea una tarea de prueba.
3. Sal, entra con la contraseña de diseñador y genera la imagen de esa tarea.

4. En **Ajustes → Nombres del saludo**, escribe el nombre de cada persona (por defecto: Charlie y Luis).

Listo. Guarda la dirección de la app en favoritos y compártela con el diseñador junto con su código.

## Opcional: imágenes con Google Gemini (de pago)

Si algún día se quiere otra calidad de imagen y el área acepta pagar (unos US$0,04 a US$0,07 por imagen, con tarjeta), crea una llave en <https://aistudio.google.com/apikey>, activa la facturación y agrégala en el Worker como secreto `GEMINI_API_KEY`. La app la usa automáticamente en lugar de Workers AI. Si borras el secreto, vuelve a Workers AI, que es gratis.
