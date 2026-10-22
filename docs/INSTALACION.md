# Instalación (una sola vez)

Toma unos 20 minutos. Necesitas acceso a la organización de GitHub `CapacitacionDesarrolloUN`, un correo institucional y las dos contraseñas que vas a usar (administrador y diseñador).

> **Importante para el traspaso:** crea las cuentas de Cloudflare y de Google con un **correo institucional del área** (ideal: un buzón compartido de Capacitación), no con un correo personal. Si eso no es posible, usa tu correo institucional y agrega a un segundo miembro del área en cada cuenta (ver [TRASPASO.md](TRASPASO.md)).

## 1. Cloudflare: publicar la app

1. Crea una cuenta en <https://dash.cloudflare.com/sign-up>.
2. Activa R2: en el menú, **Storage & Databases → R2 Object Storage** y acepta el plan gratuito. Cloudflare pide registrar una tarjeta aunque no cobre. El plan gratis incluye 10 GB, y esta app usa muchísimo menos.
3. Ve a **Compute → Workers & Pages → Create → Import a repository**.
4. Conecta GitHub, autoriza la organización `CapacitacionDesarrolloUN` y elige el repo `programacion-cursos-abiertos`.
5. Deja los valores que propone (comando de despliegue `npx wrangler deploy`) y pulsa **Deploy**.

En el primer despliegue Cloudflare crea solo la base de datos `programacion-cursos` y el almacenamiento `programacion-cursos-imagenes`. Al terminar te da una dirección del tipo `https://programacion-cursos.<tu-cuenta>.workers.dev`.

Si el despliegue falla porque no pudo crear la base de datos o el almacenamiento, créalos a mano (D1 con nombre `programacion-cursos`; R2 con nombre `programacion-cursos-imagenes`). Después copia el **Database ID** de D1 en `wrangler.jsonc`, dentro de `d1_databases`, como `"database_id": "..."`, y vuelve a desplegar.

## 2. Google Gemini: generación de imágenes

1. Entra a <https://aistudio.google.com/apikey> con la cuenta institucional y crea una llave (**Create API key**).
2. Activa la facturación del proyecto (**Set up billing**). La generación de imágenes no está en el nivel gratuito. El costo es de unos US$0,039 por imagen. Como referencia, 80 imágenes al mes cuestan cerca de US$3.
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
2. En **Programar cursos**, registra un curso de prueba.
3. Sal, entra con la contraseña de diseñador y genera la imagen del curso para confirmar que la llave de Google funciona.

Listo. Guarda la dirección de la app en favoritos y compártela con el diseñador junto con su contraseña.
