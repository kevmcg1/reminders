// Push notifications for Reminders: when a reminder's time arrives, the browser shows a notification.
// Works while Reminders is open in a tab (a background tab is fine). There is no server, so nothing is sent once every tab is closed.
// The Settings switch asks the browser for permission; once it is on, Settings says "Notifications are on" and a button explains how to turn them off in each browser.
(function () {
  const NOTIFIED_KEY = 'reminders.notified.v1';   // { reminderId: due } so each due time notifies once
  const GRACE_MS = 2 * 60 * 60 * 1000;            // a reminder that came due while the page was closed still notifies if it is under 2 hours late
  const supported = typeof window.Notification === 'function';
  const $ = id => document.getElementById(id);
  const perm = () => supported ? Notification.permission : 'denied';
  const isOn = () => supported && perm() === 'granted' && !!settings.notify;
  const isMac = () => /Mac/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '') && !(navigator.maxTouchPoints > 1);

  const readSeen = () => { try { return JSON.parse(localStorage.getItem(NOTIFIED_KEY)) || {}; } catch (e) { return {}; } };
  const writeSeen = o => { try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify(o)); } catch (e) {} };

  let swReg = null, askedAndBlocked = false;   // the blocked notice only shows after the person tried to turn notifications on
  async function register() {
    if (swReg || !('serviceWorker' in navigator)) return swReg;
    try { swReg = await navigator.serviceWorker.register('sw.js'); } catch (e) { swReg = null; }
    return swReg;
  }

  async function show(r) {
    const title = (r.title || '').trim() || 'Reminder';
    const note = (r.notes || '').trim().split('\n')[0];
    const opts = { body: note ? note + '\n' + fmtDate(r.due) : 'Due ' + fmtDate(r.due), tag: r.id, renotify: false };
    try {
      const reg = await register();
      if (reg && reg.showNotification) { await reg.showNotification(title, opts); return true; }
    } catch (e) { /* fall through to the page's own notification */ }
    try { const n = new Notification(title, opts); n.onclick = () => { window.focus(); n.close(); }; return true; } catch (e) { return false; }
  }

  // Mark everything already due as handled, so turning notifications on does not fire a burst for old reminders.
  function markOverdueSeen() {
    const seen = readSeen(), now = Date.now();
    reminders.forEach(r => { if (r.due && new Date(r.due).getTime() <= now) seen[r.id] = r.due; });
    writeSeen(seen);
  }

  async function tick() {
    if (!isOn()) return;
    const now = Date.now(), ids = new Set(reminders.map(r => r.id));
    let seen = readSeen(), changed = false;
    Object.keys(seen).forEach(k => { if (!ids.has(k)) { delete seen[k]; changed = true; } });
    for (const r of reminders) {
      if (r.completed || !r.due || seen[r.id] === r.due) continue;
      const t = new Date(r.due).getTime();
      if (isNaN(t) || t > now) continue;
      seen[r.id] = r.due; changed = true;
      if (now - t <= GRACE_MS) await show(r);
    }
    if (changed) writeSeen(seen);
  }

  /* ---- Settings UI ---- */
  const BROWSERS = {
    chrome:  { name: 'Google Chrome',  url: 'https://support.google.com/chrome/answer/3220216', logo: 'Google Chrome' },
    firefox: { name: 'Firefox',        url: 'https://support.mozilla.org/en-US/kb/push-notifications-firefox', logo: 'Firefox' },
    brave:   { name: 'Brave',          url: 'https://support.brave.com/hc/en-us/articles/360017989132-How-do-I-change-site-permissions', logo: 'Brave' },
    gx:      { name: 'Opera GX',       url: 'https://help.opera.com/en/latest/web-preferences/#notifications', logo: 'Opera GX' },
    opera:   { name: 'Opera',          url: 'https://help.opera.com/en/latest/web-preferences/#notifications', logo: 'Opera GX' },
    edge:    { name: 'Microsoft Edge', url: 'https://support.microsoft.com/en-us/microsoft-edge/manage-website-notifications-in-microsoft-edge-0c555609-5bf2-479d-a59d-fb30a0b80b2b', logo: 'Microsoft Edge' },
    safari:  { name: 'Safari',         url: 'https://support.apple.com/guide/safari/customize-website-notifications-sfri40734/mac', icon: 'fa-compass' }
  };
  const LISTS = { other: ['chrome', 'firefox', 'brave', 'gx', 'edge'], mac: ['safari', 'chrome', 'firefox', 'edge', 'brave', 'opera', 'gx'] };

  function logoFor(label) {   // reuse the browser marks already used by the cache help
    const a = [...document.querySelectorAll('#cacheHelp .browser-btn')].find(x => x.textContent.trim() === label);
    const s = a && a.querySelector('svg'); return s ? s.outerHTML : '';
  }
  function buildHelp() {
    const grid = $('notifyHowGrid'); if (!grid) return;
    grid.innerHTML = LISTS[isMac() ? 'mac' : 'other'].map(k => {
      const b = BROWSERS[k], mark = b.logo ? logoFor(b.logo) : `<i class="fa-solid ${b.icon} browser-ico" aria-hidden="true"></i>`;
      return `<a class="browser-btn" href="${b.url}" target="_blank" rel="noopener noreferrer">${mark}<span>${b.name}</span><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>`;
    }).join('');
  }

  function render() {
    const tg = $('notifyToggle'); if (!tg) return;
    const on = isOn(), blocked = supported && perm() === 'denied' && askedAndBlocked;
    tg.classList.toggle('on', on); tg.setAttribute('aria-checked', String(on));
    $('notifySub').textContent = !supported ? 'This browser does not support notifications' : perm() === 'denied' ? 'Blocked in your browser. Use the button at the bottom of the sidebar to see how to allow them.' : 'Get a notification when a reminder is due. Works while Reminders is open in a tab.';
    const box = $('notifyStatus'), msg = $('notifyMsg'), how = $('notifyHowBtn'), tip = $('notifyHowTip'), ico = $('notifyIco');
    box.hidden = !(on || blocked);
    ico.className = 'fa-solid ' + (on ? 'fa-bell' : 'fa-bell-slash');
    msg.textContent = on ? 'Notifications are on' : 'Notifications are blocked in your browser';
    $('notifyHowLabel').textContent = on ? 'Find out how to disable' : 'Find out how to allow';
    $('notifyHowHead').textContent = on ? 'How to turn notifications off' : 'How to allow notifications';
    tip.textContent = on ? 'Each button opens that browser’s own help page. Look for this site under notifications and set it to Block.'
                         : 'Each button opens that browser’s own help page. Look for this site under notifications and set it to Allow.';
    $('notifyHowTitle').textContent = isMac() ? 'Pick your Mac browser.' : 'Pick your browser.';
  }

  async function toggle() {
    if (!supported) { render(); return; }
    if (isOn()) { settings.notify = false; saveSettings(); render(); toast('Notifications turned off'); return; }
    let p = perm();
    if (p === 'default') { try { p = await Notification.requestPermission(); } catch (e) { p = perm(); } }
    if (p === 'granted') {
      settings.notify = true; saveSettings(); markOverdueSeen(); register(); render();
      showOverlay('notifyNoteOverlay'); const ok = $('notifyNoteOk'); if (ok) ok.focus({ preventScroll: true });   // tell them right away that the tab has to stay open
    } else { settings.notify = false; askedAndBlocked = p === 'denied'; saveSettings(); render(); }
  }

  // Browsers slow a page's own timers to about one a minute (and later still) once its tab is in the background, which would make
  // reminders late. A Web Worker's timer is not slowed that way, so it does the ticking; the page's own timer is only the fallback.
  let clock = null;
  function startClock() {
    if (clock) return;
    try {
      const src = 'setInterval(function(){postMessage(1)},3000)';
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      clock = new Worker(url); URL.revokeObjectURL(url);
      clock.onmessage = tick; clock.onerror = () => { clock = null; setInterval(tick, 15000); };
    } catch (e) { clock = null; setInterval(tick, 15000); }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const tg = $('notifyToggle'); if (!tg) return;
    buildHelp();
    tg.addEventListener('click', toggle);
    $('notifyNoteOk').addEventListener('click', () => { hideOverlay('notifyNoteOverlay'); tg.focus({ preventScroll: true }); });
    $('notifyHowBtn').addEventListener('click', () => { render(); showOverlay('notifyHowOverlay'); $('notifyHowOk').focus({ preventScroll: true }); });
    $('notifyHowOk').addEventListener('click', () => { hideOverlay('notifyHowOverlay'); $('notifyHowBtn').focus({ preventScroll: true }); });
    $('settingsBtn').addEventListener('click', render);   // the browser permission can change while the page is open
    if (settings.notify && perm() !== 'granted') { settings.notify = false; saveSettings(); }   // permission was withdrawn in the browser
    render(); if (isOn()) register();
    startClock();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    addEventListener('focus', tick);
    tick();
  });
  window.__notify = { tick, isOn, render, show };
})();
