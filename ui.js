// Small touches that make Reminders feel smooth: a reminder that has just been added bubbles into the list,
// and the edit pane fades in when a different reminder is opened (not on every keystroke).
(function () {
  if (typeof renderList !== 'function' || typeof renderDetail !== 'function') return;
  let seen = null, lastSel;
  const baseList = renderList, baseDetail = renderDetail;
  renderList = function () {
    baseList.apply(this, arguments);
    const items = document.querySelectorAll('#listScroll .reminder-item'), now = new Set();
    items.forEach(el => now.add(el.dataset.id));
    if (seen) items.forEach(el => {
      if (seen.has(el.dataset.id)) return;
      el.classList.add('enter'); el.addEventListener('animationend', () => el.classList.remove('enter'), { once: true });
    });
    seen = now;
  };
  renderDetail = function () {
    const changed = selectedId !== lastSel; lastSel = selectedId;
    baseDetail.apply(this, arguments);
    const d = document.getElementById('detail');
    if (changed && d && !d.classList.contains('hidden')) { d.classList.remove('swap'); void d.offsetWidth; d.classList.add('swap'); d.addEventListener('animationend', () => d.classList.remove('swap'), { once: true }); }
  };
})();
