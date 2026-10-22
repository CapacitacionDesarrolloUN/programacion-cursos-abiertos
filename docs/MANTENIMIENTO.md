# Mantenimiento

La app casi no necesita mantenimiento. Estos son los casos que pueden aparecer con los años.

## Google retira el modelo de imágenes

**Síntoma:** al generar aparece un error de Google Gemini que habla de un modelo no encontrado o retirado.

**Solución:** busca el modelo de imágenes vigente en <https://ai.google.dev/gemini-api/docs/models>. Después, en GitHub, edita `wrangler.jsonc` y cambia `GEMINI_MODEL` por el nombre nuevo. Al guardar en `main`, la app se publica sola en uno o dos minutos. Si el modelo nuevo tiene otro precio, actualiza también `COSTO_IMAGEN_USD`.

## Las imágenes no salen como se quiere

Un administrador puede ajustar la instrucción en **Ajustes → Instrucción para las imágenes**. `{titulo}` se reemplaza por el nombre del curso. El diseñador también puede escribir una indicación puntual en cada curso, por ejemplo "personas en un laboratorio".

## Revisar el gasto

- En la app: **Ajustes** muestra cuántas imágenes se generaron en el mes y su costo aproximado.
- El gasto real está en Google Cloud Billing, en la cuenta asociada a la llave.

## Error "exceeded CPU" o la app responde lento

El plan gratuito de Cloudflare Workers limita el tiempo de procesamiento por petición. Si al generar imágenes aparece ese error de forma repetida, activa **Workers Paid** (US$5 al mes) en Cloudflare → Workers & Pages → Plans.

## Olvidé la contraseña

1. En Cloudflare → Worker → **Settings → Variables and Secrets**, pon una contraseña nueva en `CLAVE_ADMIN` (o `CLAVE_DISENADOR`) y despliega.
2. En Cloudflare → **D1 → programacion-cursos → Console**, ejecuta:
   ```sql
   DELETE FROM ajustes WHERE clave = 'clave_admin';
   ```
   (o `'clave_disenador'` para la del diseñador).
3. Abre la app. En ese momento toma la contraseña del secreto. Ya puedes entrar y, si quieres, cambiarla desde **Ajustes**.

## Cambiar la llave de Google

Crea una llave nueva en <https://aistudio.google.com/apikey>. Después, en Cloudflare → Worker → **Settings → Variables and Secrets**, edita `GEMINI_API_KEY` y despliega. Por último, borra la llave anterior en AI Studio.

## Ver errores

En Cloudflare → Worker → **Observability** están los registros de cada petición, incluidos los errores.

## Copia de seguridad de los cursos

En Cloudflare → **D1 → programacion-cursos → Console**, ejecuta `SELECT * FROM cursos ORDER BY fecha;` y exporta el resultado. D1 también guarda puntos de restauración de los últimos 30 días (**Time Travel**).
