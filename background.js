/* Service worker: abre la biblioteca y orquesta la sincronización
   (busca o abre una pestaña del notebook y le pide al content script que sincronice). */

const HOSTS = [
  'read.amazon.com', 'read.amazon.co.uk', 'read.amazon.de', 'read.amazon.fr',
  'read.amazon.es', 'read.amazon.it', 'read.amazon.ca', 'read.amazon.com.au',
  'read.amazon.in', 'read.amazon.co.jp', 'read.amazon.com.br', 'read.amazon.com.mx',
  'read.amazon.nl'
];
const NOTEBOOK_PATTERNS = HOSTS.map(h => `https://${h}/*notebook*`);
const CONTENT_FILES = ['shared/storage.js', 'content/selectors.js', 'content/scraper.js', 'content/content.js'];
const LIBRARY_URL = chrome.runtime.getURL('library/library.html');

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.tabs.create({ url: LIBRARY_URL });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'openLibrary') {
    openLibrary().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === 'startSync') {
    startSync()
      .then(() => sendResponse({ ok: true }))
      .catch(e => {
        setStatus({ state: 'error', current: 0, total: 0, message: e.message || String(e) });
        sendResponse({ ok: false, error: e.message || String(e) });
      });
    return true;
  }
});

function setStatus(status) {
  return chrome.storage.local.set({ 'sync:status': { ...status, at: Date.now() } });
}

async function openLibrary() {
  const [ctx] = await chrome.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [LIBRARY_URL] });
  if (ctx) {
    await chrome.tabs.update(ctx.tabId, { active: true });
    await chrome.windows.update(ctx.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: LIBRARY_URL });
  }
}

function waitForComplete(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('La página del notebook tardó demasiado en cargar.'));
    }, timeoutMs);
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function startSync() {
  let [tab] = await chrome.tabs.query({ url: NOTEBOOK_PATTERNS });
  if (!tab) {
    const { lastOrigin = 'https://read.amazon.com' } = await chrome.storage.local.get('lastOrigin');
    await setStatus({ state: 'running', current: 0, total: 0, message: 'Abriendo el notebook de Kindle…' });
    tab = await chrome.tabs.create({ url: lastOrigin + '/notebook', active: true });
    await waitForComplete(tab.id);
    tab = await chrome.tabs.get(tab.id);
  }

  if (!tab.url || !/notebook/.test(new URL(tab.url).pathname)) {
    throw new Error('Inicia sesión en Amazon en la pestaña que se ha abierto y vuelve a pulsar Sincronizar.');
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'sync' });
  } catch {
    // La pestaña se abrió antes de instalar/recargar la extensión: inyectamos el content script
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: CONTENT_FILES });
    await chrome.tabs.sendMessage(tab.id, { type: 'sync' });
  }
}
