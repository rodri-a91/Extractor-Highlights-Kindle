/* Lectura de datos del notebook de Kindle. Las peticiones son del mismo origen,
   así que usan la sesión de Amazon que ya tiene abierta el usuario. */
var KH = globalThis.KH || (globalThis.KH = {});

(() => {
  if (KH.scraper) return;

  const SEL = KH.SEL;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

  function notebookBase() {
    return location.origin + location.pathname;
  }

  async function fetchDoc(url) {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return new DOMParser().parseFromString(await res.text(), 'text/html');
  }

  /** Las miniaturas de Amazon llevan un sufijo de tamaño (._SY160.jpg); sin él se obtiene la imagen original. */
  function bigCover(url) {
    if (!url || !/^https?:\/\//i.test(url)) return null;   // descarta iconos relativos (p. ej. Note_icon.png)
    return url.replace(/\._[^./]+_?\.(jpe?g|png|gif)$/i, '.$1');
  }

  /** "By: Autor", "De: Autor", "Von: Autor"… → "Autor" */
  function cleanAuthor(t) {
    return t.replace(/^[^:]{1,12}:\s*/, '').trim();
  }

  /* ── Biblioteca ── */

  function parseLibrary(doc) {
    return [...doc.querySelectorAll(SEL.libraryBook)]
      .map(el => ({
        asin: el.id,
        title: txt(el.querySelector(SEL.libraryTitle)),
        author: cleanAuthor(txt(el.querySelector(SEL.libraryAuthor))),
        coverUrl: bigCover(el.querySelector(SEL.libraryCover)?.getAttribute('src'))
      }))
      .filter(b => b.asin);
  }

  async function waitForLibrary(timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (document.querySelector(SEL.libraryBook)) return;
      await sleep(250);
    }
  }

  async function getLibrary() {
    await waitForLibrary();
    const books = parseLibrary(document);
    const seen = new Set(books.map(b => b.asin));

    // Bibliotecas grandes: el panel izquierdo se carga por páginas
    let token = document.querySelector(SEL.libraryNextToken)?.value || '';
    const usedTokens = new Set();
    while (token && !usedTokens.has(token)) {
      usedTokens.add(token);
      let doc;
      try {
        doc = await fetchDoc(`${notebookBase()}?library=list&token=${token}`);
      } catch (e) {
        console.warn('[Kindle Highlights] No se pudo cargar la siguiente página de la biblioteca', e);
        break;
      }
      for (const b of parseLibrary(doc)) {
        if (!seen.has(b.asin)) { seen.add(b.asin); books.push(b); }
      }
      token = doc.querySelector(SEL.libraryNextToken)?.value || '';
      await sleep(300);
    }
    return books;
  }

  /* ── Anotaciones ── */

  const PAGE_RE = /(?:page|p[aá]gina|seite|pagina|ページ)\s*[:：]?\s*([^\s|]+)/i;
  const LOC_RE  = /(?:location|posici[oó]n|position|posizione|positie|位置)\s*(?:no\.)?\s*[:：]?\s*([\d.,]+)/i;

  function parseAnnotation(row) {
    const text   = txt(row.querySelector(SEL.highlight));
    const note   = txt(row.querySelector(SEL.note));
    const header = txt(row.querySelector(SEL.header));

    let location = parseInt(row.querySelector(SEL.location)?.value, 10);
    if (!Number.isFinite(location)) {
      const m = header.match(LOC_RE);
      location = m ? parseInt(m[1].replace(/[.,]/g, ''), 10) : null;
    }

    const pm = header.match(PAGE_RE);
    const colorClass = row.querySelector(SEL.colorEl)?.className || '';
    const cm = colorClass.match(SEL.colorRegex);

    return {
      id: row.id || null,
      text,
      note,
      color: cm ? cm[1] : null,
      location: Number.isFinite(location) ? location : null,
      page: pm ? pm[1] : null
    };
  }

  function parseAnnotations(doc) {
    return [...doc.querySelectorAll(SEL.annotationRow)]
      .filter(row => row.querySelector(SEL.highlight) || row.querySelector(SEL.note))
      .map(parseAnnotation)
      .filter(a => a.text || a.note);
  }

  function parseBookMeta(doc) {
    return {
      title: txt(doc.querySelector(SEL.bookTitle)),
      author: cleanAuthor(txt(doc.querySelector(SEL.bookAuthor))),
      coverUrl: bigCover(doc.querySelector(SEL.bookCover)?.getAttribute('src'))
    };
  }

  async function fetchBook(asin) {
    const base = notebookBase();
    const annotations = [];
    const ids = new Set();
    const usedTokens = new Set();
    let token = '', state = '', meta = null;

    for (let page = 0; page < 500; page++) {
      // token y contentLimitState ya vienen codificados por Amazon: se envían tal cual, como hace su web
      const url = `${base}?asin=${encodeURIComponent(asin)}&contentLimitState=${state}&token=${token}`;
      const doc = await fetchDoc(url);
      if (!meta) meta = parseBookMeta(doc);

      parseAnnotations(doc).forEach((a, i) => {
        if (!a.id) a.id = `${asin}-${page}-${i}`;
        if (ids.has(a.id)) return;
        ids.add(a.id);
        annotations.push(a);
      });

      token = doc.querySelector(SEL.nextToken)?.value || '';
      state = doc.querySelector(SEL.contentLimitState)?.value || '';
      if (!token || usedTokens.has(token)) break;
      usedTokens.add(token);
      await sleep(300);
    }

    // Orden estable por posición; las que no tienen posición conservan su orden relativo
    annotations.sort((a, b) =>
      (a.location ?? Number.MAX_SAFE_INTEGER) - (b.location ?? Number.MAX_SAFE_INTEGER));

    return { meta: meta || {}, annotations };
  }

  KH.scraper = { getLibrary, fetchBook, sleep };
})();
