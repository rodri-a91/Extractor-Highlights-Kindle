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
    if (!running) runSync({ full: !!msg.full });
  });

  /* ── Detección de cambios ──
     Amazon da la fecha (por día) de la última anotación de cada libro. Si no ha cambiado
     y la última descarga se hizo un día posterior a cuando vimos esa fecha por primera vez,
     no puede haber anotaciones nuevas. Si se descargó el mismo día, pudo haber más
     subrayados después ese mismo día, así que se vuelve a descargar.
     Excepción: si la fecha de Amazon no puede ser la del día de la descarga (no contiene
     ese día del mes y ese año), ya estaba cerrada y no hace falta esa descarga extra. */
  const dayKey = ts => new Date(ts).toLocaleDateString('sv');   // "AAAA-MM-DD", comparable como texto

  /** La fecha es texto localizado ("15 de octubre de 2026", "October 15, 2026", "2026年10月15日"…):
      se comparan solo sus números, así que vale para cualquier idioma y ante la duda dice que sí. */
  function couldBeDayOf(dateText, ts) {
    const d = new Date(ts);
    const nums = (dateText.match(/\d+/g) || []).map(Number);
    return nums.includes(d.getDate()) && nums.includes(d.getFullYear());
  }

  function isUnchanged(existing, b) {
    if (!(existing && existing.source === 'amazon' &&
          b.annotatedDate && existing.annotatedDate === b.annotatedDate &&
          existing.annotatedDateSeenAt && existing.lastSyncedAt)) return false;
    return !couldBeDayOf(b.annotatedDate, existing.lastSyncedAt) ||
      dayKey(existing.lastSyncedAt) > dayKey(existing.annotatedDateSeenAt);
  }

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

  async function runSync({ full = false } = {}) {
    running = true;
    try {
      await report({ state: 'running', current: 0, total: 0,
        message: `Kindle Highlights: leyendo biblioteca${full ? ' (sincronización completa)' : ''}…` });

      const list = await KH.scraper.getLibrary();
      if (!list.length) {
        throw new Error('No se encontraron libros. ¿Has iniciado sesión en Amazon y tienes subrayados?');
      }
      await chrome.storage.local.set({ lastOrigin: location.origin });

      const failed = [];
      let updated = 0, unchanged = 0;

      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        try {
          const existing = await KH.store.getBook(b.asin);
          if (!full && isUnchanged(existing, b)) { unchanged++; continue; }

          await report({
            state: 'running', current: i + 1, total: list.length,
            message: `Kindle Highlights: ${i + 1}/${list.length} · ${b.title || b.asin}`
          });
          const { meta, annotations } = await KH.scraper.fetchBook(b.asin);
          await KH.store.saveSyncedBook({
            asin: b.asin,
            title: b.title || meta.title || 'Libro sin título',
            author: b.author || meta.author || '',
            coverUrl: b.coverUrl || meta.coverUrl || null,
            annotatedDate: b.annotatedDate,
            annotations
          }, existing);
          updated++;
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
      let message = `${list.length} libro${list.length !== 1 ? 's' : ''}: ${updated} actualizado${updated !== 1 ? 's' : ''}, ${unchanged} sin cambios.`;
      if (failed.length) message += ` Fallaron ${failed.length}: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''}`;
      await report({ state: failed.length && !ok ? 'error' : 'done', current: list.length, total: list.length, message });
    } catch (e) {
      await report({ state: 'error', current: 0, total: 0, message: 'Error al sincronizar: ' + (e?.message || e) });
    } finally {
      running = false;
    }
  }
})();
