/*
 * FATCA·CRS 본인확인 — 공통 상태 / 업무 규칙 / 검증
 * 웹(PC 레이어팝업)과 앱(모바일) 화면이 같은 규칙을 쓰도록 분리한 모듈입니다.
 * 프레임워크 의존 없음 (ES2017, 전역 window.FatcaCore).
 */
(function (global) {
  'use strict';

  /* ---------- 설정 ---------- */
  // 파일당 최대 용량(MB) — 디자인의 [용량] 자리. 업무 확정 후 바꿔 주세요.
  var MAX_FILE_MB = 10;
  var ACCEPT_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
  var ACCEPT_ATTR = '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf';
  var MAX_RESIDENCES = 2;

  // 계약 정보에서 자동 입력되는 고객 인적사항 예시 — 실제로는 서버에서 받아 createState 에 넘깁니다.
  var SAMPLE_CUSTOMER = {
    name: '홍길순', birth: '1990.01.01', nationality: 'KR',
    address: '[고객 주소]', phone: '010-****-1234'
  };

  /* ---------- 국가 목록 (ISO 3166-1 alpha-2, 가나다순) ---------- */
  var COUNTRIES = [
    ['GH', '가나'], ['GA', '가봉'], ['GY', '가이아나'], ['GM', '감비아'], ['GT', '과테말라'],
    ['GR', '그리스'], ['NG', '나이지리아'], ['ZA', '남아프리카공화국'], ['NL', '네덜란드'],
    ['NP', '네팔'], ['NO', '노르웨이'], ['NZ', '뉴질랜드'], ['TW', '대만'], ['KR', '대한민국'],
    ['DK', '덴마크'], ['DE', '독일'], ['LA', '라오스'], ['RU', '러시아'], ['LU', '룩셈부르크'],
    ['MY', '말레이시아'], ['MX', '멕시코'], ['MN', '몽골'], ['US', '미국'], ['MM', '미얀마'],
    ['VN', '베트남'], ['BE', '벨기에'], ['BR', '브라질'], ['SA', '사우디아라비아'],
    ['SE', '스웨덴'], ['CH', '스위스'], ['ES', '스페인'], ['SG', '싱가포르'],
    ['AE', '아랍에미리트'], ['AR', '아르헨티나'], ['IE', '아일랜드'], ['GB', '영국'],
    ['AT', '오스트리아'], ['UZ', '우즈베키스탄'], ['IT', '이탈리아'], ['IN', '인도'],
    ['ID', '인도네시아'], ['JP', '일본'], ['CN', '중국'], ['CZ', '체코'], ['CL', '칠레'],
    ['KZ', '카자흐스탄'], ['KH', '캄보디아'], ['CA', '캐나다'], ['TH', '태국'], ['TR', '튀르키예'],
    ['PK', '파키스탄'], ['PT', '포르투갈'], ['PL', '폴란드'], ['FR', '프랑스'], ['FI', '핀란드'],
    ['PH', '필리핀'], ['HU', '헝가리'], ['AU', '호주'], ['HK', '홍콩']
  ].map(function (c) { return { code: c[0], name: c[1] }; });
  var FREQUENT = ['KR', 'US', 'CN', 'JP'];

  function countryName(code) {
    for (var i = 0; i < COUNTRIES.length; i++) if (COUNTRIES[i].code === code) return COUNTRIES[i].name;
    return '';
  }
  function searchCountries(q) {
    q = (q || '').trim();
    if (!q) return COUNTRIES.slice();
    return COUNTRIES.filter(function (c) { return c.name.indexOf(q) > -1 || c.code === q.toUpperCase(); });
  }

  var US_TYPES = [
    { key: 'citizen', label: '미국시민권자 (이중국적자 포함)', short: '미국시민권자' },
    { key: 'greenCard', label: '미국영주권자', short: '미국영주권자' },
    { key: 'resident', label: '미국거주자', short: '미국거주자' }
  ];
  var NO_TIN_REASONS = [
    { key: 'notIssued', label: '미발급 국가' },
    { key: 'notRequired', label: '미요구 국가' },
    { key: 'notObtained', label: '미취득' },
    { key: 'etc', label: '기타' }
  ];
  var DOCS = {
    rrn: { key: 'rrn', title: '주민등록등본', desc: '성명과 주소가 보이도록 전체를 촬영해 주세요.' },
    tin: { key: 'tin', title: '납세자번호 증명서', desc: '납세자번호(미국인은 SSN)가 확인되는 카드 또는 서류' }
  };
  var AUTH_METHODS = {
    simple: '간편인증', joint: '공동인증서', finance: '금융인증서'
  };

  /* ---------- 상태 ---------- */
  function newResidence(country) {
    return { country: country || '', address: '', tin: '', noTinReason: '', noTinEtc: '' };
  }

  // customer: 계약 정보에서 자동 입력되는 고객 인적사항 (서버 연동 시 교체)
  function createState(customer) {
    return {
      customer: customer,
      usPerson: 'N',               // ① 미국 세법상 미국인 여부 Y/N
      usTypes: { citizen: false, greenCard: false, resident: false },
      foreignResident: 'N',        // ② 대한민국 외 조세목적상 거주자 여부 Y/N
      engLast: '', engFirst: '',   // ③ 영문성명
      residences: [],              // 3. 납세자 정보
      docs: { rrn: null, tin: null }, // { file, name, size, url }
      authMethod: 'simple'
    };
  }

  /* ---------- 업무 규칙 ---------- */
  // 국적이 한국이 아니거나 ①, ② 중 하나라도 '예'이면 영문성명·납세자 정보 필수
  function needsTaxInfo(s) {
    return s.usPerson === 'Y' || s.foreignResident === 'Y' || s.customer.nationality !== 'KR';
  }

  function setUsPerson(s, v) {
    s.usPerson = v;
    if (v === 'Y') {
      if (!s.residences.some(function (r) { return r.country === 'US'; })) {
        var empty = s.residences.filter(function (r) { return !r.country; })[0];
        if (empty) empty.country = 'US';
        else if (s.residences.length < MAX_RESIDENCES) s.residences.unshift(newResidence('US'));
        else s.residences[0] = newResidence('US');
      }
    } else {
      s.usTypes = { citizen: false, greenCard: false, resident: false };
    }
    syncResidences(s);
  }
  function setForeignResident(s, v) {
    s.foreignResident = v;
    syncResidences(s);
  }
  function syncResidences(s) {
    if (!needsTaxInfo(s)) { s.residences = []; return; }
    if (s.residences.length === 0) s.residences.push(newResidence(s.usPerson === 'Y' ? 'US' : ''));
  }
  function addResidence(s) {
    if (s.residences.length >= MAX_RESIDENCES) return false;
    s.residences.push(newResidence(''));
    return true;
  }
  function removeResidence(s, i) {
    if (s.residences.length <= 1) return false;
    s.residences.splice(i, 1);
    return true;
  }

  // 필요한 증빙서류: 주민등록등본은 항상, 납세자번호 증명서는 납세자 정보 작성 대상일 때
  function requiredDocs(s) {
    var list = [DOCS.rrn];
    if (needsTaxInfo(s)) list.push(DOCS.tin);
    return list;
  }

  /* ---------- 입력 정규화 ---------- */
  function normalizeEng(v) { return (v || '').toUpperCase().replace(/[^A-Z \-']/g, ''); }
  function normalizeTin(country, v) {
    v = (v || '').toUpperCase();
    return country === 'US' ? v.replace(/\D/g, '').slice(0, 9) : v.replace(/[^A-Z0-9\-]/g, '').slice(0, 30);
  }

  /* ---------- 검증 (1단계) ---------- */
  // 반환: [{ field, msg }] — field 는 화면의 data-field 값과 매칭
  function validateStep1(s) {
    var e = [];
    function err(field, msg) { e.push({ field: field, msg: msg }); }

    if (s.usPerson === 'Y' && !US_TYPES.some(function (t) { return s.usTypes[t.key]; })) {
      err('usTypes', '미국인에 해당하는 사항을 1개 이상 선택해 주세요.');
    }
    if (!needsTaxInfo(s)) return e;

    if (!s.engLast.trim()) err('engLast', '영문 성(Last Name)을 입력해 주세요.');
    if (!s.engFirst.trim()) err('engFirst', '영문 이름(First Name)을 입력해 주세요.');

    var seen = {};
    s.residences.forEach(function (r, i) {
      var p = 'res' + i + '.';
      var n = '거주지국 ' + (i + 1) + ': ';
      if (!r.country) err(p + 'country', n + '거주지국을 선택해 주세요.');
      else if (r.country === 'KR') err(p + 'country', n + '대한민국 외 국가를 선택해 주세요.');
      else if (seen[r.country]) err(p + 'country', n + '이미 입력한 국가예요.');
      seen[r.country] = true;

      if (!r.address.trim()) err(p + 'address', n + '영문주소를 입력해 주세요.');
      else if (/[^\x20-\x7E]/.test(r.address)) err(p + 'address', n + '영문주소는 영문·숫자·기호로만 입력해 주세요.');
      else if (!/\d{3,}/.test(r.address)) err(p + 'address', n + '영문주소에 우편번호를 포함해 주세요.');

      if (r.country === 'US') {
        if (!/^\d{9}$/.test(r.tin)) err(p + 'tin', n + '미국 납세자번호(SSN/ITIN) 9자리를 입력해 주세요.');
      } else if (!r.tin) {
        if (!r.noTinReason) err(p + 'tin', n + '납세자번호를 입력하거나 미기재 사유를 선택해 주세요.');
        else if (r.noTinReason === 'etc' && !r.noTinEtc.trim()) err(p + 'noTinEtc', n + '기타 사유를 입력해 주세요.');
      }
    });
    if (s.usPerson === 'Y' && !s.residences.some(function (r) { return r.country === 'US'; })) {
      err('res0.country', '미국인은 거주지국에 미국을 포함해 주세요.');
    }
    return e;
  }

  /* ---------- 증빙서류 ---------- */
  function checkFile(file) {
    if (!file) return '파일을 선택해 주세요.';
    if (ACCEPT_TYPES.indexOf(file.type) < 0 && !/\.(jpe?g|png|pdf)$/i.test(file.name)) {
      return 'JPG, PNG, PDF 파일만 첨부할 수 있어요.';
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) return '파일당 최대 ' + MAX_FILE_MB + 'MB까지 첨부할 수 있어요.';
    return '';
  }
  function setDoc(s, key, file) {
    clearDoc(s, key);
    var isImg = /^image\//.test(file.type);
    s.docs[key] = {
      file: file, name: file.name, size: file.size,
      url: isImg && global.URL ? URL.createObjectURL(file) : ''
    };
  }
  function clearDoc(s, key) {
    var d = s.docs[key];
    if (d && d.url && global.URL) URL.revokeObjectURL(d.url);
    s.docs[key] = null;
  }
  function docProgress(s) {
    var req = requiredDocs(s);
    var done = req.filter(function (d) { return !!s.docs[d.key]; });
    var missing = req.filter(function (d) { return !s.docs[d.key]; });
    var msg = '';
    if (missing.length) {
      msg = missing.map(function (d, i) {
        return i < missing.length - 1 ? josa(d.title, '과', '와') : josa(d.title, '을', '를');
      }).join(' ') + ' 첨부해 주세요.';
    }
    return { total: req.length, done: done.length, ready: missing.length === 0, missing: missing, msg: msg };
  }

  /* ---------- 요약 / 전송 데이터 ---------- */
  function summary(s) {
    var us = s.usPerson === 'Y'
      ? '예 (' + US_TYPES.filter(function (t) { return s.usTypes[t.key]; }).map(function (t) { return t.short; }).join(', ') + ')'
      : '아니오';
    var docs = requiredDocs(s).filter(function (d) { return s.docs[d.key]; });
    return {
      usPerson: us,
      foreignResident: s.foreignResident === 'Y' ? '예' : '아니오',
      countries: s.residences.map(function (r) { return countryName(r.country); }).join(', ') || '해당 없음',
      engName: needsTaxInfo(s) ? (s.engLast + ' ' + s.engFirst).trim() : '해당 없음',
      docs: docs.length + '건 (' + docs.map(function (d) { return d.title; }).join(', ') + ')'
    };
  }

  // 서버 전송용 데이터 — 필드명은 연동 API 스펙에 맞게 조정하세요.
  function buildPayload(s) {
    var tax = needsTaxInfo(s);
    return {
      usPersonYn: s.usPerson,
      usPersonTypes: US_TYPES.filter(function (t) { return s.usTypes[t.key]; }).map(function (t) { return t.key; }),
      foreignTaxResidentYn: s.foreignResident,
      engLastName: tax ? s.engLast.trim() : '',
      engFirstName: tax ? s.engFirst.trim() : '',
      taxResidences: s.residences.map(function (r) {
        return {
          countryCode: r.country,
          engAddress: r.address.trim(),
          tin: r.tin,
          noTinReason: r.tin ? '' : r.noTinReason,
          noTinReasonEtc: !r.tin && r.noTinReason === 'etc' ? r.noTinEtc.trim() : ''
        };
      }),
      documents: requiredDocs(s).map(function (d) {
        var f = s.docs[d.key];
        return { type: d.key, fileName: f ? f.name : '', size: f ? f.size : 0 };
      }),
      authMethod: s.authMethod
    };
  }

  /* ---------- 유틸 ---------- */
  // 받침 유무에 따라 조사 선택 (예: 등본+을, 증명서+를)
  function josa(word, withBatchim, without) {
    var c = word.charCodeAt(word.length - 1);
    var has = c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 > 0;
    return word + (has ? withBatchim : without);
  }
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtSize(b) {
    return b >= 1024 * 1024 ? (b / 1024 / 1024).toFixed(1) + 'MB' : Math.max(1, Math.round(b / 1024)) + 'KB';
  }

  global.FatcaCore = {
    SAMPLE_CUSTOMER: SAMPLE_CUSTOMER, MAX_FILE_MB: MAX_FILE_MB, ACCEPT_ATTR: ACCEPT_ATTR, MAX_RESIDENCES: MAX_RESIDENCES,
    COUNTRIES: COUNTRIES, FREQUENT: FREQUENT, US_TYPES: US_TYPES, NO_TIN_REASONS: NO_TIN_REASONS,
    DOCS: DOCS, AUTH_METHODS: AUTH_METHODS,
    countryName: countryName, searchCountries: searchCountries,
    createState: createState, needsTaxInfo: needsTaxInfo,
    setUsPerson: setUsPerson, setForeignResident: setForeignResident,
    addResidence: addResidence, removeResidence: removeResidence,
    requiredDocs: requiredDocs, normalizeEng: normalizeEng, normalizeTin: normalizeTin,
    validateStep1: validateStep1, checkFile: checkFile, setDoc: setDoc, clearDoc: clearDoc,
    docProgress: docProgress, summary: summary, buildPayload: buildPayload,
    esc: esc, fmtSize: fmtSize, josa: josa
  };
})(typeof window !== 'undefined' ? window : globalThis);
