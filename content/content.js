/* Content script de read.amazon.<dominio>/notebook: ejecuta la sincronización cuando
   se le pide y publica el progreso en chrome.storage ("sync:status"). */
var KH = globalThis.KH || (globalThis.KH = {});

(() => {
  if (KH.contentLoaded) return;   // evita doble registro si se reinyecta
  KH.contentLoaded = true;

  let running = false;
  let badge = null;
  let badgeTimer = null;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'sync') return;
    sendResponse({ ok: true, alreadyRunning: running });
    if (!running) runSync();
  });

  /* ── Indicador flotante en la propia página ── */
  function showBadge(text, kind) {
    if (!badge) {
      badge = document.createElement('div');
      Object.assign(badge.style, {
        position: 'fixed', right: '20px', bottom: '20px', zIndex: 2147483647,
        maxWidth: '360px', padding: '12px 16px', borderRadius: '8px',
        font: '14px/1.4 Georgia, serif', color: '#fff',
        boxShadow: '0 6px 20px rgba(0,0,0,.25)'
      });
      document.body.appendChild(badge);
    }
    badge.style.background = kind === 'error' ? '#9b3a3a' : kind === 'done' ? '#2d6a4f' : '#c8691a';
    badge.textContent = text;
    clearTimeout(badgeTimer);
    if (kind !== 'running') {
      badgeTimer = setTimeout(() => { badge?.remove(); badge = null; }, 8000);
    }
  }

  async function report(status) {
    showBadge(status.message, status.state);
    try { await KH.store.setStatus(status); }
    catch (e) { console.warn('[Kindle Highlights] No se pudo guardar el estado', e); }
  }

  async function runSync() {
    running = true;
    try {
      await report({ state: 'running', current: 0, total: 0, message: 'Kindle Highlights: leyendo biblioteca…' });

      const list = await KH.scraper.getLibrary();
      if (!list.length) {
        throw new Error('No se encontraron libros. ¿Has iniciado sesión en Amazon y tienes subrayados?');
      }
      await chrome.storage.local.set({ lastOrigin: location.origin });

      const failed = [];
      let totalAnnotations = 0;

      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        await report({
          state: 'running', current: i + 1, total: list.length,
          message: `Kindle Highlights: ${i + 1}/${list.length} · ${b.title || b.asin}`
        });
        try {
          const { meta, annotations } = await KH.scraper.fetchBook(b.asin);
          await KH.store.saveSyncedBook({
            asin: b.asin,
            title: b.title || meta.title || 'Libro sin título',
            author: b.author || meta.author || '',
            coverUrl: b.coverUrl || meta.coverUrl || null,
            annotations
          });
          totalAnnotations += annotations.length;
        } catch (e) {
          // Un fallo de guardado (cuota, etc.) es grave: se aborta en lugar de seguir perdiendo datos
          if (e && /quota|storage/i.test(String(e.message))) throw e;
          console.warn('[Kindle Highlights] Error con', b.title, e);
          failed.push(b.title || b.asin);
        }
        await KH.scraper.sleep(400);
      }

      await KH.store.setOrder(list.map(b => b.asin));

      const ok = list.length - failed.length;
      let message = `Sincronizados ${ok} libro${ok !== 1 ? 's' : ''} (${totalAnnotations} anotaciones).`;
      if (failed.length) message += ` Fallaron ${failed.length}: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''}`;
      await report({ state: failed.length && !ok ? 'error' : 'done', current: list.length, total: list.length, message });
    } catch (e) {
      await report({ state: 'error', current: 0, total: 0, message: 'Error al sincronizar: ' + (e?.message || e) });
    } finally {
      running = false;
    }
  }
})();
