# Programación de cursos abiertos

App web de Capacitación y Desarrollo (Uninorte) para programar los cursos abiertos. Reemplaza el Excel que se usaba antes.

Tiene dos caras, y se entra a cada una con su propia contraseña:

- **Administrador.** Registra cada curso (nombre, fecha y link de Brightspace), uno por uno o pegando varias filas desde Excel. También cambia las contraseñas y ajusta la instrucción que recibe la IA para las imágenes.
- **Diseñador.** Ve los próximos cursos, copia cada dato con un clic y genera para cada curso una imagen realista y sin texto, que luego descarga.

## Documentación

| Documento | Para qué |
|---|---|
| [docs/INSTALACION.md](docs/INSTALACION.md) | Poner la app en línea por primera vez (Cloudflare y Google AI Studio). |
| [docs/TRASPASO.md](docs/TRASPASO.md) | Qué hacer cuando cambia la persona responsable. **Léelo si acabas de heredar la app.** |
| [docs/MANTENIMIENTO.md](docs/MANTENIMIENTO.md) | Cambios frecuentes: modelo de IA, costos, problemas comunes. |

## Cómo está hecha

- **Cloudflare Workers** sirve la página y la API (`src/`), con plan gratuito.
- **Cloudflare D1** es la base de datos (cursos, ajustes y contraseñas cifradas). Las tablas se crean solas.
- **Cloudflare R2** guarda las imágenes generadas.
- **Ingreso con contraseña:** hay una para el administrador y otra para el diseñador. Se guardan cifradas, se pueden cambiar desde **Ajustes** y la app bloquea la entrada por 15 minutos después de 8 intentos fallidos.
- **Google Gemini** ("Nano Banana") genera las imágenes, a unos US$0,039 por imagen.
- La interfaz (`public/`) es HTML, CSS y JavaScript sin frameworks ni compilación, para que no se desactualice con los años.

Cada cambio que llega a la rama `main` en GitHub se publica solo en Cloudflare.

## Probar en tu computador

```bash
npm install
cp .dev.vars.example .dev.vars   # contraseñas de prueba
npm run dev                      # abre http://localhost:8787
```

Con `IMAGEN_DE_PRUEBA=1` y sin `GEMINI_API_KEY`, la app genera una imagen gris de prueba y no gasta créditos.
