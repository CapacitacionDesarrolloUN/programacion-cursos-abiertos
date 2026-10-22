# Instalación (una sola vez)

Toma unos 30 minutos. Necesitas acceso a la organización de GitHub `CapacitacionDesarrolloUN` y un correo institucional.

> **Importante para el traspaso:** crea las cuentas de Cloudflare y de Google con un **correo institucional del área** (ideal: un buzón compartido de Capacitación), no con un correo personal. Si eso no es posible, usa tu correo institucional y agrega a un segundo miembro del área en cada cuenta (ver [TRASPASO.md](TRASPASO.md)).

## 1. Cloudflare: publicar la app

1. Crea una cuenta en <https://dash.cloudflare.com/sign-up>.
2. Activa R2: en el menú, **Storage & Databases → R2 Object Storage** y acepta el plan gratuito. Cloudflare pide registrar una tarjeta aunque no cobre. El plan gratis incluye 10 GB, y esta app usa muchísimo menos.
3. Ve a **Compute → Workers & Pages → Create → Import a repository**.
4. Conecta GitHub, autoriza la organización `CapacitacionDesarrolloUN` y elige el repo `programacion-cursos-abiertos`.
5. Deja los valores que propone (comando de despliegue `npx wrangler deploy`) y pulsa **Deploy**.

En el primer despliegue Cloudflare crea solo la base de datos `programacion-cursos` y el almacenamiento `programacion-cursos-imagenes`. Al terminar te da una dirección del tipo `https://programacion-cursos.<tu-cuenta>.workers.dev`.

Si el despliegue falla porque no pudo crear la base de datos o el almacenamiento, créalos a mano (D1 con nombre `programacion-cursos`; R2 con nombre `programacion-cursos-imagenes`). Después copia el **Database ID** de D1 en `wrangler.jsonc`, dentro de `d1_databases`, como `"database_id": "..."`, y vuelve a desplegar.

## 2. Inicio de sesión (Cloudflare Access)

1. En el Worker: **Settings → Domains & Routes**. En la fila `workers.dev`, activa **Cloudflare Access**. Si Cloudflare pide un nombre de equipo para Zero Trust, elige uno corto, por ejemplo `capacitacion-uninorte`. El plan gratuito sirve hasta para 50 personas.
2. Ve a **Zero Trust → Access → Applications**, abre la aplicación que se creó y edita su política:
   - Action: **Allow**
   - Include: **Emails ending in** `@uninorte.edu.co`

   Así entra cualquier correo de Uninorte al inicio de sesión, pero la app solo deja pasar a quien esté en su lista de accesos. Gracias a eso, los cambios de personas se hacen desde la app y no hay que volver a Cloudflare.
3. Copia dos datos:
   - En la aplicación de Access: **Application Audience (AUD) Tag**.
   - En **Zero Trust → Settings**: el **team domain**, por ejemplo `capacitacion-uninorte.cloudflareaccess.com`.

## 3. Google Gemini: generación de imágenes

1. Entra a <https://aistudio.google.com/apikey> con la cuenta institucional y crea una llave (**Create API key**).
2. Activa la facturación del proyecto (**Set up billing**). La generación de imágenes no está en el nivel gratuito. El costo es de unos US$0,039 por imagen. Como referencia, 80 imágenes al mes cuestan cerca de US$3.
3. Recomendado: en Google Cloud Billing, crea un **presupuesto con alerta** de US$10 al mes para enterarte de cualquier uso fuera de lo normal.

## 4. Variables del Worker

En el Worker: **Settings → Variables and Secrets → Add**:

| Nombre | Tipo | Valor |
|---|---|---|
| `GEMINI_API_KEY` | Secret | La llave de Google AI Studio |
| `ACCESS_TEAM_DOMAIN` | Text | El team domain del paso 2 |
| `ACCESS_AUD` | Text | El AUD Tag del paso 2 |
| `ADMIN_INICIAL` | Text | Tu correo, por ejemplo `nombre@uninorte.edu.co` |

Guarda los cambios (**Deploy**). `ADMIN_INICIAL` siempre es administrador. Sirve para el primer ingreso y para recuperar el acceso si algún día la app queda sin administradores.

## 5. Primer uso

1. Abre la dirección `workers.dev`, escribe tu correo y pon el código que te llega.
2. En **Accesos**, agrega el correo del colaborador con rol *Colaborador*.
3. En **Programar cursos**, registra un curso de prueba. Luego, en **Vista colaborador**, genera su imagen para confirmar que la llave de Google funciona.

Listo. Guarda la dirección de la app en favoritos y compártela con el colaborador.
