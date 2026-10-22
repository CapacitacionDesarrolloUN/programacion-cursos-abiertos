# Programación de cursos abiertos

App web de Capacitación y Desarrollo (Uninorte) para programar los cursos abiertos. Reemplaza el Excel que se usaba antes.

Tiene dos caras:

- **Administrador.** Registra cada curso (nombre, fecha y link de Brightspace), uno por uno o pegando varias filas desde Excel. También decide quién tiene acceso y ajusta la instrucción que recibe la IA para las imágenes.
- **Colaborador.** Ve los próximos cursos, copia cada dato con un clic y genera para cada curso una imagen realista y sin texto, que luego descarga.

## Documentación

| Documento | Para qué |
|---|---|
| [docs/INSTALACION.md](docs/INSTALACION.md) | Poner la app en línea por primera vez (Cloudflare, Google AI Studio, acceso). |
| [docs/TRASPASO.md](docs/TRASPASO.md) | Qué hacer cuando cambia la persona responsable. **Léelo si acabas de heredar la app.** |
| [docs/MANTENIMIENTO.md](docs/MANTENIMIENTO.md) | Cambios frecuentes: modelo de IA, costos, problemas comunes. |

## Cómo está hecha

- **Cloudflare Workers** sirve la página y la API (`src/`), con plan gratuito.
- **Cloudflare D1** es la base de datos (cursos, personas con acceso, ajustes). Las tablas se crean solas.
- **Cloudflare R2** guarda las imágenes generadas.
- **Cloudflare Access** pide el inicio de sesión con un código enviado al correo. La app solo deja entrar a los correos de su lista de accesos.
- **Google Gemini** ("Nano Banana") genera las imágenes, a unos US$0,039 por imagen.
- La interfaz (`public/`) es HTML, CSS y JavaScript sin frameworks ni compilación, para que no se desactualice con los años.

Cada cambio que llega a la rama `main` en GitHub se publica solo en Cloudflare.

## Probar en tu computador

```bash
npm install
cp .dev.vars.example .dev.vars   # pon tu correo
npm run dev                      # abre http://localhost:8787
```

Sin `GEMINI_API_KEY` en `.dev.vars`, la app genera una imagen gris de prueba y no gasta créditos.
