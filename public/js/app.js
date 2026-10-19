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
      btn.textContent = 'Đã chép!';
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

  /* Nut in phieu. Dat o day thay vi onclick= tren the: CSP cam script noi tuyen. */
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-print]')) { e.preventDefault(); window.print(); }
  });

  /* O chon tu gui bieu mau khi doi gia tri (vd so nam trong gio hang) */
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.hasAttribute && el.hasAttribute('data-submit-on-change') && el.form) el.form.submit();
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

  /* Ho so chu the: doi tinh thi tu nap danh sach phuong xa cua tinh do (khong
     JS thi dung nut "Lay danh sach phuong, xa" gui lai form) */
  document.querySelectorAll('[data-chon-tinh]').forEach(function (chonTinh) {
    var chonPhuong = document.querySelector(chonTinh.getAttribute('data-chon-tinh'));
    if (!chonPhuong) return;
    var nut = chonTinh.form && chonTinh.form.querySelector('[data-nut-lay-phuong]');
    if (nut) nut.style.display = 'none'; // .btn dat display rieng nen [hidden] khong an duoc
    var goc = document.body.getAttribute('data-base') || '';
    chonTinh.addEventListener('change', function () {
      var dat = function (ds) {
        chonPhuong.innerHTML = '';
        var dau = document.createElement('option');
        dau.value = '';
        dau.textContent = ds.length ? 'Chọn phường, xã' : 'Chọn tỉnh, thành phố trước';
        chonPhuong.appendChild(dau);
        ds.forEach(function (ten) {
          var o = document.createElement('option');
          o.value = ten; o.textContent = ten;
          chonPhuong.appendChild(o);
        });
        chonPhuong.required = ds.length > 0;
      };
      if (!chonTinh.value) return dat([]);
      fetch(goc + '/dia-gioi/phuong?tinh=' + encodeURIComponent(chonTinh.value), { headers: { accept: 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(dat)
        .catch(function () { if (nut) nut.style.display = ''; });
    });
  });

  /* Trang don hang cho thanh toan: tu kiem tra trang thai de bao ngay khi tien ve */
  var poll = document.querySelector('[data-poll-order]');
  if (poll) {
    var code = poll.getAttribute('data-poll-order');
    var tries = 0;
    // Tien to BASE_PATH (vd /ten-mien) do may chu dat tren <body>; khong dung script noi tuyen vi CSP
    var base = document.body.getAttribute('data-base') || '';
    var timer = setInterval(function () {
      tries++;
      if (tries > 120) return clearInterval(timer); // dung sau ~10 phut
      fetch(base + '/don-hang/' + encodeURIComponent(code) + '/trang-thai', { headers: { accept: 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (data && data.paid) { clearInterval(timer); window.location.reload(); }
        })
        .catch(function () { /* mang chap chon - lan sau thu lai */ });
    }, 5000);
  }
})();
