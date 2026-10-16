/* Capa de almacenamiento compartida (content script + biblioteca).
   Cada libro vive en su propia clave "book:<id>" y el orden en "books:index".
   Los errores de chrome.storage se propagan: quien llama decide cómo mostrarlos. */
var KH = globalThis.KH || (globalThis.KH = {});

(() => {
  if (KH.store) return;

  const INDEX = 'books:index';
  const STATUS = 'sync:status';
  const bookKey = id => 'book:' + id;
  const area = () => chrome.storage.local;

  async function getIndex() {
    const r = await area().get(INDEX);
    return Array.isArray(r[INDEX]) ? r[INDEX] : [];
  }

  async function getAllBooks() {
    const idx = await getIndex();
    if (!idx.length) return [];
    const r = await area().get(idx.map(bookKey));
    return idx.map(id => r[bookKey(id)]).filter(Boolean);
  }

  async function getBook(id) {
    const r = await area().get(bookKey(id));
    return r[bookKey(id)] || null;
  }

  /** Guarda un libro; si es nuevo lo añade al índice (al principio o al final). */
  async function putBook(book, { prepend = false } = {}) {
    const idx = await getIndex();
    const items = { [bookKey(book.id)]: book };
    if (!idx.includes(book.id)) items[INDEX] = prepend ? [book.id, ...idx] : [...idx, book.id];
    await area().set(items);
  }

  async function deleteBook(id) {
    const idx = await getIndex();
    await area().remove(bookKey(id));
    await area().set({ [INDEX]: idx.filter(x => x !== id) });
  }

  /** Amazon manda en los datos; las ediciones del usuario (custom) se conservan siempre. */
  async function saveSyncedBook({ asin, title, author, coverUrl, annotations, annotatedDate = null }, existing) {
    if (existing === undefined) existing = await getBook(asin);
    const now = Date.now();
    const sameDate = existing && annotatedDate && existing.annotatedDate === annotatedDate;
    await putBook({
      id: asin,
      source: 'amazon',
      asin,
      title,
      author,
      coverUrl,
      annotations,
      annotatedDate,
      // Cuándo vimos esta fecha por primera vez (sirve para saber si el libro ya está "asentado")
      annotatedDateSeenAt: sameDate && existing.annotatedDateSeenAt ? existing.annotatedDateSeenAt : now,
      lastSyncedAt: now,
      custom: (existing && existing.custom) || {}
    });
  }

  /** Reordena el índice siguiendo el orden de Amazon; el resto (importados, fallidos) va detrás. */
  async function setOrder(ids) {
    const idx = await getIndex();
    const known = new Set(idx);
    const head = ids.filter(id => known.has(id));
    const headSet = new Set(head);
    await area().set({ [INDEX]: [...head, ...idx.filter(id => !headSet.has(id))] });
  }

  async function getStatus() {
    const r = await area().get(STATUS);
    return r[STATUS] || null;
  }

  async function setStatus(status) {
    await area().set({ [STATUS]: { ...status, at: Date.now() } });
  }

  KH.store = {
    INDEX, STATUS, bookKey,
    getIndex, getAllBooks, getBook, putBook, deleteBook,
    saveSyncedBook, setOrder, getStatus, setStatus
  };
})();
