# Programación de cursos abiertos

App web de Capacitación y Desarrollo (Uninorte) para programar los cursos abiertos. Reemplaza el Excel que se usaba antes.

Tiene dos caras, y se entra a cada una con su propia contraseña:

- **Administrador.** Con el botón **Programar tarea** le asigna al diseñador cada curso: nombre de la actividad, fecha, link del curso (Brightspace), link de Zoom (con un botón que abre Zoom para crear la reunión) y fecha de publicación en el boletín. También puede pegar varias filas desde Excel, cambiar las contraseñas y ajustar la instrucción que recibe la IA para las imágenes.
- **Diseñador.** Ve sus **tareas pendientes**, ordenadas por fecha de boletín y con aviso cuando están por vencer o atrasadas. Copia cada dato con un clic, genera una imagen realista y sin texto, la descarga y marca la tarea como lista. Al administrador le llega un aviso dentro de la app (y un contador en la pestaña) cada vez que el diseñador termina una tarea. En la sección **Tareas realizadas** ve cada una con su imagen y la fecha en que se terminó.

## Documentación

| Documento | Para qué |
|---|---|
| [docs/INSTALACION.md](docs/INSTALACION.md) | Poner la app en línea por primera vez (Cloudflare y Google AI Studio). |
| [docs/TRASPASO.md](docs/TRASPASO.md) | Qué hacer cuando cambia la persona responsable. **Léelo si acabas de heredar la app.** |
| [docs/MANTENIMIENTO.md](docs/MANTENIMIENTO.md) | Cambios frecuentes: modelo de IA, costos, problemas comunes. |

## Cómo está hecha

- **Cloudflare Workers** sirve la página y la API (`src/`), con plan gratuito.
- **Cloudflare D1** es la base de datos (tareas, imágenes, ajustes y contraseñas cifradas). Las tablas y columnas nuevas se crean solas. No se usa R2, para que la cuenta de Cloudflare no pida tarjeta.
- Las imágenes se comprimen a JPEG en el navegador antes de guardarse (máximo 1600 px y unos 1,3 MB), porque D1 acepta hasta 2 MB por registro.
- **Ingreso con contraseña:** hay una para el administrador y otra para el diseñador. Se guardan cifradas, se pueden cambiar desde **Ajustes** y la app bloquea la entrada por 15 minutos después de 8 intentos fallidos.
- **Google Gemini** ("Nano Banana", modelo `gemini-3.1-flash-lite-image`) genera las imágenes, a unos US$0,04 a US$0,07 por imagen.
- La interfaz (`public/`) es HTML, CSS y JavaScript sin frameworks ni compilación, para que no se desactualice con los años.

Cada cambio que llega a la rama `main` en GitHub se publica solo en Cloudflare.

## Probar en tu computador

```bash
npm install
cp .dev.vars.example .dev.vars   # contraseñas de prueba
npm run dev                      # abre http://localhost:8787
```

Con `IMAGEN_DE_PRUEBA=1` y sin `GEMINI_API_KEY`, la app genera una imagen gris de prueba y no gasta créditos.
