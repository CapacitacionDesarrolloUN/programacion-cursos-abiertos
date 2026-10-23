# Instalación (una sola vez)

Toma unos 20 minutos. Necesitas acceso a la organización de GitHub `CapacitacionDesarrolloUN`, un correo institucional y las dos contraseñas que vas a usar (administrador y diseñador).

> **Importante para el traspaso:** crea las cuentas de Cloudflare y de Google con un **correo institucional del área** (ideal: un buzón compartido de Capacitación), no con un correo personal. Si eso no es posible, usa tu correo institucional y agrega a un segundo miembro del área en cada cuenta (ver [TRASPASO.md](TRASPASO.md)).

## 1. Cloudflare: publicar la app

El plan gratuito de Cloudflare alcanza para esta app y **no pide tarjeta**. La app no usa R2, que es el servicio de Cloudflare que sí la pide: las imágenes se guardan comprimidas en la base de datos.

1. Crea una cuenta en <https://dash.cloudflare.com/sign-up>.
2. Ve a **Compute → Workers & Pages → Create → Import a repository**.
3. Conecta GitHub, autoriza la organización `CapacitacionDesarrolloUN` y elige el repo `programacion-cursos-abiertos`.
4. Deja los valores que propone (comando de despliegue `npx wrangler deploy`) y pulsa **Deploy**.

En el primer despliegue Cloudflare crea sola la base de datos `programacion-cursos`. Al terminar te da una dirección del tipo `https://programacion-cursos-abiertos.<tu-cuenta>.workers.dev`.

Si el despliegue falla porque no pudo crear la base de datos, créala a mano en **Storage & Databases → D1** con el nombre `programacion-cursos`. Después copia su **Database ID** en `wrangler.jsonc`, dentro de `d1_databases`, como `"database_id": "..."`, y vuelve a desplegar.

## 2. Google Gemini: generación de imágenes

1. Entra a <https://aistudio.google.com/apikey> con la cuenta institucional y crea una llave (**Create API key**).
2. Activa la facturación del proyecto (**Set up billing**). Aquí sí se necesita un medio de pago: Google no incluye la generación de imágenes por API en su nivel gratuito. El costo es de unos US$0,04 a US$0,07 por imagen. Como referencia, 80 imágenes al mes cuestan entre US$3 y US$6. Si es posible, usa una tarjeta institucional del área.
3. Recomendado: en Google Cloud Billing, crea un **presupuesto con alerta** de US$10 al mes para enterarte de cualquier uso fuera de lo normal.

## 3. Contraseñas y llave

En el Worker: **Settings → Variables and Secrets → Add**. Agrega los tres como tipo **Secret**:

| Nombre | Valor |
|---|---|
| `GEMINI_API_KEY` | La llave de Google AI Studio |
| `CLAVE_ADMIN` | Contraseña inicial del administrador |
| `CLAVE_DISENADOR` | Contraseña inicial del diseñador |

Guarda los cambios (**Deploy**). Las contraseñas **nunca** se escriben en el código, porque el repositorio es público.

Las dos contraseñas solo se leen de aquí la primera vez. Después viven cifradas en la base de datos y se cambian desde la app, en **Ajustes → Contraseñas**. Por eso, cambiar estos secretos más adelante no tiene efecto; para recuperar el acceso, ver [MANTENIMIENTO.md](MANTENIMIENTO.md).

## 4. Primer uso

1. Abre la dirección `workers.dev` y entra con la contraseña de administrador.
2. Con **+ Programar tarea**, crea una tarea de prueba.
3. Sal, entra con la contraseña de diseñador y genera la imagen de esa tarea para confirmar que la llave de Google funciona.

Listo. Guarda la dirección de la app en favoritos y compártela con el diseñador junto con su contraseña.
