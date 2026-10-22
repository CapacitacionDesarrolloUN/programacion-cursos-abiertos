# Traspaso de la app

Esta guía es para cuando cambia el administrador (quien programa los cursos) o el colaborador (quien genera las imágenes).

## Qué hay que traspasar

| Qué | Dónde | Quién lo tiene hoy |
|---|---|---|
| Acceso a la app | App → pestaña **Accesos** | Lista dentro de la app |
| Administrador fijo de respaldo | Cloudflare → Worker → Settings → Variables → `ADMIN_INICIAL` | _(completar)_ |
| Cuenta de Cloudflare (hosting, base de datos, inicio de sesión) | <https://dash.cloudflare.com> | _(completar: correo dueño)_ |
| Cuenta de Google AI Studio y su facturación (imágenes) | <https://aistudio.google.com> y Google Cloud Billing | _(completar: correo dueño)_ |
| Repositorio del código | GitHub → `CapacitacionDesarrolloUN/programacion-cursos-abiertos` | Organización `CapacitacionDesarrolloUN` |

Mantén esta tabla al día. Edítala desde GitHub con el lápiz ✏️.

## Si se va el colaborador

1. El administrador entra a la app → **Accesos**.
2. Agrega el correo del nuevo colaborador con rol *Colaborador*.
3. Quita el acceso del anterior.

Listo. No hay que tocar Cloudflare ni GitHub.

## Si se va el administrador

Hazlo **antes del último día** de quien se va:

1. **App:** en **Accesos**, agrega a quien llega con rol *Administrador*. Quien llega entra y comprueba que ve las cuatro pestañas. Después quita el acceso del anterior.
2. **Administrador de respaldo:** en Cloudflare → Worker → **Settings → Variables and Secrets**, cambia `ADMIN_INICIAL` por el correo de quien llega y despliega.
3. **Cloudflare:** en **Manage Account → Members**, invita a quien llega como *Super Administrator*. Cuando acepte, quita al anterior. Si la cuenta usa un buzón compartido del área, basta con entregar ese acceso.
4. **Google AI Studio / Google Cloud:** en <https://console.cloud.google.com/iam-admin/iam>, en el proyecto de la llave, agrega a quien llega como *Owner*. En **Billing → Account management**, agrégalo como *Billing Account Administrator*. Después quita al anterior. Si la tarjeta registrada era personal, cámbiala por la institucional.
5. **GitHub:** pide a un dueño de la organización `CapacitacionDesarrolloUN` que agregue a quien llega. Si quien se va era el único dueño, primero debe hacer dueño a quien llega.
6. Actualiza la tabla de arriba.

## Recuperar el acceso si algo sale mal

- **Nadie puede entrar como administrador:** pon tu correo en `ADMIN_INICIAL` (paso 2 de arriba). Para eso necesitas acceso a la cuenta de Cloudflare.
- **Nadie tiene acceso a la cuenta de Cloudflare:** la app sigue funcionando, pero no se puede administrar. Hay que recuperar la cuenta con el correo dueño. Por eso conviene que ese correo sea un buzón del área y no personal.
- **No llega el código de inicio de sesión:** revisa el correo no deseado. El remitente es Cloudflare Access.
