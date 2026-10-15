const statusEl = document.getElementById('status');
const btnSync = document.getElementById('btnSync');

function renderStatus(s) {
  if (!s) { statusEl.className = 'status'; return; }
  // Un "running" de hace más de 10 minutos es una sincronización que se interrumpió
  const stale = s.state === 'running' && Date.now() - (s.at || 0) > 10 * 60 * 1000;
  statusEl.className = 'status ' + (stale ? 'error' : s.state);
  statusEl.textContent = stale ? 'La última sincronización se interrumpió.' : s.message;
  btnSync.disabled = s.state === 'running' && !stale;
}

chrome.storage.local.get('sync:status').then(r => renderStatus(r['sync:status']));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['sync:status']) renderStatus(changes['sync:status'].newValue);
});

btnSync.addEventListener('click', async () => {
  btnSync.disabled = true;
  const res = await chrome.runtime.sendMessage({ type: 'startSync' });
  if (!res?.ok) btnSync.disabled = false;
});

document.getElementById('btnLibrary').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'openLibrary' });
  window.close();
});
