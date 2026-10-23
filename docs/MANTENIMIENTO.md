# Mantenimiento

La app casi no necesita mantenimiento. Estos son los casos que pueden aparecer con los años.

## "Se acabó el cupo gratis de imágenes de hoy"

Workers AI da gratis 10.000 "neuronas" al día, que alcanzan para unas 90 imágenes. El cupo se renueva todos los días a las 7:00 p. m. (hora de Colombia). Si ese límite se queda corto, hay dos opciones de pago: activar **Workers Paid** en Cloudflare (US$5 al mes) o usar Google Gemini (ver el final de INSTALACION.md).

## Cloudflare retira el modelo de imágenes

**Síntoma:** al generar aparece un error de Workers AI que dice que el modelo no existe.

**Solución:** busca un modelo de texto a imagen vigente en <https://developers.cloudflare.com/workers-ai/models/>. Después, en GitHub, edita `wrangler.jsonc` y cambia `IMAGEN_MODELO` (en los dos lugares donde aparece). Al guardar en `main`, la app se publica sola en uno o dos minutos. Si el modelo nuevo no usa formulario multipart como FLUX.2, hay que ajustar `src/imagen.js`.

## Las imágenes no salen como se quiere

Un administrador puede ajustar la instrucción en **Ajustes → Instrucción para las imágenes**. `{titulo}` se reemplaza por el nombre del curso. El diseñador también puede escribir una indicación puntual en cada curso, por ejemplo "personas en un laboratorio".

## Cambiar la página que abre "Generar link de Zoom"

En GitHub, edita `wrangler.jsonc` y cambia `ZOOM_URL`. Por ejemplo, puedes usar la página de programar reuniones de la cuenta institucional de Zoom.

## Espacio de la base de datos

Cada imagen ocupa cerca de 1 MB en D1, y el plan gratuito incluye 5 GB: alcanza para miles de imágenes. Si algún día se llena, borra tareas viejas desde la app (se borran con su imagen).

## Revisar el gasto

- En la app: **Ajustes** muestra cuántas imágenes quedan hoy del cupo gratis (cálculo aproximado con base en `IMAGENES_DIA` de `wrangler.jsonc`) y cuántas se generaron en el mes. Con Workers AI el costo es cero.
- Solo si se activó Google Gemini: el gasto real está en Google Cloud Billing.

## Olvidé el código (contraseña)

1. En Cloudflare → Worker → **Settings → Variables and Secrets**, pon una contraseña nueva en `CLAVE_ADMIN` (o `CLAVE_DISENADOR`) y despliega.
2. En Cloudflare → **D1 → programacion-cursos → Console**, ejecuta:
   ```sql
   DELETE FROM ajustes WHERE clave = 'clave_admin';
   ```
   (o `'clave_disenador'` para la del diseñador).
3. Abre la app. En ese momento toma la contraseña del secreto. Ya puedes entrar y, si quieres, cambiarla desde **Ajustes**.

## Si se usa Google Gemini (opcional, de pago)

- **Cambiar la llave:** crea una nueva en <https://aistudio.google.com/apikey>, edita el secreto `GEMINI_API_KEY` en el Worker y borra la anterior en AI Studio.
- **Google retira el modelo:** busca el vigente en <https://ai.google.dev/gemini-api/docs/models> y cambia `GEMINI_MODEL` en `wrangler.jsonc`.
- **Volver a lo gratis:** borra el secreto `GEMINI_API_KEY`.

## Ver errores

En Cloudflare → Worker → **Observability** están los registros de cada petición, incluidos los errores.

## Copia de seguridad de las tareas

En Cloudflare → **D1 → programacion-cursos → Console**, ejecuta `SELECT * FROM cursos ORDER BY fecha;` y exporta el resultado. D1 también guarda puntos de restauración de los últimos 30 días (**Time Travel**).

## Logotipos de marcas en las imágenes

Si el nombre de un curso menciona una marca conocida (Excel, Power BI, Python, Canva, Teams…), la app le pide a la IA que ponga su logotipo en algún lugar de la foto, por ejemplo en la pantalla de un portátil. La lista está en `src/imagen.js` (`MARCAS`): para agregar una marca, copia una línea y cambia el nombre oficial y la palabra que la delata en el título. La IA gratuita reproduce los logos de forma aproximada; si uno sale mal, genera de nuevo o escribe en *Indicación opcional* algo como «sin logotipo».

## Horas de las tareas

Hora inicio y hora fin se escriben a mano como en la agenda de Capacitación: «200», «2:00», «230» o «14:00». AM/PM se elige solo (de 7:00 a 11:59 es a.m.; de 12:00 a 6:59, p.m.) y se puede cambiar con los botones. Al pegar desde Excel, las columnas van en este orden: Actividad, Fecha, Hora inicio, Hora fin, Link del curso, Link de Zoom, Fecha del boletín y Observaciones (opcional).

## Observaciones

Funcionan igual que en la agenda: el administrador las escribe al programar o editar una tarea, el diseñador las ve en un recuadro rojo con una bandera «!» y las marca como *Realizado*. Si el administrador cambia el texto, vuelven a quedar pendientes. En la lista del administrador se ve si cada observación está pendiente o atendida.

## Tareas que llegan desde la agenda

El botón **Añadir a cursos abiertos** de la agenda crea la tarea aquí sin pedir código, igual que la agenda deja editar sin login. Para que ninguna otra página pueda hacerlo, la app solo acepta esas tareas desde la dirección de la agenda, que está en `AGENDA_ORIGEN` dentro de `wrangler.jsonc` (hoy `https://capacitaciondesarrolloun.github.io`). Si la agenda se muda de dirección y el botón dice «Solo la agenda puede enviar tareas por aquí», cambia ese valor desde GitHub con el lápiz ✏️.
