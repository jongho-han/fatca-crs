# FATCA·CRS 본인확인서 (모바일 MA-0087P · 인터넷창구 ICM_110_P01)

사내 마크업(`MA-0087P.jsp`, `ICM_110_P01.jsp`)에 그대로 붙는 화면 스크립트입니다. 마크업과 CSS는 바꾸지 않았습니다.

| 파일 | 내용 |
| --- | --- |
| `assets/m/mcc/js/view/ma/MA-0087P.js` | 모바일 전체 팝업. jQuery 2.1, `Dcore.http.ajax`, `dialog.alert/confirm/select/closePopup` |
| `assets/w/icc/js/ICM_110_P01.js` | 인터넷창구 레이어팝업. jQuery 1.11, `$.ajax`, `alert/confirm` |
| `preview-m.html`, `preview-w.html` | 미리보기(반입 대상 아님). 서버 호출·알림만 가짜. `?s=번호`로 시나리오 선택 |
| `index.html` | 시나리오 모음(iframe) |
| `preview-assets/m.css`, `w.css` | 미리보기 전용 대체 CSS. 사내 CSS를 못 불러올 때만(GitHub Pages 등) 붙는다. 디자인 캔버스 기준 |

미리보기는 사내 `assets/m/mcc/pub/...`, `assets/w/icc/css·js`(jQuery, CSS, ui.js/default.js)를 먼저 찾습니다. 이 저장소에는 없으므로, 없으면 jQuery는 공개 CDN에서, CSS는 `preview-assets/`의 대체 CSS로 불러옵니다. 사내 환경에서는 사내 파일만 씁니다.

## 호출

```js
// 모바일
MA0087P.onInit({bizCd: "08", bizNm: "보험계약대출"});
// → 제출 완료: dialog.closePopup({result: "SUCCESS", usYn, frgnTaxResYn}) / 중단: {result: "CANCEL"} / 조회 실패: {result: "FAIL"}

// 인터넷창구
fatcaCrs.open({bizCd: "08", bizNm: "보험계약대출", auth: function () { return 본인인증Promise; }})
  .then(function (ret) { /* "SUCCESS" | "CANCEL" | "FAIL" */ });
```

인터넷창구는 증빙 저장 후 3단계 본인인증으로 넘어가 `opts.auth()` 결과를 기다립니다. `auth`를 넘기지 않으면 인증 없이 완료합니다.

## 업무 규칙

- **기본값**: ①·② 모두 '아니오'.
- **납세자 정보 작성 대상**: 외국인(domesticYn=N)이거나 ①, ② 중 하나라도 '예'이면 영문성명·납세자 정보가 보이고 필수가 됩니다.
- **영문성명**: 영문·숫자만, 대문자로 바뀝니다.
- **영문주소·기타 사유**: 한글 등 비ASCII 문자는 지워지고, 주소에는 숫자(우편번호)가 있어야 합니다.
- **거주지국**: 최대 2개. 대한민국과 중복 국가는 안 되고, ① '예'이면 미국이 포함돼야 합니다.
- **납세자번호**: 영문 대문자·숫자·하이픈, 최대 30자. 미국은 하이픈을 뺀 숫자 9자리입니다. 번호를 적으면 미기재 사유 행이 숨겨지고, 비우면 사유가 필수입니다(기타는 사유 입력 필수).
- **증빙 (CASE 문서 11-05)**:
  - 납세자번호 증명서: 번호를 적은 거주지국이 있거나 미국 번호를 비웠을 때만 보이고, 보이면 필수입니다.
  - 세법상 거주지 증빙: ①·② 모두 아니오이거나 미국 번호를 비웠을 때 필수이고, 그 밖에는 선택입니다. 첨부하면 서류 종류도 필수입니다.
  - 파일: JPG·JPEG·PNG, 서류당 1장, 최대 10MB.

## 연결할 곳 (TODO)

- `URL_INIT`, `URL_SAVE`: 실제 서비스 URL. 미리보기 가짜 서버는 URL이 `S01`로 끝나거나(모바일) `S01`을 포함할 때(인터넷창구) 조회로 봅니다.
- 저장 파라미터 이름(`buildParam`)은 정의서에 맞춰 조정합니다.
- 첨부 파일 전송: 인터넷창구는 `FormData`(`param` + `atcTin`, `atcRes`)로 보냅니다. 모바일은 사내 업로드 방식에 맞춰 붙여야 합니다(`save()`의 TODO).
- 앱 카메라·갤러리: 지금은 `<input type="file">`(사진촬영 칸은 `capture`)를 씁니다. 네이티브 `M.media`를 써야 하면 `pickFile()`에서 바꿉니다.
