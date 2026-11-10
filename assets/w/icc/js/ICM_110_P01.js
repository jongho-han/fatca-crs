/**
 * ICM_110_P01 : FATCA·CRS 본인확인서 (인터넷창구 레이어팝업)
 *
 * 열기   : fatcaCrs.open({bizCd:"08", bizNm:"보험계약대출"}).then(function (ret) { ... })
 *          ret = "SUCCESS"(제출·인증 완료) | "CANCEL"(작성 중단) | "FAIL"(조회 실패)
 *          본인인증 모듈은 opts.auth 로 넘긴다 — Promise(Deferred)를 돌려주는 함수 (없으면 인증 없이 완료)
 * 의존   : jQuery(1.11), window.alert / confirm
 *
 * 1단계 본인확인서 작성 → 2단계 증빙서류 첨부(CASE 문서 11-05) → 저장 → 3단계 본인인증 → 닫기
 */
var fatcaCrs = (function ($) {
	"use strict";

	/* ===== 설정 ===== */
	var URL_INIT = "/icc/ICM_110_P01S01.do";	// TODO 실제 URL — 고객정보·국가코드 조회 (응답: domesticYn, codeListNa, custInfo)
	var URL_SAVE = "/icc/ICM_110_P01S02.do";	// TODO 실제 URL — 본인확인서·증빙서류 저장 (multipart)
	var MAX_MB = 10;
	var TOP_NAT = ["KR", "US", "CN", "JP"];
	var DOC_NM = {1: "납세자번호 증명서", 2: "세법상 거주지 증빙"};

	/* ===== 상태 ===== */
	var W = ".fatcaCrs";
	var ctx = {};
	var natList = [];
	var domestic = true;
	var step = 1;
	var res2On = false;
	var atc = {1: null, 2: null};
	var curDoc = null;
	var dfd = null;
	var bound = false;

	/* ===== 유틸 ===== */
	function natNm(cd) {
		for (var i = 0; i < natList.length; i++) { if (natList[i].DETAILCODE === cd) { return natList[i].COMMENT_; } }
		return "";
	}
	function fmtSize(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + "MB" : Math.max(1, Math.round(b / 1024)) + "KB"; }
	function josa(w, a, b) {
		var c = w.charCodeAt(w.length - 1);
		return w + ((c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 > 0) ? a : b);
	}
	function fail(msg, $el) {
		alert(msg);
		if ($el && $el.length) {
			var $c = $(W + " .layPopCont");
			$c.scrollTop($c.scrollTop() + $el.offset().top - $c.offset().top - 60);
			$el.focus();
		}
		return false;
	}

	/* ===== 1단계: 입력값 ===== */
	function readRes(no) {
		var $t = $("#fatcaRes" + no);
		return {
			no: no, $t: $t,
			nat: $t.find(".fatca-res-nat").val() || "",
			addr: $.trim($t.find(".fatca-res-addr").val()),
			tin: $.trim($t.find(".fatca-res-tin").val()),
			rsn: $t.find("input[name='fatcaRsn" + no + "']:checked").val() || "",
			etc: $.trim($t.find(".fatca-res-etc").val())
		};
	}
	function readForm() {
		var f = {
			us: $("input[name='fatcaUs']:checked").val() || "",
			usType: $("input[name='fatcaUsType']:checked").map(function () { return this.value; }).get(),
			res: $("input[name='fatcaRes']:checked").val() || "",
			nat: domestic ? "KR" : ($("#fatcaNat").val() || ""),
			lastNm: $.trim($("#fatcaLastNm").val()),
			firstNm: $.trim($("#fatcaFirstNm").val()),
			resList: [readRes(1)]
		};
		if (res2On) { f.resList.push(readRes(2)); }
		return f;
	}
	function needTax(f) { return !domestic || f.nat !== "KR" || f.us === "1" || f.res === "1"; }

	// 증빙서류 규칙 (CASE 문서 11-05) — 모바일 MA-0087P 와 같음
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
		if (!domestic && !f.nat) { return fail("국적을 선택해 주십시오.", $("#fatcaNat")); }
		if (!f.us) { return fail("① 미국 세법상 미국인 해당 여부를 선택해 주십시오.", $("#fatcaUsY")); }
		if (f.us === "1" && !f.usType.length) { return fail("미국인에 해당되는 사항을 체크해 주십시오.", $("#fatcaUsType0")); }
		if (!f.res) { return fail("② 대한민국 외의 조세목적상 해외 거주자 여부를 선택해 주십시오.", $("#fatcaResY")); }
		if (!needTax(f)) { return true; }

		if (!f.lastNm) { return fail("영문 성(LAST NAME)을 입력해 주십시오.", $("#fatcaLastNm")); }
		if (!f.firstNm) { return fail("영문 이름(FIRST NAME)을 입력해 주십시오.", $("#fatcaFirstNm")); }

		var seen = {}, hasUs = false;
		for (var i = 0; i < f.resList.length; i++) {
			var r = f.resList[i], t = "거주지국 " + r.no + "의 ";
			if (!r.nat) { return fail(t + "국가를 선택해 주십시오.", r.$t.find(".fatca-res-nat")); }
			if (seen[r.nat]) { return fail(t + "국가가 다른 거주지국과 같습니다. 다른 국가를 선택해 주십시오.", r.$t.find(".fatca-res-nat")); }
			seen[r.nat] = true;
			if (r.nat === "US") { hasUs = true; }
			if (!r.addr) { return fail(t + "영문주소를 입력해 주십시오.", r.$t.find(".fatca-res-addr")); }
			if (!/\d/.test(r.addr)) { return fail(t + "영문주소에 우편번호를 포함해 주십시오.", r.$t.find(".fatca-res-addr")); }
			if (r.tin) {
				if (r.nat === "US" && !/^\d{9}$/.test(r.tin.replace(/-/g, ""))) {
					return fail(t + "납세자번호(SSN 또는 ITIN)는 숫자 9자리로 입력해 주십시오.", r.$t.find(".fatca-res-tin"));
				}
			} else {
				if (!r.rsn) { return fail(t + "납세자번호를 입력하거나, 없으면 미기재 사유를 선택해 주십시오.", r.$t.find(".fatca-res-tin")); }
				if (r.rsn === "3" && !r.etc) { return fail(t + "기타 사유를 입력해 주십시오.", r.$t.find(".fatca-res-etc")); }
			}
		}
		if (f.us === "1" && !hasUs) { return fail("미국인에 해당하는 경우 거주지국에 미국을 입력해 주십시오.", $("#fatcaRes1 .fatca-res-nat")); }
		return true;
	}

	/* ===== 1단계: 화면 갱신 ===== */
	function refreshTax() {
		var f = readForm(), tax = needTax(f);
		$("#fatcaUsTypeBox").toggle(f.us === "1");
		$("#fatcaEngNameRow").toggle(tax);
		$("#fatcaTaxBox").toggle(tax);
		$("#fatcaNoTaxGuide").toggle(!tax);
	}
	function refreshRsn($t) {
		var hasTin = !!$.trim($t.find(".fatca-res-tin").val());
		$t.find(".fatca-res-rsn-row").toggle(!hasTin);
		if (hasTin) { $t.find(".fatca-res-rsn input:radio").prop("checked", false); }
		var etcOn = !hasTin && $t.find(".fatca-res-rsn input:radio:checked").val() === "3";
		$t.find(".fatca-res-etc").prop("disabled", !etcOn);
		if (!etcOn) { $t.find(".fatca-res-etc").val(""); }
	}
	function clearRes($t) {
		$t.find(".fatca-res-nat").val("");
		$t.find(".fatca-res-addr, .fatca-res-tin, .fatca-res-etc").val("");
		$t.find("input:radio").prop("checked", false);
		refreshRsn($t);
	}
	function setRes2(on) {
		res2On = on;
		$("#fatcaRes2").toggle(on);
		$("#fatcaBtnResAdd").toggle(!on);
		$("#fatcaBtnResDel").toggle(on);
		if (!on) { clearRes($("#fatcaRes2")); }
	}
	function natOptions(excludeKr) {
		var top = [], rest = [], h = '<option value="">국가 선택</option>';
		$.each(natList, function (i, n) {
			if (excludeKr && n.DETAILCODE === "KR") { return; }
			if ($.inArray(n.DETAILCODE, TOP_NAT) > -1) { top.push(n); } else { rest.push(n); }
		});
		top.sort(function (a, b) { return $.inArray(a.DETAILCODE, TOP_NAT) - $.inArray(b.DETAILCODE, TOP_NAT); });
		rest.sort(function (a, b) { return a.COMMENT_ < b.COMMENT_ ? -1 : a.COMMENT_ > b.COMMENT_ ? 1 : 0; });
		$.each(top.concat(rest), function (i, n) { h += '<option value="' + n.DETAILCODE + '">' + n.COMMENT_ + ' (' + n.CLASSNM + ')</option>'; });
		return h;
	}

	/* ===== 2단계: 증빙서류 ===== */
	function renderAtc() {
		var rule = docRule(readForm()), mustCnt = 0, doneCnt = 0, miss = [];
		$(W + " .fatca-atc").each(function () {
			var $r = $(this), no = $r.attr("data-doc"), r = rule[no], file = atc[no];
			$r.toggle(r.show);
			if (!r.show) { return; }
			if (r.must) { mustCnt++; if (file) { doneCnt++; } else { miss.push(DOC_NM[no]); } }

			var desc;
			if (no === "1") {
				desc = r.usEmpty ? "미국 납세자번호(SSN·ITIN)를 기재하지 않은 경우에도 확인 서류를 첨부해 주십시오."
					: "입력하신 납세자번호가 확인되는 서류 (SSN 카드, 납세자번호 통지서 등)";
			} else {
				desc = r.must ? "서류 종류를 선택한 후 첨부해 주십시오." : "첨부를 원칙으로 하며, 서류가 없는 경우 첨부하지 않고 진행할 수 있습니다.";
			}
			$r.find(".fatca-atc-desc").text(desc);
			$r.find(".fatca-atc-must").toggle(r.must);
			$r.find(".fatca-atc-name").text(file ? file.name + " (" + fmtSize(file.size) + ")" : "선택된 파일 없음");
			$r.find(".fatca-atc-find").toggle(!file);
			$r.find(".fatca-atc-del").toggle(!!file);
			$r.find(".fatca-atc-state").text(file ? "등록완료" : (r.must ? "미등록" : "선택"));
		});
		$("#fatcaAtcCnt").text(mustCnt ? "필수 " + mustCnt + "건 중 " + doneCnt + "건 등록" : "필수 서류 없음");
		$("#fatcaAtcMsg").text(miss.length ? miss.join(", ") + " 첨부가 필요합니다." : "");
	}
	function validStep2() {
		var rule = docRule(readForm());
		for (var no = 1; no <= 2; no++) {
			var $r = $(W + " .fatca-atc[data-doc=" + no + "]");
			if (!rule[no].show) { continue; }
			if (no === 2 && (rule[no].must || atc[no]) && !$r.find(".fatca-atc-kind").val()) {
				return fail("세법상 거주지 증빙의 서류 종류를 선택해 주십시오.", $r.find(".fatca-atc-kind"));
			}
			if (rule[no].must && !atc[no]) { return fail(josa(DOC_NM[no], "을", "를") + " 첨부해 주십시오.", $r.find(".fatca-atc-find")); }
		}
		return true;
	}
	function onFile() {
		var file = this.files && this.files[0];
		var no = curDoc;
		curDoc = null;
		if (!file || !no) { return; }
		if (!/\.(jpe?g|png)$/i.test(file.name) && !/^image\/(jpeg|png)$/.test(file.type)) { alert("JPG, JPEG, PNG 파일만 첨부할 수 있습니다."); return; }
		if (file.size > MAX_MB * 1048576) { alert("서류당 최대 " + MAX_MB + "MB까지 첨부할 수 있습니다."); return; }
		atc[no] = file;
		renderAtc();
	}

	/* ===== 단계 / 저장 / 인증 ===== */
	function showStep(n) {
		step = n;
		$("#fatcaStep1, #fatcaStep2, #fatcaStep3").removeClass("current");
		$("#fatcaStep" + n).addClass("current");
		$("#fatcaStep1Box").toggle(n === 1);
		$("#fatcaStep2Box").toggle(n >= 2);
		$("#fatcaBtnCancel").toggle(n === 1);
		$("#fatcaBtnPrev").toggle(n === 2);
		$(W + " .layPopCont").scrollTop(0);
		if (n === 2) {
			if (!docRule(readForm())[1].show) { atc[1] = null; }
			renderAtc();
		}
	}
	function buildParam() {
		var f = readForm(), tax = needTax(f), rule = docRule(f);
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
			atcResKind: atc[2] ? $(W + " .fatca-atc-kind").val() : "",
			atcResYn: atc[2] ? "Y" : "N"
		};
	}
	function save() {
		var param = buildParam(), fd = null;
		if (window.FormData) {	// 본문 JSON + 서류당 1장 (서버 필드명은 정의서에 맞춰 조정)
			fd = new FormData();
			fd.append("param", JSON.stringify(param));
			if (param.atcTinYn === "Y") { fd.append("atcTin", atc[1]); }
			if (param.atcResYn === "Y") { fd.append("atcRes", atc[2]); }
		}
		$.ajax({
			url: URL_SAVE, type: "POST", dataType: "json",
			data: fd || {param: JSON.stringify(param)},
			processData: !fd, contentType: fd ? false : "application/x-www-form-urlencoded; charset=UTF-8",
			success: function (resp) {
				if (resp && resp.result === "success") { showStep(3); auth(); }
				else { alert((resp && resp.message) || "저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주십시오."); }
			},
			error: function () { alert("저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주십시오."); }
		});
	}
	function auth() {
		var p = typeof ctx.auth === "function" ? ctx.auth() : $.Deferred().resolve().promise();
		$.when(p).then(function () { close("SUCCESS"); }, function () {
			alert("본인인증이 완료되지 않았습니다. 다시 시도해 주십시오.");
			showStep(2);
		});
	}
	function close(ret) {
		$(W).hide();
		if (dfd) { var d = dfd; dfd = null; d.resolve(ret); }
	}
	function askCancel() {
		if (confirm("FATCA·CRS 본인확인서 작성을 취소하시겠습니까?\n작성하지 않으면 " + (ctx.bizNm || "신청") + " 업무를 진행할 수 없습니다.")) { close("CANCEL"); }
	}

	/* ===== 이벤트 ===== */
	function bind() {
		if (bound) { return; }
		bound = true;
		var $w = $(W);

		$w.on("change", "input[name='fatcaUs']", function () {
			if (this.value === "0") { $("input[name='fatcaUsType']").prop("checked", false); }
			refreshTax();
		});
		$w.on("change", "input[name='fatcaRes'], #fatcaNat", refreshTax);

		$w.on("input keyup", ".fatca-eng", function () {	// 영문성명: 영문·숫자만(대문자) / 주소·기타 사유: 한글 등 제거
			var strict = this.id === "fatcaLastNm" || this.id === "fatcaFirstNm";
			var v = strict ? this.value.toUpperCase().replace(/[^A-Z0-9 ]/g, "") : this.value.replace(/[^\x20-\x7E]/g, "");
			if (v !== this.value) { this.value = v; }
		});
		$w.on("input keyup", ".fatca-res-tin", function () {
			var v = this.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 30);
			if (v !== this.value) { this.value = v; }
			refreshRsn($(this).closest(".fatca-res"));
		});
		$w.on("change", ".fatca-res-rsn input:radio", function () { refreshRsn($(this).closest(".fatca-res")); });

		$w.on("click", "#fatcaBtnResAdd", function () { setRes2(true); $("#fatcaRes2 .fatca-res-nat").focus(); });
		$w.on("click", "#fatcaBtnResDel", function () { setRes2(false); $("#fatcaBtnResAdd").focus(); });

		$w.on("click", ".fatca-atc-find", function () {
			curDoc = $(this).closest(".fatca-atc").attr("data-doc");
			var el = $("#fatcaAtcFile")[0];
			try { el.value = ""; } catch (e) { /* IE */ }
			el.click();
		});
		$("#fatcaAtcFile").on("change", onFile);
		$w.on("click", ".fatca-atc-del", function () { atc[$(this).closest(".fatca-atc").attr("data-doc")] = null; renderAtc(); });

		$w.on("click", "#fatcaBtnPrev", function () { showStep(1); });
		$w.on("click", "#fatcaBtnNext", function () {
			if (step === 1) { if (validStep1()) { showStep(2); } }
			else if (step === 2 && validStep2()) { save(); }
		});
		$w.on("click", "#fatcaBtnCancel, #fatcaBtnClose", askCancel);
		$w.on("keydown", function (e) { if (e.keyCode === 27) { askCancel(); } });
	}

	/* ===== 초기화 ===== */
	function reset() {
		$(W + " input:radio, " + W + " input:checkbox").prop("checked", false);
		$("#fatcaUsN, #fatcaResN").prop("checked", true);	// 기본값: ①·② 아니오
		$(W + " input:text").val("");
		clearRes($("#fatcaRes1"));
		setRes2(false);
		atc = {1: null, 2: null};
		$(W + " .fatca-atc-kind").val("");
	}

	function open(opts) {
		ctx = opts || {};
		dfd = $.Deferred();
		bind();
		reset();
		showStep(1);
		$(W).show().focus();
		$.ajax({
			url: URL_INIT, type: "POST", dataType: "json", data: {bizCd: ctx.bizCd},
			success: function (resp) {
				if (!resp || resp.result !== "success") { alert("고객 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주십시오."); close("FAIL"); return; }
				var c = resp.custInfo || {};
				natList = resp.codeListNa || [];
				domestic = resp.domesticYn !== "N";
				$("#fatcaCustNm").text(c.name || "");
				$("#fatcaCustBirth").text(c.birth || "");
				$("#fatcaCustAddr").text(c.addr || "");
				$("#fatcaCustHp").text(c.hpNo || "");
				$("#fatcaNatTxt").text(domestic ? "대한민국" : "").toggle(domestic);
				$("#fatcaNat").html(natOptions(false)).toggle(!domestic);
				$(W + " .fatca-res-nat").html(natOptions(true));
				refreshTax();
			},
			error: function () { alert("고객 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주십시오."); close("FAIL"); }
		});
		return dfd.promise();
	}

	return {open: open};
})(jQuery);
