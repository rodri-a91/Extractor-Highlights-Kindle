(() => {
  const store = KH.store;
  const $ = id => document.getElementById(id);

  let books = [];          // en el orden del índice
  let currentId = null;
  let currentLibView = 'gallery';

  /* ── Helpers ── */

  /** Crea un elemento. Los textos siempre van por textContent (nunca innerHTML). */
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'className') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else node.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  const plural = (n, s, p = s + 's') => `${n} ${n === 1 ? s : p}`;
  const findBook = id => books.find(b => b.id === id) || null;
  const displayTitle = b => (b.custom && b.custom.title) || b.title || 'Libro sin título';
  const coverOf = b => (b.custom && b.custom.coverUrl) || b.coverUrl || null;
  const annotationsOf = b => b.annotations || [];

  function countsText(b) {
    const anns = annotationsOf(b);
    const hl = anns.filter(a => a.text).length;
    const notes = anns.filter(a => a.note).length;
    return plural(hl, 'highlight') + (notes ? ` · ${plural(notes, 'nota')}` : '');
  }

  function locationText(a) {
    const parts = [];
    if (a.page) parts.push('Pág. ' + a.page);
    if (a.location != null) parts.push('Pos. ' + a.location);
    return parts.join(' · ');
  }

  let toastTimer = null;
  function toast(msg, kind = 'err') {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast visible' + (kind === 'ok' ? ' ok' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast'; }, kind === 'ok' ? 3000 : 8000);
  }

  /** Ejecuta una escritura y avisa si falla (p. ej. cuota llena) en lugar de tragarse el error. */
  async function safeWrite(fn) {
    try { await fn(); return true; }
    catch (e) {
      console.error(e);
      toast('No se pudieron guardar los cambios: ' + (e?.message || e));
      return false;
    }
  }

  function setStatus(id, msg, type) {
    const s = $(id);
    s.textContent = msg;
    s.className = 'status ' + type;
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const safeFilename = t => t.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'libro';

  /* ── Datos ── */

  async function reload() {
    try { books = await store.getAllBooks(); }
    catch (e) { books = []; toast('No se pudo leer la biblioteca: ' + (e?.message || e)); }
  }

  /* ── Vistas ── */

  function switchView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    $(id).classList.add('active');
    $('headerActions').style.display = id === 'libView' ? '' : 'none';
    window.scrollTo(0, 0);
  }

  function showLibrary() {
    currentId = null;
    switchView('libView');
    renderLibrary();
  }

  function showBackup() {
    switchView('backupView');
    $('exportStatus').className = 'status';
    $('restoreStatus').className = 'status';
    $('jsonFileInput').value = '';
  }

  /* ── Biblioteca ── */

  function setLibView(mode) {
    currentLibView = mode;
    try { localStorage.setItem('kindleLibView', mode); } catch (e) {}
    $('btnGallery').classList.toggle('active', mode === 'gallery');
    $('btnList').classList.toggle('active', mode === 'list');
    renderLibrary();
  }

  function coverImg(b, alt) {
    const url = coverOf(b);
    if (!url) return null;
    const img = el('img', { src: url, alt: alt || '', referrerpolicy: 'no-referrer' });
    img.addEventListener('load', () => img.classList.add('loaded'));
    img.addEventListener('error', () => {
      img.style.display = 'none';
      const ph = img.parentElement && img.parentElement.querySelector('.book-cover-placeholder, .list-cover-ph');
      if (ph) ph.style.display = '';
    });
    return img;
  }

  function renderLibrary() {
    const container = $('libraryGrid');
    const n = books.length;
    $('libCount').textContent = n ? plural(n, 'libro') : '';
    container.replaceChildren();

    if (n === 0) {
      container.className = '';
      const link = el('a', { href: 'https://read.amazon.com/notebook', target: '_blank', text: 'read.amazon.com/notebook' });
      const btn = el('button', { className: 'btn-primary', text: '↻ Sincronizar ahora' });
      btn.addEventListener('click', startSync);
      container.append(el('div', { className: 'empty-state' },
        el('p', {}, 'Aún no hay libros. Inicia sesión en ', link, ' y pulsa Sincronizar.'),
        el('p', {}, btn)));
      return;
    }

    if (currentLibView === 'list') {
      container.className = 'library-list';
      for (const b of books) {
        const img = coverImg(b);
        container.append(el('div', { className: 'list-item', dataset: { id: b.id } },
          el('div', { className: 'list-cover' },
            img, el('div', { className: 'list-cover-ph', style: img ? 'display:none' : null, text: '📖' })),
          el('div', { className: 'list-title' }, displayTitle(b)),
          el('div', { className: 'list-meta', text: countsText(b) }),
          el('div', { className: 'list-arrow', text: '›' })));
      }
    } else {
      container.className = 'library-grid';
      for (const b of books) {
        const img = coverImg(b, displayTitle(b));
        container.append(el('div', { className: 'book-card', dataset: { id: b.id } },
          el('div', { className: 'book-cover' },
            img,
            el('div', { className: 'book-cover-placeholder', style: img ? 'display:none' : null },
              el('span', { text: '📖' }), el('p', { text: displayTitle(b) }))),
          el('div', { className: 'book-card-info' },
            el('div', { className: 'book-card-title' }, displayTitle(b)),
            el('div', { className: 'book-card-meta', text: countsText(b) }))));
      }
    }
  }

  /* ── Libro ── */

  function openBook(id) {
    if (!findBook(id)) return;
    currentId = id;
    switchView('bookView');
    $('titleEditForm').classList.remove('active');
    closeCoverPanel();
    renderBook();
  }

  function renderBook() {
    const b = findBook(currentId);
    if (!b) { showLibrary(); return; }

    $('bookViewTitle').textContent = displayTitle(b);
    $('bookViewAuthor').textContent = b.author || '';
    let meta = countsText(b);
    if (b.lastSyncedAt) meta += ' · sincronizado ' + new Date(b.lastSyncedAt).toLocaleString();
    $('bookViewMeta').textContent = meta;

    const list = $('highlightsList');
    list.replaceChildren(...annotationsOf(b).map(a => {
      const cls = ['hl-item'];
      if (a.color) cls.push('hl-' + a.color);
      if (!a.text) cls.push('note-only');
      const loc = locationText(a);
      return el('div', { className: cls.join(' ') },
        a.text ? el('div', { className: 'hl-text', text: a.text }) : null,
        a.note ? el('div', { className: 'hl-note' },
          el('span', { className: 'hl-note-label', text: 'Nota' }), a.note) : null,
        loc ? el('div', { className: 'hl-meta', text: loc }) : null);
    }));
  }

  /* ── Título ── */

  function startEditTitle() {
    const b = findBook(currentId);
    $('titleEditInput').value = displayTitle(b);
    $('titleEditForm').classList.add('active');
    $('titleEditInput').focus();
  }

  function cancelEditTitle() {
    $('titleEditForm').classList.remove('active');
  }

  async function saveTitle() {
    const b = findBook(currentId);
    const value = $('titleEditInput').value.trim();
    const custom = { ...(b.custom || {}) };
    if (!value || value === b.title) delete custom.title;
    else custom.title = value;
    if (await safeWrite(() => store.putBook({ ...b, custom }))) cancelEditTitle();
  }

  /* ── Portada ── */

  function openCoverPanel() {
    const b = findBook(currentId);
    const url = coverOf(b) || '';
    $('coverEditPanel').classList.add('active');
    $('coverUrlInput').value = url.startsWith('data:') ? '' : url;
    $('coverFilePreview').classList.remove('visible');
    const p = $('coverUrlPreview');
    p.classList.toggle('visible', !!url);
    if (url) p.src = url;
    $('coverEditPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function closeCoverPanel() {
    $('coverEditPanel').classList.remove('active');
    $('coverUrlInput').value = '';
    $('coverUrlPreview').classList.remove('visible');
    $('coverFilePreview').classList.remove('visible');
    $('coverFileInput').value = '';
  }

  function switchCoverTab(btn) {
    document.querySelectorAll('.cover-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.cover-tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    $('coverTab' + btn.dataset.tab).classList.add('active');
  }

  function previewCoverUrl() {
    const url = $('coverUrlInput').value.trim();
    const preview = $('coverUrlPreview');
    if (!url) { preview.classList.remove('visible'); return; }
    preview.onload = () => preview.classList.add('visible');
    preview.onerror = () => preview.classList.remove('visible');
    preview.src = url;
  }

  async function setCustomCover(url) {
    const b = findBook(currentId);
    const custom = { ...(b.custom || {}) };
    if (url) custom.coverUrl = url; else delete custom.coverUrl;
    if (await safeWrite(() => store.putBook({ ...b, custom }))) closeCoverPanel();
  }

  function saveCoverUrl() {
    const url = $('coverUrlInput').value.trim();
    if (!/^https?:\/\//i.test(url)) { toast('Introduce una URL que empiece por http:// o https://'); return; }
    setCustomCover(url);
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function previewCoverFile() {
    const file = $('coverFileInput').files[0];
    if (!file) return;
    const p = $('coverFilePreview');
    p.src = await readFileAsDataURL(file);
    p.classList.add('visible');
  }

  async function saveCoverFile() {
    const file = $('coverFileInput').files[0];
    if (!file) return;
    setCustomCover(await readFileAsDataURL(file));
  }

  /* ── Acciones del libro ── */

  function highlightsAsText(b) {
    return annotationsOf(b).map(a => {
      const loc = locationText(a);
      let s = a.text ? '— ' + a.text + (loc ? ` (${loc})` : '') : '— Nota' + (loc ? ` (${loc})` : '') + ': ' + a.note;
      if (a.text && a.note) s += '\n  Nota: ' + a.note;
      return s;
    }).join('\n\n');
  }

  async function copyHighlights() {
    const b = findBook(currentId);
    if (!b) return;
    try {
      await navigator.clipboard.writeText(highlightsAsText(b));
      const btn = $('btnCopy');
      btn.textContent = '✓ Copiado';
      setTimeout(() => { btn.textContent = 'Copiar todo'; }, 2000);
    } catch (e) {
      toast('No se pudo copiar al portapapeles.');
    }
  }

  async function deleteBook(id = currentId) {
    const b = findBook(id);
    if (!b) return;
    const extra = b.source === 'amazon' ? '\n\nVolverá a aparecer la próxima vez que sincronices.' : '';
    if (!confirm(`¿Eliminar "${displayTitle(b)}" y todos sus highlights?${extra}`)) return;
    if (await safeWrite(() => store.deleteBook(id))) {
      books = books.filter(x => x.id !== id);
      showLibrary();
    }
  }

  /* ── Exportar Word ── */

  async function exportWord() {
    const b = findBook(currentId);
    if (!b) return;
    if (typeof docx === 'undefined') { toast('La librería de Word no se ha cargado.'); return; }

    const {
      Document, Packer, Paragraph, TextRun,
      AlignmentType, BorderStyle, PageNumber, Footer
    } = docx;

    const AMBER = 'C8691A';
    const INK   = '1A1410';
    const MUTED = '8A7F72';
    const AGED  = 'E8E0D0';
    const COLORS = { yellow: 'E2B93B', blue: '4A90D9', pink: 'D9669B', orange: 'E8892F' };

    const title = displayTitle(b);
    const children = [
      new Paragraph({
        children: [new TextRun({ text: title, font: 'Georgia', size: 56, bold: true, color: INK })],
        alignment: AlignmentType.LEFT,
        spacing: { before: 0, after: 200 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: AMBER, space: 8 } }
      })
    ];

    if (b.author) {
      children.push(new Paragraph({
        children: [new TextRun({ text: b.author, font: 'Georgia', size: 28, italics: true, color: MUTED })],
        spacing: { before: 120, after: 0 }
      }));
    }

    children.push(new Paragraph({
      children: [new TextRun({ text: countsText(b), font: 'Courier New', size: 20, color: MUTED })],
      alignment: AlignmentType.LEFT,
      spacing: { before: 240, after: 800 }
    }));

    annotationsOf(b).forEach((a, i) => {
      const isEven = i % 2 === 0;
      const border = {
        left: {
          style: BorderStyle.SINGLE,
          size: a.color ? 12 : (isEven ? 12 : 4),
          color: COLORS[a.color] || (isEven ? AMBER : AGED),
          space: 16
        }
      };
      const indent = { left: 480, right: 240 };
      const loc = locationText(a);

      if (a.text) {
        children.push(new Paragraph({
          children: [new TextRun({ text: a.text, font: 'Georgia', size: 26, color: INK })],
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 0, after: (a.note || loc) ? 80 : 320, line: 360, lineRule: 'auto' },
          indent, border
        }));
      }
      if (a.note) {
        children.push(new Paragraph({
          children: [
            new TextRun({ text: 'NOTA  ', font: 'Courier New', size: 16, bold: true, color: AMBER }),
            new TextRun({ text: a.note, font: 'Georgia', size: 24, italics: true, color: INK })
          ],
          spacing: { before: 0, after: loc ? 80 : 320, line: 320, lineRule: 'auto' },
          indent, border: a.text ? undefined : border
        }));
      }
      if (loc) {
        children.push(new Paragraph({
          children: [new TextRun({ text: loc, font: 'Courier New', size: 16, color: MUTED })],
          spacing: { before: 0, after: 320 },
          indent
        }));
      }
    });

    const doc = new Document({
      styles: { default: { document: { run: { font: 'Georgia', size: 26, color: INK } } } },
      sections: [{
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1700, right: 1440, bottom: 1700, left: 1700 }
          }
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: title + '  ·  ', font: 'Courier New', size: 16, color: MUTED }),
                  new TextRun({ children: [PageNumber.CURRENT], font: 'Courier New', size: 16, color: MUTED })
                ],
                alignment: AlignmentType.CENTER,
                border: { top: { style: BorderStyle.SINGLE, size: 4, color: AGED, space: 8 } }
              })
            ]
          })
        },
        children
      }]
    });

    download(await Packer.toBlob(doc), safeFilename(title) + '.docx');
  }

  /* ── Copia de seguridad ── */

  function exportLibrary() {
    if (!books.length) { setStatus('exportStatus', 'No hay libros que exportar.', 'err'); return; }
    const data = { format: 'kindle-highlights', version: 2, exportedAt: new Date().toISOString(), books };
    download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'kindle-biblioteca.json');
    setStatus('exportStatus', `Exportados ${plural(books.length, 'libro')}.`, 'ok');
  }

  function mergeImported(existing, incoming) {
    if (!existing) return { book: incoming, added: incoming.annotations.length, isNew: true };

    const custom = { ...(incoming.custom || {}), ...(existing.custom || {}) };

    // Se quedan las anotaciones de la sincronización más reciente
    if ((incoming.lastSyncedAt || 0) > (existing.lastSyncedAt || 0)) {
      return { book: { ...incoming, custom }, added: Math.max(0, incoming.annotations.length - existing.annotations.length), isNew: false };
    }
    return { book: { ...existing, custom }, added: 0, isNew: false };
  }

  function isValidBook(b) {
    return b && typeof b.id === 'string' && b.id && Array.isArray(b.annotations);
  }

  async function importLibrary() {
    const file = $('jsonFileInput').files[0];
    if (!file) return;
    let incoming;
    try {
      const data = JSON.parse(await file.text());
      if (data && data.format === 'kindle-highlights' && Array.isArray(data.books)) incoming = data.books.filter(isValidBook);
      else throw new Error();
      if (!incoming.length) throw new Error();
    } catch (e) {
      setStatus('restoreStatus', 'Archivo no válido. Usa un JSON exportado desde esta extensión.', 'err');
      return;
    }

    let addedBooks = 0, addedHl = 0;
    const ok = await safeWrite(async () => {
      for (const b of incoming) {
        const { book, added, isNew } = mergeImported(await store.getBook(b.id), b);
        await store.putBook(book);
        if (isNew) addedBooks++;
        addedHl += added;
      }
    });
    if (ok) {
      setStatus('restoreStatus',
        `Importación completada: ${plural(addedBooks, 'libro nuevo', 'libros nuevos')}, ${plural(addedHl, 'highlight añadido', 'highlights añadidos')}.`,
        'ok');
    }
    $('jsonFileInput').value = '';
  }

  /* ── Sincronización ── */

  async function startSync() {
    $('btnSync').disabled = true;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'startSync' });
      if (!res?.ok) $('btnSync').disabled = false;
    } catch (e) {
      $('btnSync').disabled = false;
      toast('No se pudo iniciar la sincronización: ' + (e?.message || e));
    }
  }

  /* La barra solo se ve mientras se sincroniza y unos segundos después del resultado.
     Al abrir la página no se muestra el resultado de una sincronización anterior. */
  let syncBarTimer = null;

  function renderSyncStatus(s, { initial = false } = {}) {
    const bar = $('syncBar');
    clearTimeout(syncBarTimer);
    const stale = s && s.state === 'running' && Date.now() - (s.at || 0) > 10 * 60 * 1000;
    if (!s || stale || (initial && s.state !== 'running')) {
      bar.className = 'sync-bar';
      $('btnSync').disabled = false;
      return;
    }
    bar.className = 'sync-bar ' + s.state;
    bar.textContent = s.message.replace(/^Kindle Highlights: /, '');
    $('btnSync').disabled = s.state === 'running';
    if (s.state !== 'running') {
      syncBarTimer = setTimeout(() => { bar.className = 'sync-bar'; }, s.state === 'error' ? 10000 : 5000);
    }
  }

  /* ── Tema ── */

  function getSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    $('themeToggle').textContent = theme === 'dark' ? '🌙' : '☀️';
    try { localStorage.setItem('kindleTheme', theme); } catch (e) {}
  }

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem('kindleTheme'); } catch (e) {}
    applyTheme(saved || getSystemTheme());
  }

  /* ── Eventos ── */

  function bindEvents() {
    $('themeToggle').addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || getSystemTheme();
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });
    $('btnShowBackup').addEventListener('click', showBackup);
    $('btnSync').addEventListener('click', startSync);
    $('btnGallery').addEventListener('click', () => setLibView('gallery'));
    $('btnList').addEventListener('click', () => setLibView('list'));
    document.querySelectorAll('.js-back').forEach(b => b.addEventListener('click', showLibrary));

    $('libraryGrid').addEventListener('click', e => {
      const item = e.target.closest('[data-id]');
      if (item) openBook(item.dataset.id);
    });

    $('btnEditTitle').addEventListener('click', startEditTitle);
    $('btnSaveTitle').addEventListener('click', saveTitle);
    $('btnCancelTitle').addEventListener('click', cancelEditTitle);
    $('titleEditInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') saveTitle();
      if (e.key === 'Escape') cancelEditTitle();
    });

    $('btnCover').addEventListener('click', openCoverPanel);
    document.querySelectorAll('.cover-tab').forEach(t => t.addEventListener('click', () => switchCoverTab(t)));
    document.querySelectorAll('.js-close-cover').forEach(b => b.addEventListener('click', closeCoverPanel));
    document.querySelectorAll('.js-reset-cover').forEach(b => b.addEventListener('click', () => setCustomCover(null)));
    $('coverUrlInput').addEventListener('input', previewCoverUrl);
    $('coverFileInput').addEventListener('change', previewCoverFile);
    $('btnSaveCoverUrl').addEventListener('click', saveCoverUrl);
    $('btnSaveCoverFile').addEventListener('click', saveCoverFile);

    $('btnCopy').addEventListener('click', copyHighlights);
    $('btnWord').addEventListener('click', () => exportWord().catch(e => toast('Error al generar el Word: ' + e.message)));
    $('btnDelete').addEventListener('click', () => deleteBook());

    $('btnExportJson').addEventListener('click', exportLibrary);
    $('jsonFileInput').addEventListener('change', importLibrary);

    // Cambios hechos por la sincronización (u otra pestaña): refrescar sin perder la vista actual
    let pending = null;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[store.STATUS]) renderSyncStatus(changes[store.STATUS].newValue);
      if (!Object.keys(changes).some(k => k === store.INDEX || k.startsWith('book:'))) return;
      clearTimeout(pending);
      pending = setTimeout(async () => {
        await reload();
        if ($('libView').classList.contains('active')) renderLibrary();
        else if ($('bookView').classList.contains('active') && currentId) renderBook();
      }, 150);
    });
  }

  /* ── Init ── */

  async function init() {
    initTheme();
    try {
      const savedView = localStorage.getItem('kindleLibView');
      if (savedView === 'list' || savedView === 'gallery') {
        currentLibView = savedView;
        $('btnGallery').classList.toggle('active', savedView === 'gallery');
        $('btnList').classList.toggle('active', savedView === 'list');
      }
    } catch (e) {}
    bindEvents();
    await reload();
    renderLibrary();
    try { renderSyncStatus(await store.getStatus(), { initial: true }); } catch (e) {}
  }

  init();
})();
