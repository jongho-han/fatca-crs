/* FATCA·CRS 본인확인 — 모바일 앱 화면 컨트롤러 */
(function () {
  'use strict';
  var F = window.FatcaCore;
  var esc = F.esc;

  var STEPS = ['본인확인서 작성', '증빙서류 첨부', '본인인증'];
  var state = F.createState(F.SAMPLE_CUSTOMER);
  var ui = { step: 1, errors: {}, showErrors: false, docErr: {}, submitting: false, sheet: null };

  var $main = document.getElementById('main');
  var $footer = document.getElementById('footer');
  var $stepper = document.getElementById('stepper');

  /* ---------- 아이콘 ---------- */
  var I = {
    chevron: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5v.5"/></svg>',
    plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
    camera: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    album: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
    trash: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
    checkBig: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>'
  };

  /* ---------- 공통 조각 ---------- */
  function errMsg(field) {
    var m = ui.showErrors && ui.errors[field];
    return '<p class="err" id="err-' + esc(field) + '" data-err="' + esc(field) + '"' + (m ? '' : ' hidden') + '>' + esc(m || '') + '</p>';
  }
  function errCls(field) { return ui.showErrors && ui.errors[field] ? ' is-err' : ''; }
  function seg(action, value, labelId, extra) {
    return '<div class="seg" role="radiogroup" aria-labelledby="' + labelId + '">' +
      ['Y', 'N'].map(function (v) {
        return '<button type="button" role="radio" aria-checked="' + (value === v) + '" data-action="' + action + '" data-v="' + v + '"' + (extra || '') + '>' + (v === 'Y' ? '예' : '아니오') + '</button>';
      }).join('') + '</div>';
  }

  /* ---------- 단계 표시 ---------- */
  function renderStepper() {
    $stepper.hidden = ui.step > 3;
    $stepper.innerHTML = STEPS.map(function (t, i) {
      var n = i + 1;
      var cls = n < ui.step ? 'done' : n === ui.step ? 'on' : '';
      return '<div class="st ' + cls + '"' + (n === ui.step ? ' aria-current="step"' : '') + '><div class="bar"></div><span class="lbl">' + n + ' ' + t + '</span></div>';
    }).join('');
  }

  /* ---------- 1단계: 본인확인서 작성 ---------- */
  function renderStep1() {
    var c = state.customer;
    var tax = F.needsTaxInfo(state);
    var h = '';
    h += '<div class="title"><h2>FATCA·CRS<br>본인확인서를 작성해 주세요</h2>' +
      '<p>국제조세조정에 관한 법률에 따라 대한민국 외 국가의 납세의무 여부를 확인해요.</p></div>';

    h += '<section class="card" aria-labelledby="secInfo"><h3 id="secInfo" style="margin:0;font-size:15px">1. 고객 인적사항</h3>' +
      '<dl class="info">' +
      '<div><dt>성명</dt><dd>' + esc(c.name) + '</dd></div>' +
      '<div><dt>생년월일</dt><dd>' + esc(c.birth) + '</dd></div>' +
      '<div><dt>국적</dt><dd>' + esc(F.countryName(c.nationality)) + '</dd></div>' +
      '<div><dt>주소</dt><dd>' + esc(c.address) + '</dd></div>' +
      '<div><dt>전화번호</dt><dd>' + esc(c.phone) + '</dd></div>' +
      '</dl><p class="note">고객님의 계약 정보로 자동 입력돼요.</p></section>';

    h += '<section class="sec" aria-labelledby="secCheck"><h3 id="secCheck">2. 고객 확인사항</h3>';
    // ①
    var usOn = state.usPerson === 'Y';
    h += '<div class="card' + (usOn ? ' active' : '') + (errCls('usTypes') ? ' invalid' : '') + '">' +
      '<p class="q" id="q1">① 미국 세법상 미국인에 해당하나요?</p>' + seg('us', state.usPerson, 'q1');
    if (usOn) {
      h += '<fieldset class="checks" data-field="usTypes"><legend>해당되는 사항을 선택해 주세요</legend>' +
        F.US_TYPES.map(function (t) {
          return '<label class="chk"><input type="checkbox" data-bind="usType" data-key="' + t.key + '"' + (state.usTypes[t.key] ? ' checked' : '') + '>' + esc(t.label) + '</label>';
        }).join('') + '</fieldset>' + errMsg('usTypes');
    }
    h += '</div>';
    // ②
    h += '<div class="card' + (state.foreignResident === 'Y' ? ' active' : '') + '">' +
      '<p class="q" id="q2">② 대한민국 외 국가의 조세목적상 거주자인가요?</p>' + seg('fr', state.foreignResident, 'q2') + '</div>';

    if (tax) {
      // ③ 영문성명
      h += '<div class="card"><p class="q">③ 영문성명</p><div class="row2">' +
        '<div class="field' + errCls('engLast') + '" data-field="engLast"><label for="engLast">성 (Last Name)</label>' +
        '<input id="engLast" class="inp" type="text" autocomplete="family-name" autocapitalize="characters" placeholder="HONG" data-bind="engLast" value="' + esc(state.engLast) + '"></div>' +
        '<div class="field' + errCls('engFirst') + '" data-field="engFirst"><label for="engFirst">이름 (First Name)</label>' +
        '<input id="engFirst" class="inp" type="text" autocomplete="given-name" autocapitalize="characters" placeholder="GILSUN" data-bind="engFirst" value="' + esc(state.engFirst) + '"></div>' +
        '</div>' + errMsg('engLast') + errMsg('engFirst') +
        '<p class="note">국적이 한국이 아니거나 ①, ② 중 하나라도 \'예\'이면 필수예요.</p></div>';
    } else {
      h += '<p class="callout">' + I.info + '<span>국적이 한국이고 ①, ②가 모두 \'아니오\'이면 납세자 정보는 작성하지 않아도 돼요.</span></p>';
    }
    h += '</section>';

    if (tax) {
      h += '<section class="sec" aria-labelledby="secTax"><div class="sec-hd"><h3 id="secTax">3. 납세자 정보</h3>' +
        '<p>해외 거주지국과 납세자번호(TIN)를 입력해 주세요. 미국인은 필수이며, 거주지국이 여러 곳이면 모두 입력해 주세요.</p></div>';
      state.residences.forEach(function (r, i) { h += renderResidence(r, i); });
      var full = state.residences.length >= F.MAX_RESIDENCES;
      h += '<button type="button" class="btn-add" data-action="res-add"' + (full ? ' disabled' : '') + '>' + I.plus +
        (full ? '거주지국은 최대 ' + F.MAX_RESIDENCES + '개까지 입력할 수 있어요' : '거주지국 추가 (최대 ' + F.MAX_RESIDENCES + '개)') + '</button>';
      h += '</section>';
    }
    return h;
  }

  function renderResidence(r, i) {
    var p = 'res' + i + '.';
    var isUS = r.country === 'US';
    var h = '<div class="card" data-res="' + i + '"><div class="res-hd"><span class="tag">거주지국 ' + (i + 1) + '</span>' +
      (state.residences.length > 1 ? '<button type="button" class="txt-btn" data-action="res-remove" data-i="' + i + '">삭제</button>' : '') + '</div>';

    h += '<div class="field' + errCls(p + 'country') + '"><span class="lbl" id="resLbl' + i + '">거주지국</span>' +
      '<button type="button" class="sel-btn" data-action="res-country" data-i="' + i + '" aria-haspopup="dialog" aria-labelledby="resLbl' + i + ' resVal' + i + '">' +
      '<span id="resVal' + i + '"' + (r.country ? '' : ' class="ph"') + '>' + esc(r.country ? F.countryName(r.country) : '국가를 선택해 주세요') + '</span>' + I.chevron + '</button>' +
      errMsg(p + 'country') + '</div>';

    h += '<div class="field' + errCls(p + 'address') + '"><label for="addr' + i + '">영문주소 (우편번호 포함)</label>' +
      '<textarea id="addr' + i + '" class="inp" rows="2" autocapitalize="characters" placeholder="Street, City, State, ZIP Code" data-bind="address" data-i="' + i + '">' + esc(r.address) + '</textarea>' +
      errMsg(p + 'address') + '</div>';

    h += '<div class="field' + errCls(p + 'tin') + '"><label for="tin' + i + '">' + (isUS ? '납세자번호 (TIN: SSN 또는 ITIN)' : '납세자번호 (TIN)') + '</label>' +
      '<input id="tin' + i + '" class="inp" type="text" ' + (isUS ? 'inputmode="numeric" placeholder="\'-\' 없이 9자리 숫자"' : 'placeholder="납세자번호를 입력해 주세요"') +
      ' data-bind="tin" data-i="' + i + '" value="' + esc(r.tin) + '">' + errMsg(p + 'tin') + '</div>';

    if (!isUS) {
      var off = !!r.tin;
      h += '<fieldset class="field" style="border:0;margin:0;padding:0"' + (off ? ' disabled' : '') + '>' +
        '<legend style="margin-bottom:8px">납세자번호가 없다면 사유를 선택해 주세요 <span style="color:var(--muted);font-weight:400">(미국 외 국가만 해당)</span></legend>' +
        '<div class="chips">' + F.NO_TIN_REASONS.map(function (o) {
          return '<button type="button" aria-pressed="' + (!off && r.noTinReason === o.key) + '" data-action="reason" data-i="' + i + '" data-v="' + o.key + '"' + (off ? ' disabled' : '') + '>' + esc(o.label) + '</button>';
        }).join('') + '</div>';
      if (!off && r.noTinReason === 'etc') {
        h += '<div class="field' + errCls(p + 'noTinEtc') + '"><input class="inp" type="text" aria-label="기타 사유" placeholder="기타 사유를 입력해 주세요" data-bind="noTinEtc" data-i="' + i + '" value="' + esc(r.noTinEtc) + '">' + errMsg(p + 'noTinEtc') + '</div>';
      }
      h += '</fieldset>';
    }
    return h + '</div>';
  }

  /* ---------- 2단계: 증빙서류 첨부 ---------- */
  function renderStep2() {
    var pr = F.docProgress(state);
    var h = '<div class="title"><h2>증빙서류 사진을<br>첨부해 주세요</h2>' +
      '<p>아래 ' + pr.total + '가지 서류를 모두 등록해야 다음 단계로 넘어갈 수 있어요.</p></div>';
    h += '<div class="doc-head"><h3>필수 서류</h3><span class="count" role="status"><b>' + pr.done + '</b> / ' + pr.total + ' 등록</span></div>';
    F.requiredDocs(state).forEach(function (d, i) {
      var f = state.docs[d.key];
      h += '<section class="card' + (f ? '' : '') + '" aria-labelledby="doc-' + d.key + '">' +
        '<div class="doc-title"><div><h4 id="doc-' + d.key + '">' + '①②'.charAt(i) + ' ' + esc(d.title) + '</h4><p>' + esc(d.desc) + '</p></div>' +
        (f ? '<span class="badge ok">' + I.check + '등록 완료</span>' : '<span class="badge req">필수</span>') + '</div>';
      if (f) {
        h += '<div class="file"><div class="thumb"' + (f.url ? ' style="background-image:url(\'' + esc(f.url) + '\')"' : '') + ' aria-hidden="true">' + (f.url ? '' : 'PDF') + '</div>' +
          '<div class="file-meta"><span class="nm">' + esc(f.name) + '</span><span class="sz">' + F.fmtSize(f.size) + '</span></div>' +
          '<button type="button" class="icon-btn" data-action="doc-remove" data-key="' + d.key + '" aria-label="' + esc(d.title) + ' 삭제">' + I.trash + '</button></div>';
      } else {
        h += '<div class="row2">' +
          '<button type="button" class="btn-line" data-action="doc-camera" data-key="' + d.key + '">' + I.camera + '촬영하기</button>' +
          '<button type="button" class="btn-line" data-action="doc-album" data-key="' + d.key + '">' + I.album + '앨범에서 선택</button></div>';
      }
      if (ui.docErr[d.key]) h += '<p class="err" role="alert">' + esc(ui.docErr[d.key]) + '</p>';
      h += '</section>';
    });
    h += '<ul class="tips"><li>JPG, PNG, PDF 파일을 파일당 최대 ' + F.MAX_FILE_MB + 'MB까지 첨부할 수 있어요.</li>' +
      '<li>서류 전체가 화면에 나오도록 밝은 곳에서 촬영해 주세요.</li>' +
      '<li>글자가 흐리거나 잘리면 다시 요청드릴 수 있어요.</li></ul>';
    return h;
  }

  /* ---------- 3단계: 본인인증 ---------- */
  function renderStep3() {
    var s = F.summary(state);
    var h = '<div class="title"><h2>본인인증 후<br>제출을 완료해요</h2><p>작성 내용을 한 번 더 확인해 주세요.</p></div>';
    h += '<dl class="summary">' +
      '<div><dt>미국인 여부</dt><dd>' + esc(s.usPerson) + '</dd></div>' +
      '<div><dt>해외 조세목적상 거주자</dt><dd>' + esc(s.foreignResident) + '</dd></div>' +
      '<div><dt>거주지국</dt><dd>' + esc(s.countries) + '</dd></div>' +
      (F.needsTaxInfo(state) ? '<div><dt>영문성명</dt><dd>' + esc(s.engName) + '</dd></div>' : '') +
      '<div><dt>증빙서류</dt><dd>' + esc(s.docs) + '</dd></div></dl>';
    h += '<div class="radios" role="radiogroup" aria-labelledby="authLabel"><h3 id="authLabel">인증 방법</h3>' +
      ['simple', 'joint', 'finance'].map(function (k) {
        return '<button type="button" class="radio-card" role="radio" aria-checked="' + (state.authMethod === k) + '" data-action="auth" data-v="' + k + '"><span class="dot" aria-hidden="true"></span>' + F.AUTH_METHODS[k] + '</button>';
      }).join('') + '</div>';
    return h;
  }

  function renderDone() {
    return '<div class="done"><div class="ic">' + I.checkBig + '</div><h2>FATCA·CRS 본인확인서<br>제출이 완료됐어요</h2>' +
      '<p>제출하신 내용은 확인 후 계약 정보에 반영돼요.<br>추가 서류가 필요하면 따로 안내드릴게요.</p></div>';
  }

  /* ---------- 하단 ---------- */
  function renderFooter() {
    if (ui.step === 1) return '<button type="button" class="btn-primary" data-action="next">다음</button>';
    if (ui.step === 2) {
      var pr = F.docProgress(state);
      return (pr.ready ? '' : '<p class="status" role="status">' + esc(pr.msg) + '</p>') +
        '<button type="button" class="btn-primary" data-action="next"' + (pr.ready ? '' : ' disabled') + '>다음</button>';
    }
    if (ui.step === 3) {
      return '<button type="button" class="btn-primary" data-action="submit"' + (ui.submitting ? ' disabled' : '') + '>' +
        (ui.submitting ? '<span class="spinner" aria-hidden="true"></span>인증 진행 중' : '인증하고 제출하기') + '</button>';
    }
    return '<button type="button" class="btn-primary" data-action="restart">확인</button>';
  }

  function render(opts) {
    opts = opts || {};
    var y = window.scrollY;
    renderStepper();
    $main.innerHTML = ui.step === 1 ? renderStep1() : ui.step === 2 ? renderStep2() : ui.step === 3 ? renderStep3() : renderDone();
    $footer.innerHTML = renderFooter();
    if (opts.top) { window.scrollTo(0, 0); $main.focus({ preventScroll: true }); }
    else window.scrollTo(0, y);
  }

  function go(step) {
    ui.step = step; ui.showErrors = false; ui.errors = {};
    render({ top: true });
  }

  function validate() {
    var list = F.validateStep1(state);
    ui.errors = {};
    list.forEach(function (e) { if (!ui.errors[e.field]) ui.errors[e.field] = e.msg; });
    return list;
  }

  /* ---------- 이벤트 ---------- */
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-action]');
    if (!el || el.disabled) return;
    var a = el.getAttribute('data-action');
    var i = +el.getAttribute('data-i');
    var v = el.getAttribute('data-v');
    var key = el.getAttribute('data-key');

    switch (a) {
      case 'back':
        if (ui.step > 1 && ui.step < 4) go(ui.step - 1);
        else if (history.length > 1) history.back();
        return;
      case 'us': F.setUsPerson(state, v); refreshErrors(); render(); return;
      case 'fr': F.setForeignResident(state, v); refreshErrors(); render(); return;
      case 'res-add': F.addResidence(state); render(); focusLast('[data-res] .sel-btn'); return;
      case 'res-remove': F.removeResidence(state, i); refreshErrors(); render(); return;
      case 'res-country': openSheet(i, el); return;
      case 'reason':
        state.residences[i].noTinReason = state.residences[i].noTinReason === v ? '' : v;
        refreshErrors(); render(); return;
      case 'doc-camera': pickFile(key, 'fileCamera'); return;
      case 'doc-album': pickFile(key, 'fileAlbum'); return;
      case 'doc-remove': F.clearDoc(state, key); ui.docErr[key] = ''; render(); return;
      case 'auth': state.authMethod = v; render(); return;
      case 'next': return next();
      case 'submit': return submit();
      case 'restart': state = F.createState(F.SAMPLE_CUSTOMER); go(1); return;
      case 'sheet-close': closeSheet(false); return;
      case 'sheet-done': closeSheet(true); return;
      case 'sheet-pick': ui.sheet.code = el.getAttribute('data-code'); renderSheet(); return;
    }
  });

  document.addEventListener('input', function (ev) {
    var el = ev.target;
    var b = el.getAttribute('data-bind');
    if (!b) return;
    var i = +el.getAttribute('data-i');
    var r = state.residences[i];
    if (b === 'engLast' || b === 'engFirst') {
      var n = F.normalizeEng(el.value);
      if (n !== el.value) setVal(el, n);
      state[b] = n;
    } else if (b === 'address') {
      r.address = el.value;
    } else if (b === 'tin') {
      var t = F.normalizeTin(r.country, el.value);
      if (t !== el.value) setVal(el, t);
      var had = !!r.tin;
      r.tin = t;
      if (had !== !!t && r.country !== 'US') { render(); refocus('tin' + i); }
    } else if (b === 'noTinEtc') {
      r.noTinEtc = el.value;
    }
    clearFieldError(el);
  });

  document.addEventListener('change', function (ev) {
    var el = ev.target;
    if (el.getAttribute('data-bind') === 'usType') {
      state.usTypes[el.getAttribute('data-key')] = el.checked;
      refreshErrors(); render();
    }
  });

  function setVal(el, v) {
    var pos = el.selectionStart;
    el.value = v;
    try { el.setSelectionRange(Math.min(pos, v.length), Math.min(pos, v.length)); } catch (e) { /* noop */ }
  }
  function refocus(id) {
    var el = document.getElementById(id);
    if (el) { el.focus(); var l = el.value.length; try { el.setSelectionRange(l, l); } catch (e) { /* noop */ } }
  }
  function focusLast(sel) {
    var all = document.querySelectorAll(sel);
    if (all.length) all[all.length - 1].focus();
  }
  function refreshErrors() { if (ui.showErrors) validate(); }
  function clearFieldError(el) {
    if (!ui.showErrors) return;
    var f = el.closest('.field');
    if (f) f.classList.remove('is-err');
    validate();
    document.querySelectorAll('[data-err]').forEach(function (p) {
      var k = p.getAttribute('data-err');
      if (!ui.errors[k] && !p.hidden) p.hidden = true;
    });
  }

  function next() {
    if (ui.step === 1) {
      var list = validate();
      if (list.length) {
        ui.showErrors = true;
        render();
        var first = document.querySelector('.is-err input, .is-err textarea, .is-err button, [data-field="usTypes"] input');
        var target = first || document.querySelector('.err:not([hidden])');
        if (target) { target.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (target.focus) target.focus({ preventScroll: true }); }
        return;
      }
      // 작성 대상이 아니면 납세자번호 증명서는 필요 없음
      if (!F.needsTaxInfo(state)) F.clearDoc(state, 'tin');
      go(2);
    } else if (ui.step === 2) {
      if (F.docProgress(state).ready) go(3);
    }
  }

  function submit() {
    ui.submitting = true;
    render();
    // TODO: 실제 인증 모듈(간편인증/공동인증서/금융인증서) 호출 후 서버로 전송
    var payload = F.buildPayload(state);
    if (window.console) console.info('[FATCA-CRS] submit payload', payload);
    setTimeout(function () { ui.submitting = false; go(4); }, 900);
  }

  /* ---------- 파일 첨부 ---------- */
  var pendingDoc = null;
  var $cam = document.getElementById('fileCamera');
  var $alb = document.getElementById('fileAlbum');
  $alb.setAttribute('accept', F.ACCEPT_ATTR);
  function pickFile(key, inputId) {
    pendingDoc = key;
    var inp = document.getElementById(inputId);
    inp.value = '';
    inp.click();
  }
  [$cam, $alb].forEach(function (inp) {
    inp.addEventListener('change', function () {
      var file = inp.files && inp.files[0];
      if (!file || !pendingDoc) return;
      var msg = F.checkFile(file);
      ui.docErr[pendingDoc] = msg;
      if (!msg) F.setDoc(state, pendingDoc, file);
      pendingDoc = null;
      render();
    });
  });

  /* ---------- 국가 선택 바텀시트 ---------- */
  var $sheet = document.getElementById('sheet');
  var $search = document.getElementById('natSearch');
  function openSheet(i, opener) {
    ui.sheet = { i: i, code: state.residences[i].country, opener: opener };
    $search.value = '';
    renderSheet();
    $sheet.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(function () { var b = $sheet.querySelector('[aria-pressed="true"]') || $search; b.focus(); }, 30);
  }
  function closeSheet(apply) {
    if (!ui.sheet) return;
    var i = ui.sheet.i;
    if (apply && ui.sheet.code) {
      var r = state.residences[i];
      if (r.country !== ui.sheet.code) {
        r.country = ui.sheet.code;
        r.tin = F.normalizeTin(r.country, r.tin);
        if (r.country === 'US') { r.noTinReason = ''; r.noTinEtc = ''; }
      }
      refreshErrors();
      render();
    }
    $sheet.hidden = true;
    document.body.style.overflow = '';
    ui.sheet = null;
    var btn = document.querySelector('[data-action="res-country"][data-i="' + i + '"]');
    if (btn) btn.focus();
  }
  function renderSheet() {
    var code = ui.sheet.code;
    document.getElementById('sheetFrequent').innerHTML = F.FREQUENT.map(function (c) {
      return '<button type="button" class="nat-chip" aria-pressed="' + (code === c) + '" data-action="sheet-pick" data-code="' + c + '">' +
        '<span class="cc">' + c + '</span>' + esc(F.countryName(c)) +
        '<svg class="ck" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg></button>';
    }).join('');
    renderSheetList();
  }
  function renderSheetList() {
    var code = ui.sheet.code;
    var list = F.searchCountries($search.value);
    document.getElementById('sheetList').innerHTML = list.length ? list.map(function (c) {
      return '<li><button type="button" aria-pressed="' + (code === c.code) + '" data-action="sheet-pick" data-code="' + c.code + '">' + esc(c.name) +
        (code === c.code ? I.check : '') + '</button></li>';
    }).join('') : '<li class="empty">검색 결과가 없어요.</li>';
  }
  $search.addEventListener('input', renderSheetList);
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && ui.sheet) closeSheet(false);
  });

  render();
})();
