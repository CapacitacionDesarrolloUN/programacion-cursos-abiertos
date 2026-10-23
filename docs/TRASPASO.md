# Traspaso de la app

Esta guía es para cuando cambia el administrador (quien programa los cursos) o el diseñador (quien genera las imágenes).

## Qué hay que traspasar

| Qué | Dónde | Quién lo tiene hoy |
|---|---|---|
| Dirección de la app | <https://programacion-cursos-abiertos.capacitacion-acb.workers.dev> | Cualquiera con el link (pide contraseña) |
| Contraseñas de administrador y diseñador | App → **Ajustes → Contraseñas** | Quien ocupa cada cargo |
| Cuenta de Cloudflare (hosting, base de datos e IA de imágenes) | <https://dash.cloudflare.com> | _(completar: correo dueño)_ |
| Repositorio del código | GitHub → `CapacitacionDesarrolloUN/programacion-cursos-abiertos` | Organización `CapacitacionDesarrolloUN` |

Mantén esta tabla al día. Edítala desde GitHub con el lápiz ✏️.

## Si se va el diseñador

1. El administrador entra a la app → **Ajustes → Contraseñas**.
2. Cambia la contraseña de *Diseñador* y se la entrega a quien llega.

Listo. Quien se fue ya no puede entrar, aunque recuerde la contraseña anterior. No hay que tocar Cloudflare ni GitHub.

## Si se va el administrador

Hazlo **antes del último día** de quien se va:

1. **App:** en **Ajustes → Contraseñas**, cambia la de *Administrador* y entrégasela a quien llega. Quien llega entra y comprueba que ve las pestañas Programar tareas, Vista diseñador y Ajustes.
2. **Cloudflare:** en **Manage Account → Members**, invita a quien llega como *Super Administrator*. Cuando acepte, quita al anterior. Si la cuenta usa un buzón compartido del área, basta con entregar ese acceso.
3. **Google (solo si se activó Gemini, que es opcional):** en <https://console.cloud.google.com/iam-admin/iam> agrega a quien llega como *Owner* del proyecto de la llave y como administrador de facturación. Después quita al anterior.
4. **GitHub:** pide a un dueño de la organización `CapacitacionDesarrolloUN` que agregue a quien llega. Si quien se va era el único dueño, primero debe hacer dueño a quien llega.
5. Actualiza la tabla de arriba.

## Recuperar el acceso si algo sale mal

- **Nadie recuerda la contraseña de administrador:** sigue los pasos de [MANTENIMIENTO.md](MANTENIMIENTO.md#olvidé-la-contraseña). Para eso se necesita acceso a la cuenta de Cloudflare.
- **Nadie tiene acceso a la cuenta de Cloudflare:** la app sigue funcionando, pero no se puede administrar. Hay que recuperar la cuenta con el correo dueño. Por eso conviene que ese correo sea un buzón del área y no personal.
- **"Demasiados intentos fallidos":** espera 15 minutos y vuelve a intentar.
