/* FATCA·CRS 본인확인서 — 인터넷고객창구(PC) 레이어팝업 컨트롤러 */
(function () {
  'use strict';
  var F = window.FatcaCore;
  var esc = F.esc;

  var STEPS = ['본인확인서 작성', '증빙서류 첨부', '본인인증'];
  var PC_AUTH = ['simple', 'joint'];
  var state = F.createState(F.SAMPLE_CUSTOMER);
  var ui = { step: 1, errors: {}, showErrors: false, docErr: {}, submitting: false };

  var $layer = document.getElementById('layer');
  var $dlg = $layer.querySelector('.dlg');
  var $body = document.getElementById('dlgBody');
  var $open = document.getElementById('openDlg');
  var $portal = document.getElementById('portal');

  var I = {
    plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
    file: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/></svg>',
    phone: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M9 12l2 2 4-4"/></svg>',
    cert: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="14" rx="1"/><circle cx="12" cy="11" r="3"/><path d="M9 21l3-2 3 2"/></svg>',
    check: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>'
  };

  /* ---------- 조각 ---------- */
  function err(field) {
    var m = ui.showErrors && ui.errors[field];
    return '<p class="err" data-err="' + esc(field) + '"' + (m ? '' : ' hidden') + '>' + esc(m || '') + '</p>';
  }
  function ec(field) { return ui.showErrors && ui.errors[field] ? ' is-err' : ''; }
  function yn(name, value, action, label) {
    return '<div class="opts" role="radiogroup" aria-label="' + label + '">' + ['Y', 'N'].map(function (v) {
      return '<label class="opt"><input type="radio" name="' + name + '" value="' + v + '" data-action="' + action + '"' + (value === v ? ' checked' : '') + '>' + (v === 'Y' ? '예' : '아니오') + '</label>';
    }).join('') + '</div>';
  }
  function steps() {
    return '<ol class="steps" aria-label="진행 단계">' + STEPS.map(function (t, i) {
      var n = i + 1;
      return '<li' + (n === ui.step ? ' aria-current="step"' : n < ui.step ? ' class="done"' : '') + '>' + n + '. ' + t + '</li>';
    }).join('') + '</ol>';
  }
  function countryOptions(sel) {
    return '<option value=""' + (sel ? '' : ' selected') + '>국가 선택</option>' +
      F.FREQUENT.filter(function (c) { return c !== 'KR'; }).map(function (c) {
        return '<option value="' + c + '"' + (sel === c ? ' selected' : '') + '>' + esc(F.countryName(c)) + '</option>';
      }).join('') +
      '<optgroup label="전체 국가">' + F.COUNTRIES.filter(function (c) { return c.code !== 'KR' && F.FREQUENT.indexOf(c.code) < 0; }).map(function (c) {
        return '<option value="' + c.code + '"' + (sel === c.code ? ' selected' : '') + '>' + esc(c.name) + '</option>';
      }).join('') + '</optgroup>';
  }

  /* ---------- 1단계 ---------- */
  function step1() {
    var c = state.customer;
    var tax = F.needsTaxInfo(state);
    var usOn = state.usPerson === 'Y';
    var h = steps();
    h += '<p class="lead">「국제조세조정에 관한 법률」 및 「정기금융정보 자동교환을 위한 조세조약 이행규정」에 따라 대한민국 외 국가의 납세의무 여부를 확인합니다.</p>';

    h += '<section class="sec"><h2>1. 고객 인적사항</h2><table class="f"><tbody>' +
      '<tr><th scope="row">성명</th><td>' + esc(c.name) + '</td><th scope="row" style="width:120px">생년월일</th><td>' + esc(c.birth) + '</td></tr>' +
      '<tr><th scope="row">국적</th><td>' + esc(F.countryName(c.nationality)) + '</td><th scope="row" style="width:120px">전화번호</th><td>' + esc(c.phone) + '</td></tr>' +
      '<tr><th scope="row">주소</th><td colspan="3">' + esc(c.address) + '</td></tr>' +
      '</tbody></table><p class="note">※ 계약 정보로 자동 입력되며, 전화번호가 해외 번호인 경우 국가번호를 포함해 표시됩니다.</p></section>';

    h += '<section class="sec"><h2>2. 고객 확인사항</h2><table class="f"><tbody>';
    h += '<tr><th scope="row" class="l" style="width:380px;vertical-align:top"' + (usOn ? ' rowspan="2"' : '') + '>① 미국 세법상 미국인에 해당합니까?</th><td>' +
      yn('q1', state.usPerson, 'us', '미국인 해당 여부') + '</td></tr>';
    if (usOn) {
      h += '<tr><td class="sub' + ec('usTypes') + '"><fieldset><legend class="legend">\'예\'인 경우 해당되는 사항을 체크하십시오</legend><div class="opts" style="gap:6px 24px">' +
        F.US_TYPES.map(function (t) {
          return '<label class="opt"><input type="checkbox" data-bind="usType" data-key="' + t.key + '"' + (state.usTypes[t.key] ? ' checked' : '') + '>' + esc(t.label.replace(' (', '(')) + '</label>';
        }).join('') + '</div></fieldset>' + err('usTypes') + '</td></tr>';
    }
    h += '<tr><th scope="row" class="l" style="width:380px">② 대한민국 외의 조세목적상 해외 거주자가 있습니까?</th><td>' +
      yn('q2', state.foreignResident, 'fr', '해외 거주자 여부') + '</td></tr>';
    if (tax) {
      h += '<tr><th scope="row" class="l" style="width:380px">③ 영문성명 <span class="req">*</span></th><td><div class="row2">' +
        '<div class="' + ec('engLast').trim() + '"><input class="inp" aria-label="영문 성 (Last Name)" placeholder="성 (Last Name)" autocomplete="family-name" data-bind="engLast" value="' + esc(state.engLast) + '">' + err('engLast') + '</div>' +
        '<div class="' + ec('engFirst').trim() + '"><input class="inp" aria-label="영문 이름 (First Name)" placeholder="이름 (First Name)" autocomplete="given-name" data-bind="engFirst" value="' + esc(state.engFirst) + '">' + err('engFirst') + '</div>' +
        '</div></td></tr>';
    }
    h += '</tbody></table><p class="note">※ 국적이 한국이 아니거나 ①, ② 중 하나라도 \'예\'인 경우 영문성명과 납세자 정보를 반드시 작성해야 합니다.' +
      (tax ? '' : '<br>※ 국적이 한국이고 ①, ②가 모두 \'아니오\'인 경우 납세자 정보는 작성하지 않아도 됩니다.') + '</p></section>';

    if (tax) {
      h += '<section class="sec"><h2>3. 납세자 정보</h2><ul class="bul">' +
        '<li>해외 거주지국, 영문주소, 조세목적상 거주지국 및 납세자번호(TIN)를 작성해 주십시오. (미국인은 납세자번호 필수 기재)</li>' +
        '<li>한국 이외의 조세목적상 거주지국이 1개 이상인 경우 해당 국가를 모두 작성해 주십시오.</li>' +
        '<li>영문주소는 우편번호를 포함하여 작성해 주십시오.</li></ul>';
      state.residences.forEach(function (r, i) { h += residence(r, i); });
      var full = state.residences.length >= F.MAX_RESIDENCES;
      h += '<div class="right"><button type="button" class="btn btn-s btn-line" data-action="res-add"' + (full ? ' disabled title="최대 ' + F.MAX_RESIDENCES + '개까지 입력할 수 있습니다"' : '') + '>' + I.plus + '거주지국 추가</button></div></section>';
    }

    h += '<div class="actions"><button type="button" class="btn" data-action="close">취소</button><button type="button" class="btn btn-primary" data-action="next">다음</button></div>';
    return h;
  }

  function residence(r, i) {
    var p = 'res' + i + '.';
    var isUS = r.country === 'US';
    var h = '<table class="f" data-res="' + i + '"><tbody>';
    h += '<tr><th scope="row"><div class="res-cap">거주지국 ' + (i + 1) + ' <span class="req" aria-hidden="true">*</span>' +
      (state.residences.length > 1 ? '<button type="button" class="btn-txt" data-action="res-remove" data-i="' + i + '">삭제</button>' : '') + '</div></th>' +
      '<td><select class="sel' + ec(p + 'country') + '" aria-label="거주지국 ' + (i + 1) + '" data-bind="country" data-i="' + i + '">' + countryOptions(r.country) + '</select>' + err(p + 'country') + '</td>' +
      '<th scope="row" style="width:120px">영문주소 <span class="req" aria-hidden="true">*</span></th>' +
      '<td><input class="inp' + ec(p + 'address') + '" aria-label="거주지국 ' + (i + 1) + ' 영문주소" placeholder="Street, City, State, ZIP Code" data-bind="address" data-i="' + i + '" value="' + esc(r.address) + '">' + err(p + 'address') + '</td></tr>';
    h += '<tr><th scope="row">납세자번호<br><span class="sm">(' + (isUS ? 'TIN: SSN 또는 ITIN' : 'TIN') + ')</span></th><td colspan="3">' +
      '<input class="inp sm' + ec(p + 'tin') + '" id="tin' + i + '" aria-label="거주지국 ' + (i + 1) + ' 납세자번호" ' + (isUS ? 'inputmode="numeric" placeholder="\'-\' 없이 9자리 입력"' : 'placeholder="\'-\' 없이 입력"') +
      ' data-bind="tin" data-i="' + i + '" value="' + esc(r.tin) + '">' + err(p + 'tin') + '</td></tr>';
    if (!isUS) {
      var off = !!r.tin;
      h += '<tr><th scope="row">납세자번호<br>미기재 사유<br><span class="sm">(미국 외 국가 해당)</span></th><td colspan="3"><fieldset' + (off ? ' disabled' : '') + '>' +
        '<legend class="legend">' + (off ? '납세자번호를 입력하면 선택하지 않아도 됩니다.' : '납세자번호가 없는 경우 사유를 선택하십시오.') + '</legend><div class="opts" style="gap:6px 20px">' +
        F.NO_TIN_REASONS.map(function (o) {
          return '<label class="opt"><input type="radio" name="noTin' + i + '" value="' + o.key + '" data-action="reason" data-i="' + i + '"' + (!off && r.noTinReason === o.key ? ' checked' : '') + '>' + esc(o.label) + '</label>';
        }).join('') +
        '<input class="inp sm' + ec(p + 'noTinEtc') + '" aria-label="기타 사유" placeholder="기타 사유 입력" data-bind="noTinEtc" data-i="' + i + '" value="' + esc(r.noTinEtc) + '"' + (!off && r.noTinReason === 'etc' ? '' : ' disabled') + '>' +
        '</div></fieldset>' + err(p + 'noTinEtc') + '</td></tr>';
    }
    return h + '</tbody></table>';
  }

  /* ---------- 2단계 ---------- */
  function step2() {
    var pr = F.docProgress(state);
    var h = steps();
    h += '<p class="lead">아래 ' + pr.total + '가지 증빙서류를 모두 첨부해야 다음 단계로 진행할 수 있습니다.</p>';
    h += '<section class="sec"><div class="sec-hd"><h2>필수 증빙서류</h2><span class="count" role="status">등록 <b>' + pr.done + '</b> / ' + pr.total + '</span></div>';
    h += '<table class="f"><thead><tr><th scope="col" style="width:240px">서류명</th><th scope="col">첨부파일</th><th scope="col" style="width:120px">상태</th></tr></thead><tbody>';
    F.requiredDocs(state).forEach(function (d) {
      var f = state.docs[d.key];
      h += '<tr><th scope="row">' + esc(d.title) + ' <span class="req">*</span><br><span class="sm">' + (d.key === 'tin' && state.usPerson === 'Y' ? '(Social Security Number)' : esc(d.desc)) + '</span></th><td>';
      if (f) {
        h += '<div class="file-row">' + I.file + '<span class="nm">' + esc(f.name) + '</span><span class="sz">(' + F.fmtSize(f.size) + ')</span>' +
          '<button type="button" class="btn btn-s" data-action="doc-remove" data-key="' + d.key + '" aria-label="' + esc(d.title) + ' 삭제">삭제</button></div>';
      } else {
        h += '<div class="file-row"><button type="button" class="btn btn-s btn-line" data-action="doc-pick" data-key="' + d.key + '">파일찾기</button><span class="none">선택된 파일 없음</span></div>';
      }
      if (ui.docErr[d.key]) h += '<p class="err" role="alert">' + esc(ui.docErr[d.key]) + '</p>';
      h += '</td><td style="text-align:center">' + (f ? '<span class="chip ok">등록완료</span>' : '<span class="chip no">미등록</span>') + '</td></tr>';
    });
    h += '</tbody></table><ul class="bul">' +
      '<li>첨부 가능 파일: JPG, PNG, PDF (파일당 최대 ' + F.MAX_FILE_MB + 'MB)</li>' +
      '<li>서류 전체가 보이도록 선명하게 촬영하거나 스캔한 파일을 첨부해 주십시오.</li>' +
      '<li>내용 확인이 어려운 경우 서류를 다시 요청드릴 수 있습니다.</li></ul></section>';
    h += '<div class="actions-wrap">' + (pr.ready ? '' : '<p class="status" role="status">' + esc(pr.msg.replace('해 주세요.', '해 주십시오.')) + '</p>') +
      '<div class="actions"><button type="button" class="btn" data-action="prev">이전</button>' +
      '<button type="button" class="btn btn-primary" data-action="next"' + (pr.ready ? '' : ' disabled') + '>다음</button></div></div>';
    return h;
  }

  /* ---------- 3단계 ---------- */
  function step3() {
    var s = F.summary(state);
    if (PC_AUTH.indexOf(state.authMethod) < 0) state.authMethod = 'simple';
    var h = steps();
    h += '<p class="lead">작성 내용을 확인하신 후 인증 방법을 선택해 주십시오.</p>';
    h += '<section class="sec"><h2>작성 내용 확인</h2><table class="f"><tbody>' +
      '<tr><th scope="row">미국인 여부</th><td>' + esc(s.usPerson) + '</td><th scope="row">해외 거주자 여부</th><td>' + esc(s.foreignResident) + '</td></tr>' +
      '<tr><th scope="row">거주지국</th><td>' + esc(s.countries) + '</td><th scope="row">영문성명</th><td>' + esc(s.engName) + '</td></tr>' +
      '<tr><th scope="row">증빙서류</th><td colspan="3">' + esc(s.docs) + '</td></tr>' +
      '</tbody></table></section>';
    h += '<section class="sec"><h2 id="authLabel">인증 방법 선택</h2><div class="auth" role="radiogroup" aria-labelledby="authLabel">' +
      PC_AUTH.map(function (k) {
        return '<button type="button" role="radio" aria-checked="' + (state.authMethod === k) + '" data-action="auth" data-v="' + k + '">' + (k === 'simple' ? I.phone : I.cert) + F.AUTH_METHODS[k] + '</button>';
      }).join('') + '</div></section>';
    h += '<div class="actions"><button type="button" class="btn" data-action="prev"' + (ui.submitting ? ' disabled' : '') + '>이전</button>' +
      '<button type="button" class="btn btn-primary" data-action="submit"' + (ui.submitting ? ' disabled' : '') + '>' +
      (ui.submitting ? '<span class="spinner" aria-hidden="true"></span>인증 진행 중' : '인증하고 제출하기') + '</button></div>';
    return h;
  }

  function done() {
    return '<div class="done"><div class="ic">' + I.check + '</div><h2>FATCA·CRS 본인확인서 제출이 완료되었습니다.</h2>' +
      '<p>제출하신 내용은 확인 후 계약 정보에 반영됩니다.<br>추가 서류가 필요한 경우 별도로 안내드리겠습니다.</p></div>' +
      '<div class="actions"><button type="button" class="btn btn-primary" data-action="finish">확인</button></div>';
  }

  /* ---------- 렌더 ---------- */
  function render(top) {
    var y = $layer.scrollTop;
    $body.innerHTML = ui.step === 1 ? step1() : ui.step === 2 ? step2() : ui.step === 3 ? step3() : done();
    if (top) { $layer.scrollTop = 0; $dlg.focus({ preventScroll: true }); } else $layer.scrollTop = y;
  }
  function go(n) { ui.step = n; ui.showErrors = false; ui.errors = {}; render(true); }
  function validate() {
    var list = F.validateStep1(state);
    ui.errors = {};
    list.forEach(function (e) { if (!ui.errors[e.field]) ui.errors[e.field] = e.msg; });
    return list;
  }
  function refreshErrors() { if (ui.showErrors) validate(); }

  /* ---------- 레이어 열기/닫기 ---------- */
  var lastFocus = null;
  function openLayer() {
    lastFocus = document.activeElement;
    $layer.hidden = false;
    $portal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = 'hidden';
    render(true);
  }
  function closeLayer() {
    if (ui.step > 1 && ui.step < 4 && !window.confirm('작성 중인 내용이 저장되지 않습니다. 닫으시겠습니까?')) return;
    $layer.hidden = true;
    $portal.removeAttribute('aria-hidden');
    document.body.style.overflow = '';
    if (ui.step === 4) { state = F.createState(F.SAMPLE_CUSTOMER); ui.step = 1; }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  $open.addEventListener('click', openLayer);

  // 레이어 안에서 Tab 포커스 순환
  document.addEventListener('keydown', function (ev) {
    if ($layer.hidden) return;
    if (ev.key === 'Escape') { closeLayer(); return; }
    if (ev.key !== 'Tab') return;
    var f = $dlg.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (ev.shiftKey && (document.activeElement === first || document.activeElement === $dlg)) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  });

  /* ---------- 이벤트 ---------- */
  $layer.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-action]');
    if (!el || el.disabled || el.tagName === 'INPUT') return;
    var a = el.getAttribute('data-action');
    var i = +el.getAttribute('data-i');
    var key = el.getAttribute('data-key');
    switch (a) {
      case 'close': closeLayer(); return;
      case 'finish': closeLayer(); return;
      case 'res-add': F.addResidence(state); render(); var s = $body.querySelectorAll('[data-res] select'); if (s.length) s[s.length - 1].focus(); return;
      case 'res-remove': F.removeResidence(state, i); refreshErrors(); render(); return;
      case 'doc-pick': pickFile(key); return;
      case 'doc-remove': F.clearDoc(state, key); ui.docErr[key] = ''; render(); return;
      case 'auth': state.authMethod = el.getAttribute('data-v'); render(); return;
      case 'prev': go(ui.step - 1); return;
      case 'next': return next();
      case 'submit': return submit();
    }
  });

  $layer.addEventListener('change', function (ev) {
    var el = ev.target;
    var a = el.getAttribute('data-action');
    var b = el.getAttribute('data-bind');
    var i = +el.getAttribute('data-i');
    if (a === 'us') { F.setUsPerson(state, el.value); refreshErrors(); render(); }
    else if (a === 'fr') { F.setForeignResident(state, el.value); refreshErrors(); render(); }
    else if (a === 'reason') { state.residences[i].noTinReason = el.value; refreshErrors(); render(); }
    else if (b === 'usType') { state.usTypes[el.getAttribute('data-key')] = el.checked; refreshErrors(); render(); }
    else if (b === 'country') {
      var r = state.residences[i];
      r.country = el.value;
      r.tin = F.normalizeTin(r.country, r.tin);
      if (r.country === 'US') { r.noTinReason = ''; r.noTinEtc = ''; }
      refreshErrors(); render();
      var sel = $body.querySelector('select[data-i="' + i + '"]'); if (sel) sel.focus();
    }
  });

  $layer.addEventListener('input', function (ev) {
    var el = ev.target;
    var b = el.getAttribute('data-bind');
    if (!b || b === 'country') return;
    var i = +el.getAttribute('data-i');
    var r = state.residences[i];
    if (b === 'engLast' || b === 'engFirst') {
      var n = F.normalizeEng(el.value); if (n !== el.value) setVal(el, n); state[b] = n;
    } else if (b === 'address') r.address = el.value;
    else if (b === 'noTinEtc') r.noTinEtc = el.value;
    else if (b === 'tin') {
      var t = F.normalizeTin(r.country, el.value); if (t !== el.value) setVal(el, t);
      var had = !!r.tin; r.tin = t;
      if (had !== !!t && r.country !== 'US') {
        render();
        var inp = document.getElementById('tin' + i);
        if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
      }
    }
    if (ui.showErrors) {
      el.classList.remove('is-err');
      if (el.parentNode.classList) el.parentNode.classList.remove('is-err');
      validate();
      $body.querySelectorAll('[data-err]').forEach(function (p) { if (!ui.errors[p.getAttribute('data-err')]) p.hidden = true; });
    }
  });

  function setVal(el, v) {
    var pos = el.selectionStart; el.value = v;
    try { el.setSelectionRange(Math.min(pos, v.length), Math.min(pos, v.length)); } catch (e) { /* noop */ }
  }

  function next() {
    if (ui.step === 1) {
      if (validate().length) {
        ui.showErrors = true; render();
        var t = $body.querySelector('.is-err input, .is-err select, input.is-err, select.is-err, .err:not([hidden])');
        if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (t.focus) t.focus({ preventScroll: true }); }
        return;
      }
      if (!F.needsTaxInfo(state)) F.clearDoc(state, 'tin');
      go(2);
    } else if (ui.step === 2 && F.docProgress(state).ready) go(3);
  }

  function submit() {
    ui.submitting = true; render();
    // TODO: 실제 인증 모듈(간편인증/공동인증서) 호출 후 서버 전송
    var payload = F.buildPayload(state);
    if (window.console) console.info('[FATCA-CRS] submit payload', payload);
    setTimeout(function () { ui.submitting = false; go(4); }, 900);
  }

  /* ---------- 파일 ---------- */
  var $file = document.createElement('input');
  $file.type = 'file'; $file.accept = F.ACCEPT_ATTR; $file.hidden = true;
  document.body.appendChild($file);
  var pending = null;
  function pickFile(key) { pending = key; $file.value = ''; $file.click(); }
  $file.addEventListener('change', function () {
    var f = $file.files && $file.files[0];
    if (!f || !pending) return;
    var msg = F.checkFile(f);
    ui.docErr[pending] = msg ? msg.replace('있어요.', '있습니다.') : '';
    if (!msg) F.setDoc(state, pending, f);
    pending = null; render();
  });

  // 데모: 페이지 진입 시 바로 레이어팝업 표시 (?closed 로 끔)
  if (!/[?&]closed\b/.test(location.search)) openLayer();
})();
