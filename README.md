# Kindle Highlights

Extensión de Chrome que sincroniza todos tus subrayados y notas de Kindle desde la web de Amazon ([read.amazon.com/notebook](https://read.amazon.com/notebook)) con un clic, y te deja consultarlos, copiarlos y exportarlos a Word o JSON.

## Instalación

1. Descarga o clona este repositorio.
2. Abre `chrome://extensions` y activa el **Modo de desarrollador** (arriba a la derecha).
3. Pulsa **Cargar descomprimida** y selecciona la carpeta del repositorio.

## Uso

1. Inicia sesión en [read.amazon.com/notebook](https://read.amazon.com/notebook) (o el dominio de tu país: `.es`, `.co.uk`, `.de`…).
2. Pulsa el icono de la extensión → **Sincronizar biblioteca**. Si no hay ninguna pestaña del notebook abierta, se abre una.
3. Abre la **biblioteca** desde el mismo menú. Para cada libro verás los subrayados con su color, página/posición y tus notas, y podrás:
   - Copiar todo al portapapeles.
   - Exportar a Word (`.docx`).
   - Cambiar el título o la portada. Estos cambios se conservan aunque vuelvas a sincronizar.

Sincroniza siempre que quieras: los libros se identifican por su ASIN, así que nunca se duplican. Si borras o editas algo en el Kindle, el cambio se refleja aquí.

## Copia de seguridad y migración

En **Copia de seguridad** puedes exportar/importar toda la biblioteca en JSON. También acepta el JSON de la antigua versión web: esos libros aparecen marcados como *importado* y, cuando sincronices el mismo libro desde Amazon, podrás eliminar la copia antigua.

## Estructura

| Ruta | Qué hace |
|---|---|
| `manifest.json` | Configuración de la extensión (Manifest V3) |
| `background.js` | Abre la biblioteca y lanza la sincronización en la pestaña del notebook |
| `content/selectors.js` | **Todos** los selectores del HTML de Amazon. Si Amazon cambia su web, normalmente solo hay que tocar este archivo |
| `content/scraper.js` | Lee la lista de libros y descarga las anotaciones de cada uno (con paginación) |
| `content/content.js` | Ejecuta la sincronización y publica el progreso |
| `shared/storage.js` | Acceso a `chrome.storage.local` (un registro por libro) |
| `library/` | Página de la biblioteca |
| `popup/` | Menú del icono de la extensión |
| `vendor/docx.umd.js` | Librería [docx](https://github.com/dolanmiu/docx) 8.5.0 para generar Word sin conexión |

## Limitaciones

- Amazon limita cuánto texto de cada libro se puede exportar (un porcentaje fijado por la editorial). Los subrayados que superan ese límite aparecen recortados también en el notebook.
- Solo aparecen los libros comprados en la tienda Kindle; los documentos personales no salen en el notebook de Amazon.
