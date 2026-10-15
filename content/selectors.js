/* Todos los selectores del DOM de read.amazon.<dominio>/notebook en un solo sitio.
   Si Amazon cambia su HTML, este es (casi siempre) el único archivo a tocar. */
var KH = globalThis.KH || (globalThis.KH = {});

KH.SEL = {
  // Panel izquierdo: lista de libros (el id de cada elemento es el ASIN)
  libraryBook:      '#kp-notebook-library .kp-notebook-library-each-book',
  libraryTitle:     'h2',
  libraryAuthor:    'p.kp-notebook-searchable',
  libraryCover:     'img.kp-notebook-cover-image',
  libraryNextToken: '.kp-notebook-library-next-page-start',
  // Fecha (texto localizado, granularidad de día) de la última anotación del libro
  libraryDate:      'input[id^="kp-notebook-annotated-date-"]',

  // Respuesta de /notebook?asin=…: cabecera del libro
  bookTitle:  'h3.kp-notebook-metadata',
  bookAuthor: 'p.kp-notebook-metadata',
  bookCover:  'img.kp-notebook-cover-image-border, img.kp-notebook-cover-image',

  // Respuesta de /notebook?asin=…: anotaciones. Es un fragmento HTML sin contenedor:
  // cada fila es un div.a-row.a-spacing-base cuyo id es el de la anotación
  annotationRow:     'div.a-row.a-spacing-base[id]',
  highlight:         '[id="highlight"]',
  note:              '[id="note"]',
  header:            '[id="annotationHighlightHeader"], [id="annotationNoteHeader"]',
  location:          'input[id*="annotation-location"]',
  colorEl:           '[class*="kp-notebook-highlight-"]',
  colorRegex:        /kp-notebook-highlight-(yellow|blue|pink|orange)/,

  // Paginación de anotaciones
  nextToken:         '.kp-notebook-annotations-next-page-start',
  contentLimitState: '.kp-notebook-content-limit-state'
};
