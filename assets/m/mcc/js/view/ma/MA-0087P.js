/**
 * MA-0087P : FATCA·CRS 본인확인서 (모바일 전체 팝업)
 *
 * 열기   : MA0087P.onInit({bizCd:"08", bizNm:"보험계약대출"})
 * 닫기   : dialog.closePopup({result:"SUCCESS"})  — 제출 완료(다음 단계 진행)
 *          dialog.closePopup({result:"CANCEL"})   — 작성 중단
 * 의존   : jQuery, Dcore.http.ajax, dialog.alert / confirm / select / closePopup
 *
 * 1단계 본인확인서 작성 → 2단계 증빙서류 첨부(CASE 문서 11-05) → 저장 후 팝업 닫기
 */
var MA0087P = (function ($) {
	"use strict";

	/* ===== 설정 ===== */
	var URL_INIT = "/mcc/ma/MA0087PS01";	// TODO 실제 URL — 고객정보·국가코드 조회 (응답: domesticYn, codeListNa, custInfo)
	var URL_SAVE = "/mcc/ma/MA0087PS02";	// TODO 실제 URL — 본인확인서 저장
	var MAX_MB = 10;
	var TOP_NAT = ["KR", "US", "CN", "JP"];		// 국가 선택 팝업 상단 고정
	var RSN_TXT = ["미발급 국가", "미요구 국가", "미취득", "기타"];
	var US_TXT = ["미국시민권자", "미국영주권자", "미국거주자"];
	var KIND = [								// 세법상 거주지 증빙 서류 종류 (인터넷창구 ICM_110_P01 과 같은 코드)
		{value:"1", text:"주민등록증(재외국민용 제외)"},
		{value:"2", text:"운전면허증 / 영주증"},
		{value:"3", text:"외국인등록증"},
		{value:"4", text:"거주자증명서"},
		{value:"5", text:"국내거소신고증 + 출입국관리기록"}
	];
	var DOC_NM = {1:"납세자번호 증명서", 2:"세법상 거주지 증빙"};

	/* ===== 상태 ===== */
	var P = "#MA0087P";
	var ctx = {};			// onInit 인자 (bizCd, bizNm)
	var natList = [];		// codeListNa
	var domestic = true;	// 내국인 여부
	var step = 1;
	var res2On = false;
	var atc = {1:null, 2:null};	// 첨부 파일 (File)
	var curDoc = null;
	var bound = false;

	function $id(nm) { return $(P + "_" + nm); }

	/* ===== 공통 유틸 ===== */
	function natNm(cd) {
		for (var i = 0; i < natList.length; i++) { if (natList[i].DETAILCODE === cd) { return natList[i].COMMENT_; } }
		return "";
	}
	function fmtSize(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + "MB" : Math.max(1, Math.round(b / 1024)) + "KB"; }
	function josa(w, a, b) {	// 받침 유무로 조사 선택
		var c = w.charCodeAt(w.length - 1);
		return w + ((c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 > 0) ? a : b);
	}
	function fail(msg, $el) {
		dialog.alert(msg).then(function () {
			if ($el && $el.length) {
				var $con = $(P + " .full-pop-con");
				$con.scrollTop($con.scrollTop() + $el.offset().top - $con.offset().top - 80);
				$el.focus();
			}
		});
		return false;
	}

	/* ===== 1단계: 입력값 ===== */
	function readRes(no) {
		var $b = $id("res" + no);
		return {
			no: no, $b: $b,
			nat: $b.find(".res-nat").attr("data-val") || "",
			addr: $.trim($b.find(".res-addr").val()),
			tin: $.trim($b.find(".res-tin").val()),
			rsn: $b.find("input[name='MA0087P_rsn" + no + "']:checked").val() || "",
			etc: $.trim($b.find(".res-etc").val())
		};
	}
	function readForm() {
		var f = {
			us: $("input[name='MA0087P_us-have-con']:checked").val() || "",
			usType: $id("usType").find("input:checked").map(function () { return this.value; }).get(),
			res: $("input[name='MA0087P_res']:checked").val() || "",
			nat: domestic ? "KR" : ($id("nat").attr("data-val") || ""),
			lastNm: $.trim($id("lastNm").val()),
			firstNm: $.trim($id("firstNm").val()),
			resList: [readRes(1)]
		};
		if (res2On) { f.resList.push(readRes(2)); }
		return f;
	}
	// 국적이 한국이 아니거나 ①, ② 중 하나라도 '예'이면 영문성명·납세자 정보 필수
	function needTax(f) { return !domestic || f.nat !== "KR" || f.us === "1" || f.res === "1"; }

	// 증빙서류 규칙 (CASE 문서 11-05)
	//  1 납세자번호 증명서 : 번호를 적은 거주지국이 있거나 미국 번호를 비웠을 때만 보임(보이면 필수)
	//  2 세법상 거주지 증빙: ①·② 둘 다 아니오이거나 미국 번호를 비웠을 때 필수, 그 밖은 선택
	function docRule(f) {
		var tax = needTax(f), anyTin = false, usEmpty = false;
		if (tax) {
			$.each(f.resList, function (i, r) {
				if (r.tin) { anyTin = true; }
				if (r.nat === "US" && !r.tin) { usEmpty = true; }
			});
		}
		return {
			1: {show: anyTin || usEmpty, must: anyTin || usEmpty, usEmpty: usEmpty},
			2: {show: true, must: (f.us === "0" && f.res === "0") || usEmpty}
		};
	}

	function validStep1() {
		var f = readForm();
		if (!domestic && !f.nat) { return fail("국적을 선택해 주세요.", $id("nat")); }
		if (!f.us) { return fail("① 미국 세법상 미국인 해당 여부를 선택해 주세요.", $("input[name='MA0087P_us-have-con']").first()); }
		if (f.us === "1" && !f.usType.length) { return fail("미국인에 해당되는 사항을 선택해 주세요.", $id("usType").find("input").first()); }
		if (!f.res) { return fail("② 대한민국 외 국가의 조세목적상 거주자 여부를 선택해 주세요.", $("input[name='MA0087P_res']").first()); }
		if (!needTax(f)) { return true; }

		if (!f.lastNm) { return fail("영문 성(Last Name)을 입력해 주세요.", $id("lastNm")); }
		if (!f.firstNm) { return fail("영문 이름(First Name)을 입력해 주세요.", $id("firstNm")); }

		var seen = {}, hasUs = false;
		for (var i = 0; i < f.resList.length; i++) {
			var r = f.resList[i], t = "거주지국 " + r.no + "의 ";
			if (!r.nat) { return fail(t + "국가를 선택해 주세요.", r.$b.find(".res-nat")); }
			if (r.nat === "KR") { return fail(t + "국가는 대한민국 외 국가로 선택해 주세요.", r.$b.find(".res-nat")); }
			if (seen[r.nat]) { return fail(t + "국가가 다른 거주지국과 같습니다. 다른 국가를 선택해 주세요.", r.$b.find(".res-nat")); }
			seen[r.nat] = true;
			if (r.nat === "US") { hasUs = true; }
			if (!r.addr) { return fail(t + "영문주소를 입력해 주세요.", r.$b.find(".res-addr")); }
			if (!/\d/.test(r.addr)) { return fail(t + "영문주소에 우편번호를 포함해 주세요.", r.$b.find(".res-addr")); }
			if (r.tin) {
				if (r.nat === "US" && !/^\d{9}$/.test(r.tin.replace(/-/g, ""))) {
					return fail(t + "납세자번호(SSN 또는 ITIN)는 숫자 9자리로 입력해 주세요.", r.$b.find(".res-tin"));
				}
			} else {
				if (!r.rsn) { return fail(t + "납세자번호를 입력하거나, 없으면 미기재 사유를 선택해 주세요.", r.$b.find(".res-tin")); }
				if (r.rsn === "3" && !r.etc) { return fail(t + "기타 사유를 입력해 주세요.", r.$b.find(".res-etc")); }
			}
		}
		if (f.us === "1" && !hasUs) { return fail("미국인에 해당하면 거주지국에 미국을 입력해 주세요.", $id("res1").find(".res-nat")); }
		return true;
	}

	/* ===== 1단계: 화면 갱신 ===== */
	function refreshTax() {
		var f = readForm(), tax = needTax(f);
		$id("usCon").toggle(f.us === "1");
		$id("engNameBox").toggle(tax);
		$id("engNameGuide").toggle(tax);
		$id("taxBox").toggle(tax);
		$id("noTaxGuide").toggle(!tax);
	}
	function refreshRsn($b) {	// 납세자번호를 적으면 미기재 사유는 숨기고 비운다
		var hasTin = !!$.trim($b.find(".res-tin").val());
		$b.find(".res-rsn-row").toggle(!hasTin);
		if (hasTin) { $b.find(".res-rsn input:radio").prop("checked", false); }
		var etcOn = !hasTin && $b.find(".res-rsn input:radio:checked").val() === "3";
		$b.find(".res-etc").prop("disabled", !etcOn);
		if (!etcOn) { $b.find(".res-etc").val(""); }
	}
	function clearRes($b) {
		$b.find(".res-nat").attr("data-val", "").text("국가 선택");
		$b.find(".res-addr, .res-tin, .res-etc").val("");
		$b.find("input:radio").prop("checked", false);
		refreshRsn($b);
	}
	function setRes2(on) {
		res2On = on;
		$id("res2").toggle(on);
		$id("btnResAddWrap").toggle(!on);
		if (!on) { clearRes($id("res2")); }
	}

	/* ===== 국가 선택 팝업 (사내 선택 팝업 마크업) ===== */
	function openNat($btn, title) {
		$("#MA0087P_natPop").remove();
		var cur = $btn.attr("data-val") || "";
		var byNm = natList.slice().sort(function (a, b) { return a.COMMENT_ < b.COMMENT_ ? -1 : a.COMMENT_ > b.COMMENT_ ? 1 : 0; });
		var h = '<div class="pop-wrapper" id="MA0087P_natPop" style="display:table"><div class="layer-bg"></div>'
			+ '<div class="layer-pop-wrap sel-menu"><div class="layer-pop"><header><h1>' + title + ' 선택하기</h1></header>'
			+ '<div class="layer-container"><div class="layer-con d-scroll">'
			+ '<div class="nat-fav"><p class="mb5"><strong>자주 선택하는 국가</strong></p>';
		for (var i = 0; i < TOP_NAT.length; i += 2) {
			h += '<div class="radio-wrap radio-button radio-button-2">';
			for (var j = i; j < i + 2 && j < TOP_NAT.length; j++) {
				h += '<label><input type="radio" name="MA0087P_natFav" value="' + TOP_NAT[j] + '"' + (TOP_NAT[j] === cur ? " checked" : "") + '>' + natNm(TOP_NAT[j]) + '</label>';
			}
			h += '</div>';
		}
		h += '</div><p class="mt20 mb5"><strong>그 외 국가 검색</strong></p>'
			+ '<div class="write-wrap"><dl class="write"><dd><input type="search" class="nat-q" title="국가 검색" placeholder="국가명 또는 영문·코드 (예: 베트남, VN)"></dd></dl></div>'
			+ '<p class="txt-spe mt10 nat-empty" style="display:none">검색 결과가 없습니다.</p>'
			+ '<ul class="list-line mar-l-0 label-w100 nat-list">';
		$.each(byNm, function (i, n) {
			h += '<li><label><input type="radio" name="MA0087P_natRadio" value="' + n.DETAILCODE + '"' + (n.DETAILCODE === cur ? " checked" : "") + '>'
				+ n.COMMENT_ + ' (' + n.CLASSNM + ')</label></li>';
		});
		h += '</ul></div></div><footer class="po-new"><div class="button-section"><button type="button" class="nat-ok' + (cur ? "" : " disabled") + '">선택 완료</button></div></footer>'
			+ '<button type="button" class="btn-pop-close">닫기</button></div></div></div>';

		var $p = $(h);
		var sel = cur;
		function choose(cd) {	// 자주 선택하는 국가와 전체 목록을 같은 값으로 맞춘다
			sel = cd;
			$p.find("input[name='MA0087P_natFav'], input[name='MA0087P_natRadio']").each(function () { this.checked = this.value === cd; });
			$p.find(".nat-ok").removeClass("disabled");
		}
		$p.on("change", "input[name='MA0087P_natFav'], input[name='MA0087P_natRadio']", function () { if (this.checked) { choose(this.value); } });
		$p.find(".nat-q").on("input", function () {
			var q = $.trim(this.value).toUpperCase(), n = 0;
			$p.find(".nat-fav").toggle(!q);
			$p.find(".nat-list li").each(function () {
				var cd = $(this).find("input").val(), hit = !q || ($(this).text().toUpperCase().indexOf(q) > -1) || cd === q;
				$(this).toggle(hit);
				if (hit) { n++; }
			});
			$p.find(".nat-empty").toggle(n === 0);
		});
		$p.find(".nat-ok").on("click", function () {
			if (!sel) { dialog.alert("국가를 선택해 주세요."); return; }
			$btn.attr("data-val", sel).text(natNm(sel));
			$p.remove();
			refreshTax();
			$btn.focus();
		});
		$p.find(".btn-pop-close").on("click", function () { $p.remove(); $btn.focus(); });
		($("#__dialog_wrap__").length ? $("#__dialog_wrap__") : $("body")).append($p);
	}

	/* ===== 2단계: 증빙서류 ===== */
	function renderAtc() {
		var rule = docRule(readForm()), mustCnt = 0, doneCnt = 0;
		$(P + " .atc-box").each(function () {
			var $b = $(this), no = $(this).attr("data-doc"), r = rule[no], file = atc[no];
			$b.toggle(r.show);
			if (!r.show) { return; }
			if (r.must) { mustCnt++; if (file) { doneCnt++; } }

			var desc;
			if (no === "1") {
				desc = r.usEmpty ? "미국 납세자번호(SSN·ITIN)를 적지 않은 경우에도 확인 서류가 필요합니다. 발급받은 서류가 있으면 첨부해 주세요."
					: "입력하신 납세자번호가 보이는 서류(SSN 카드, 납세자번호 통지서 등)를 첨부해 주세요.";
			} else {
				desc = r.must ? "세법상 거주지를 확인할 수 있는 서류 종류를 고른 뒤 첨부해 주세요."
					: "첨부를 원칙으로 하며, 서류가 없으면 첨부하지 않고 진행할 수 있습니다.";
			}
			$b.find(".atc-desc").text(desc);
			$b.find(".atc-state").text(file ? "등록완료" : (r.must ? "필수" : "선택"))
				.toggleClass("txt-point-1", !!file).toggleClass("txt-red", !file && r.must);
			$b.find(".atc-buttons").toggle(!file);
			var $l = $b.find(".file-list").empty();
			if (file) {
				$l.append($('<li><span class="file-nm"></span> <span class="file-size"></span> <button type="button" class="sbtn btn-st07 atc-del">삭제</button></li>')
					.find(".file-nm").text(file.name).end()
					.find(".file-size").text("(" + fmtSize(file.size) + ")").end()
					.find(".atc-del").attr("title", DOC_NM[no] + " 삭제").end());
			}
		});
		$id("atcCnt").text(mustCnt ? "필수 " + mustCnt + "건 중 " + doneCnt + "건 등록" : "필수 서류 없음");
	}
	function validStep2() {
		var rule = docRule(readForm());
		for (var no = 1; no <= 2; no++) {
			var $b = $(P + " .atc-box[data-doc=" + no + "]");
			if (!rule[no].show) { continue; }
			if (no === 2) {
				var kind = $b.find(".atc-kind").attr("data-val");
				if ((rule[no].must || atc[no]) && !kind) { return fail("세법상 거주지 증빙의 서류 종류를 선택해 주세요.", $b.find(".atc-kind")); }
			}
			if (rule[no].must && !atc[no]) { return fail(josa(DOC_NM[no], "을", "를") + " 첨부해 주세요.", $b.find(".atc-cam")); }
		}
		return true;
	}
	function onFile() {
		var file = this.files && this.files[0];
		var no = curDoc;
		curDoc = null;
		if (!file || !no) { return; }
		if (!/\.(jpe?g|png)$/i.test(file.name) && !/^image\/(jpeg|png)$/.test(file.type)) {
			dialog.alert("JPG, JPEG, PNG 파일만 첨부할 수 있습니다."); return;
		}
		if (file.size > MAX_MB * 1048576) { dialog.alert("서류당 최대 " + MAX_MB + "MB까지 첨부할 수 있습니다."); return; }
		atc[no] = file;
		renderAtc();
	}
	function pickFile(no, inputId) {
		curDoc = no;
		var el = $id(inputId)[0];
		try { el.value = ""; } catch (e) { /* 일부 브라우저 */ }
		el.click();
	}

	/* ===== 단계 이동 / 저장 ===== */
	function showStep(n) {
		step = n;
		$id("step1").toggle(n === 1);
		$id("step2").toggle(n === 2);
		$id("btnPrev").toggle(n === 2);
		$(P + " .full-pop-con").scrollTop(0);
		if (n === 2) {
			if (!docRule(readForm())[1].show) { atc[1] = null; }
			renderAtc();
		}
	}
	function buildParam() {
		var f = readForm(), tax = needTax(f);
		var kind = $(P + " .atc-box[data-doc=2] .atc-kind").attr("data-val") || "";
		var rule = docRule(f);
		return {
			bizCd: ctx.bizCd || "",
			natCd: f.nat,
			usYn: f.us === "1" ? "Y" : "N",
			usType: f.us === "1" ? f.usType.join(",") : "",
			frgnTaxResYn: f.res === "1" ? "Y" : "N",
			engLastNm: tax ? f.lastNm : "",
			engFirstNm: tax ? f.firstNm : "",
			resList: tax ? $.map(f.resList, function (r) {
				return {resNo: r.no, natCd: r.nat, engAddr: r.addr, tin: r.tin, noTinRsn: r.tin ? "" : r.rsn, noTinEtc: !r.tin && r.rsn === "3" ? r.etc : ""};
			}) : [],
			atcTinYn: rule[1].show && atc[1] ? "Y" : "N",
			atcResKind: atc[2] ? kind : "",
			atcResYn: atc[2] ? "Y" : "N"
		};
	}
	function save() {
		var param = buildParam();
		// TODO 첨부 파일(atc[1], atc[2]) 업로드는 사내 파일 업로드 방식에 맞춰 연결 (서류당 1장)
		Dcore.http.ajax(URL_SAVE, param).then(function (resp) {
			if (resp && resp.result === "success") {
				dialog.closePopup({result: "SUCCESS", usYn: param.usYn, frgnTaxResYn: param.frgnTaxResYn});
			} else {
				dialog.alert((resp && resp.message) || "저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
			}
		});
	}

	/* ===== 이벤트 ===== */
	function bind() {
		if (bound) { return; }
		bound = true;
		var $w = $(P);

		$w.on("change", "input[name='MA0087P_us-have-con']", function () {
			if (this.value === "0") { $id("usType").find("input").prop("checked", false); }
			refreshTax();
		});
		$w.on("change", "input[name='MA0087P_res']", refreshTax);
		$w.on("click", "#MA0087P_nat", function () { openNat($(this), "국적"); });
		$w.on("click", ".res-nat", function () { openNat($(this), "거주지국"); });

		// 영문성명: 영문·숫자만(대문자) / 영문주소·기타 사유: 한글 등 비ASCII 제거
		$w.on("input", ".eng-only", function () {
			var strict = this.id === "MA0087P_lastNm" || this.id === "MA0087P_firstNm";
			var v = strict ? this.value.toUpperCase().replace(/[^A-Z0-9 ]/g, "") : this.value.replace(/[^\x20-\x7E\n]/g, "");
			if (v !== this.value) { this.value = v; }
		});
		$w.on("input", ".res-tin", function () {
			var v = this.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 30);
			if (v !== this.value) { this.value = v; }
			refreshRsn($(this).closest(".res-box"));
		});
		$w.on("change", ".res-rsn input:radio", function () { refreshRsn($(this).closest(".res-box")); });

		$w.on("click", "#MA0087P_btnResAdd", function () { setRes2(true); $id("res2").find(".res-nat").focus(); });
		$w.on("click", "#MA0087P_btnResDel", function () { setRes2(false); $id("btnResAdd").focus(); });

		$w.on("click", ".atc-cam", function () { pickFile($(this).closest(".atc-box").attr("data-doc"), "atcCamInput"); });
		$w.on("click", ".atc-gal", function () { pickFile($(this).closest(".atc-box").attr("data-doc"), "atcFileInput"); });
		$id("atcCamInput").on("change", onFile);
		$id("atcFileInput").on("change", onFile);
		$w.on("click", ".atc-del", function () { atc[$(this).closest(".atc-box").attr("data-doc")] = null; renderAtc(); });
		$w.on("click", ".atc-kind", function () {
			var $btn = $(this), cur = $btn.attr("data-val");
			dialog.select($.map(KIND, function (k) { return {value: k.value, text: k.text, selected: k.value === cur}; }), "서류 종류 ").then(function (it) {
				if (it) { $btn.attr("data-val", it.value).text(it.text); }
			});
		});

		$w.on("click", "#MA0087P_btnPrev", function () { showStep(1); });
		$w.on("click", "#MA0087P_btnNext", function () {
			if (step === 1) { if (validStep1()) { showStep(2); } }
			else if (validStep2()) { save(); }
		});
		$w.on("click", "#MA0087P_btnClose", function () {
			dialog.confirm("FATCA·CRS 본인확인서 작성을 그만두시겠습니까?<br>작성하지 않으면 " + (ctx.bizNm || "신청") + " 업무를 진행할 수 없습니다.", "그만두기", "계속 작성")
				.then(function (r) { if (r === "YES") { dialog.closePopup({result: "CANCEL"}); } });
		});
	}

	/* ===== 초기화 ===== */
	function reset() {
		$(P + " input:radio, " + P + " input:checkbox").prop("checked", false);
		$("input[name='MA0087P_us-have-con'][value='0'], input[name='MA0087P_res'][value='0']").prop("checked", true);	// 기본값: ①·② 아니오
		$(P + " input:text, " + P + " textarea").val("");
		$id("nat").attr("data-val", "").text("국가 선택");
		clearRes($id("res1"));
		setRes2(false);
		atc = {1: null, 2: null};
		$(P + " .atc-kind").attr("data-val", "").text("서류 종류 선택");
	}

	function onInit(opts) {
		ctx = opts || {};
		bind();
		reset();
		showStep(1);
		Dcore.http.ajax(URL_INIT, {bizCd: ctx.bizCd}).then(function (resp) {
			if (!resp || resp.result !== "success") {
				dialog.alert("고객 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.").then(function () { dialog.closePopup({result: "FAIL"}); });
				return;
			}
			var c = resp.custInfo || {};
			natList = resp.codeListNa || [];
			domestic = resp.domesticYn !== "N";
			$id("custNm").text(c.name || "");
			$id("custBirth").text(c.birth || "");
			$id("custAddr").text(c.addr || "");
			$id("custHp").text(c.hpNo || "");
			$id("natTxt").text(domestic ? "대한민국" : "아래에서 선택");
			$id("natBox").toggle(!domestic);
			refreshTax();
		});
	}

	return {onInit: onInit};
})(jQuery);
