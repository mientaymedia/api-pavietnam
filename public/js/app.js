/* Tuong tac nho gon, khong phu thuoc thu vien ngoai. */
(function () {
  'use strict';

  /* Nut sao chep noi dung chuyen khoan / so tai khoan */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-copy]');
    if (!btn) return;
    e.preventDefault();
    var text = btn.getAttribute('data-copy');
    var done = function () {
      var old = btn.textContent;
      btn.textContent = 'Da chep!';
      setTimeout(function () { btn.textContent = old; }, 1500);
    };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(done, done);
    } else {
      var ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (err) { /* bo qua */ }
      document.body.removeChild(ta); done();
    }
  });

  /* Xac nhan truoc khi thuc hien hanh dong khong hoan tac duoc */
  document.addEventListener('submit', function (e) {
    var msg = e.target.getAttribute('data-confirm');
    if (msg && !window.confirm(msg)) e.preventDefault();
  });

  /* Ban ghi MX moi can do uu tien - an/hien o nhap cho gon */
  document.querySelectorAll('[data-record-type]').forEach(function (select) {
    var sync = function () {
      var wrap = document.querySelector(select.getAttribute('data-priority-target'));
      if (wrap) wrap.style.display = (select.value === 'MX' || select.value === 'SRV') ? '' : 'none';
    };
    select.addEventListener('change', sync);
    sync();
  });

  /* Trang don hang cho thanh toan: tu kiem tra trang thai de bao ngay khi tien ve */
  var poll = document.querySelector('[data-poll-order]');
  if (poll) {
    var code = poll.getAttribute('data-poll-order');
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (tries > 120) return clearInterval(timer); // dung sau ~10 phut
      fetch('/don-hang/' + encodeURIComponent(code) + '/trang-thai', { headers: { accept: 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (data && data.paid) { clearInterval(timer); window.location.reload(); }
        })
        .catch(function () { /* mang chap chon - lan sau thu lai */ });
    }, 5000);
  }
})();
