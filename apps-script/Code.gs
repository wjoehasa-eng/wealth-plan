/**
 * 입주 자금관리 — 구글 시트 백엔드 (Google Apps Script) v4.4.0
 * ==========================================================
 * 쓰는 법 (한 번만, 약 5분)
 *  1. 구글 드라이브에서 새 스프레드시트를 만듭니다.
 *     (예: 「내 자금관리 데이터」)
 *  2. 그 시트에서 확장 프로그램 → Apps Script 를 엽니다.
 *  3. 기본 Code.gs 내용을 모두 지우고 이 파일 내용을 그대로 붙여 넣고 저장합니다.
 *  4. 배포 → 새 배포 → 유형(⚙) = 웹 앱
 *       · 설명: 입주 자금관리 백엔드
 *       · 다음 사용자로 실행: 나
 *       · 액세스 권한: 모든 사용자   ← 폰 앱에서 접속하려면 반드시 이 값
 *     → 배포 → 권한 검토/허용(내 계정) → 웹 앱 URL(.../exec) 복사
 *  5. 복사한 URL을 앱 ⚙ 설정 → '구글 시트 연결'에 붙여 넣고
 *     '시트에서 불러오기' 로 확인합니다.
 *
 * 코드를 고친 뒤에는 반드시 배포 → 배포 관리 → 수정(연필) → 버전: 새 버전 → 배포.
 *
 * 시트 구성 (없으면 자동으로 만듭니다)
 *  · 설정          : 항목 | 값 | 비고            (앱의 기본 값 11개 + 앱연결시각)
 *  · 대출상환      : 날짜 | 상환원금 | 납입이자 | 합계 | 거래후잔액 | 금리(%) | 메모
 *  · 납입일정      : 구분 | 예정일 | 금액 | 상태 | 메모
 *  · 월별투입      : 월 | 투입금액 | 구분 | 메모
 *  · 주식포트폴리오: 종목명 | 수량 | 매수단가 | 현재가 | 평가금액 | 수익금 | 비고
 *  · 개인대출      : 대출명 | 잔액 | 금리(%) | 비고 | 입주포함   (v4 — 주택 대출과 별도로 보는 개인대출)
 *                    v4.4: 5번째 칸 '입주포함' = Y/N. Y면 앱이 그 잔액을 입주 확보 재원으로 계산합니다.
 *                    4칸짜리 예전 시트는 처음 저장할 때 '입주포함' 열이 자동으로 생깁니다(기존 값은 N).
 *
 * v4 추가: 취득세등기비 · 중도금후불이자 · 추가대출(시뮬) 설정과 '개인대출' 탭.
 * v4.4 추가: 개인대출 '입주포함' 열(Y/N) — 응답에 personalForHouse 를 넣어 앱이 지원 여부를 압니다.
 *  · 구버전 앱(v3 이하)이 저장하면 개인대출 탭은 그대로 남고, 새 설정 값은 빈 칸이 됩니다.
 *  · 구버전 Code.gs를 그대로 쓰는 앱(v4)도 오류 없이 동작합니다(앱이 기기 저장값으로 대신함).
 *
 * 개인정보: 이 스크립트는 사용자 본인의 스프레드시트에만 읽고 쓰며, 다른 곳으로 보내지 않습니다.
 */

/** 스프레드시트 ID. 시트에 붙인(컨테이너 바인딩) 스크립트라면 비워 두세요. */
var SHEET_ID = '';

var BACKEND_VERSION = '4.4.0';

var TABS = {
  settings: '설정',
  loans: '대출상환',
  schedule: '납입일정',
  monthly: '월별투입',
  stocks: '주식포트폴리오',
  personal: '개인대출'
};

var HEADERS = {
  settings: ['항목', '값', '비고'],
  loans: ['날짜', '상환원금', '납입이자', '합계', '거래후잔액', '금리(%)', '메모'],
  schedule: ['구분', '예정일', '금액', '상태', '메모'],
  monthly: ['월', '투입금액', '구분', '메모'],
  stocks: ['종목명', '수량', '매수단가', '현재가', '평가금액', '수익금', '비고'],
  personal: ['대출명', '잔액', '금리(%)', '비고', '입주포함']
};

/** 설정 시트의 한글 항목 ↔ 앱 키 */
var SETTING_KEYS = [
  ['goalAmount', '목표금액', '입주 목표 총액'],
  ['moveInDate', '입주목표일', 'D-Day 기준일'],
  ['expectedDeposit', '회수예정전세금', '전세 보증금 회수 예정액'],
  ['loanBalance', '현재대출잔액', '가장 최근 상환 후 잔액'],
  ['stockTargetProfit', '목표주식수익', '주식 운용 목표 수익'],
  ['stockValue', '현재주식평가금', '주식포트폴리오 합계에서 자동 계산'],
  ['monthlyInvest', '예상월평균투입', '부부 월평균 저축·투입액'],
  ['monthlyInvestSim', '월투입(시뮬)', '시뮬레이터에서 조절한 값'],
  ['newLoanAtMoveIn', '신규주담대(예상)', '입주 시점 신규·승계 주담대'],
  ['acquisitionTax', '취득세등기비', 'v4: 입주 부대비용(총 목표에 합산)'],
  ['deferredInterest', '중도금후불이자', 'v4: 입주 시 내는 중도금 이자(총 목표에 합산)'],
  ['stockProfitSim', '주식수익(시뮬)', '시뮬레이터에서 조절한 값'],
  ['additionalLoanSim', '추가대출(시뮬)', 'v4: 입주 자금에 보태는 개인 추가 대출'],
  ['repayExistingLoan', '기존대출상환반영', 'v3부터 계산에 쓰지 않음(Y/N 기록만 남김)'],
  ['appConnectedAt', '앱연결시각', '앱이 마지막으로 저장한 시각']
];

/* ------------------------------------------------------------------ 라우팅 */

function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = p.action || 'status';
  var callback = p.callback || '';
  try {
    if (action === 'load') return out_(loadAll_(), callback);
    if (action === 'ping') return out_({ ok: true, app: 'wealthplan', now: new Date().toISOString() }, callback);
    return out_(status_(), callback);
  } catch (err) {
    return out_({ ok: false, error: errText_(err) }, callback);
  }
}

function doPost(e) {
  var req = {};
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return out_({ ok: false, error: '요청 본문(JSON)을 읽지 못했습니다.' });
  }
  try {
    var action = req.action || 'ping';
    if (action === 'save') return out_(saveAll_(req));
    if (action === 'load') return out_(loadAll_());
    return out_(status_());
  } catch (err) {
    return out_({ ok: false, error: errText_(err) });
  }
}

/** callback이 있으면 JSONP(스크립트)로, 없으면 JSON으로 응답합니다. */
function out_(obj, callback) {
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + JSON.stringify(obj) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function errText_(err) {
  return String((err && err.message) || err || '알 수 없는 오류');
}

function ss_() {
  return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActive();
}

function tab_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sh;
}

function status_() {
  var ss = ss_();
  var info = {};
  Object.keys(TABS).forEach(function (k) {
    var sh = ss.getSheetByName(TABS[k]);
    info[k] = sh ? Math.max(0, sh.getLastRow() - 1) : -1;
  });
  return {
    ok: true,
    app: 'wealthplan',
    backendVersion: BACKEND_VERSION,
    title: ss.getName(),
    tab: ss.getUrl(),
    rows: info,
    now: new Date().toISOString()
  };
}

/* ------------------------------------------------------------------ 읽기 */

function loadAll_() {
  var ss = ss_();
  var settings = readSettings_(ss);
  return {
    ok: true,
    app: 'wealthplan',
    backendVersion: BACKEND_VERSION,
    title: ss.getName(),
    savedAt: settings.appConnectedAt ? String(settings.appConnectedAt) : null,
    settings: settings,
    loans: readLoans_(ss),
    schedule: readSchedule_(ss),
    monthly: readMonthly_(ss),
    stocks: readStocks_(ss),
    extraLoans: readPersonal_(ss),
    personalTab: !!ss.getSheetByName(TABS.personal),
    /* v4.4: 개인대출 탭에 '입주포함' 열이 있으면 true — 없으면 앱이 이 기기의 체크 값을 지킵니다 */
    personalForHouse: hasPersonalForHouseColumn_(ss)
  };
}

function readTable_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) return [];
  var last = sh.getLastRow();
  if (last < 2) return [];
  /* 예전 시트(칼럼 수가 모자란 경우)에도 오류 없이: 있는 열까지만 읽는다 */
  var width = Math.min(headers.length, Math.max(1, sh.getMaxColumns()));
  var values = sh.getRange(2, 1, last - 1, width).getValues();
  return values.filter(function (row) {
    return row.some(function (c) { return c !== '' && c !== null; });
  });
}

function readSettings_(ss) {
  var rows = readTable_(ss, TABS.settings, HEADERS.settings);
  var byLabel = {};
  rows.forEach(function (r) {
    var label = String(r[0] || '').trim();
    if (label) byLabel[label] = r[1];
  });
  var out = {};
  SETTING_KEYS.forEach(function (k) {
    var label = k[1], raw = byLabel[label];
    if (raw === undefined) return;
    if (label === '입주목표일') { out[k[0]] = dateText_(raw); return; }
    if (label === '기존대출상환반영') { out[k[0]] = String(raw).toUpperCase() === 'Y' || raw === true; return; }
    if (label === '주식수익(시뮬)' || label === '월투입(시뮬)') {
      out[k[0]] = (raw === '' || raw === null || raw === undefined) ? null : number_(raw);
      return;
    }
    if (label === '앱연결시각') { out[k[0]] = raw ? String(raw) : ''; return; }
    out[k[0]] = number_(raw);
  });
  return out;
}

function readLoans_(ss) {
  return readTable_(ss, TABS.loans, HEADERS.loans).map(function (r) {
    return {
      date: dateText_(r[0]),
      principal: number_(r[1]),
      interest: number_(r[2]),
      balance: r[4] === '' || r[4] === null ? null : number_(r[4]),
      rate: r[5] === '' || r[5] === null ? null : number_(r[5]),
      memo: String(r[6] || '')
    };
  });
}

function readSchedule_(ss) {
  return readTable_(ss, TABS.schedule, HEADERS.schedule).map(function (r) {
    return {
      label: String(r[0] || ''),
      dueDate: dateText_(r[1]),
      amount: number_(r[2]),
      status: String(r[3] || '미정'),
      memo: String(r[4] || '')
    };
  });
}

function readMonthly_(ss) {
  return readTable_(ss, TABS.monthly, HEADERS.monthly).map(function (r) {
    return {
      month: monthText_(r[0]),
      amount: number_(r[1]),
      kind: String(r[2] || ''),
      memo: String(r[3] || '')
    };
  });
}

function readStocks_(ss) {
  return readTable_(ss, TABS.stocks, HEADERS.stocks).map(function (r) {
    return {
      name: String(r[0] || ''),
      qty: number_(r[1]),
      avgPrice: number_(r[2]),
      currentPrice: r[3] === '' || r[3] === null ? null : number_(r[3]),
      memo: String(r[6] || '')
    };
  });
}

/** v4.4: 개인대출 탭 — 대출명 | 잔액 | 금리(%) | 비고 | 입주포함(Y/N)
 *  · 4칸짜리 예전 시트나 값이 빈 칸이면 입주포함 = false 로 읽는다. */
function readPersonal_(ss) {
  return readTable_(ss, TABS.personal, HEADERS.personal).map(function (r) {
    return {
      name: String(r[0] || ''),
      balance: number_(r[1]),
      rate: (r[2] === '' || r[2] === null || r[2] === undefined) ? null : number_(r[2]),
      memo: String(r[3] || ''),
      forHouse: isYes_(r[4])
    };
  });
}

/** 'Y' / true / 'y' / '예' 를 참으로 본다. 빈 칸·'N'은 거짓(기본값). */
function isYes_(v) {
  if (v === true) return true;
  var s = String(v === null || v === undefined ? '' : v).trim().toUpperCase();
  return s === 'Y' || s === 'YES' || s === 'TRUE' || s === '1' || s === '예';
}

/** 개인대출 시트에 '입주포함' 열(5번째)이 준비됐는지 — 없으면 만들지 않고 알리기만 한다. */
function hasPersonalForHouseColumn_(ss) {
  var sh = ss.getSheetByName(TABS.personal);
  if (!sh) return true;              // 탭이 아직 없으면 잃을 체크 값도 없다(안내를 띄우지 않음)
  if (sh.getMaxColumns() < HEADERS.personal.length) return false;
  var h = sh.getRange(1, HEADERS.personal.length, 1, 1).getValue();
  return String(h || '').trim() === HEADERS.personal[HEADERS.personal.length - 1];
}

/* ------------------------------------------------------------------ 쓰기 */

function saveAll_(req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = ss_();
    var savedAt = req.savedAt || new Date().toISOString();
    var counts = {};

    counts.settings = writeSettings_(ss, req.settings || {}, savedAt);
    counts.loans = writeLoans_(ss, req.loans || []);
    counts.schedule = writeSchedule_(ss, req.schedule || []);
    counts.monthly = writeMonthly_(ss, req.monthly || []);
    counts.stocks = writeStocks_(ss, req.stocks || []);
    counts.personal = writePersonal_(ss, req.extraLoans || []);

    SpreadsheetApp.flush();
    return { ok: true, app: 'wealthplan', backendVersion: BACKEND_VERSION, savedAt: savedAt, counts: counts, title: ss.getName() };
  } finally {
    lock.releaseLock();
  }
}

/** 헤더는 남기고 데이터 영역을 지운 뒤 rows 를 씁니다. */
function replaceRows_(ss, name, headers, rows) {
  var sh = tab_(ss, name, headers);
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, headers.length).clearContent();
  if (!rows.length) return 0;
  sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  return rows.length;
}

function writeSettings_(ss, settings, savedAt) {
  var sh = tab_(ss, TABS.settings, HEADERS.settings);
  var last = sh.getLastRow();
  var existing = last > 1 ? sh.getRange(2, 1, last - 1, 3).getValues() : [];
  var map = {};
  var order = [];
  existing.forEach(function (r) {
    var label = String(r[0] || '').trim();
    if (!label) return;
    if (!(label in map)) order.push(label);
    map[label] = { value: r[1], note: String(r[2] || '') };
  });

  SETTING_KEYS.forEach(function (k) {
    var key = k[0], label = k[1];
    var val = settings[key];
    var v;
    if (label === '기존대출상환반영') v = (val === false || val === 'N') ? 'N' : 'Y';
    else if (label === '입주목표일') v = val ? String(val) : '';
    else if (label === '앱연결시각') v = savedAt;
    else v = (val === null || val === undefined || val === '') ? '' : number_(val);
    if (!(label in map)) { order.push(label); map[label] = { value: v, note: k[2] }; }
    else { map[label].value = v; if (!map[label].note) map[label].note = k[2]; }
  });

  var rows = order.map(function (label) {
    var m = map[label];
    return [label, m.value === undefined ? '' : m.value, m.note || ''];
  });
  return replaceRows_(ss, TABS.settings, HEADERS.settings, rows);
}

function writeLoans_(ss, loans) {
  var rows = loans.map(function (l) {
    var principal = number_(l.principal), interest = number_(l.interest);
    var total = (l.total === undefined || l.total === null || l.total === '') ? principal + interest : number_(l.total);
    return [
      l.date ? String(l.date) : '',
      principal,
      interest,
      total,
      (l.balance === null || l.balance === undefined || l.balance === '') ? '' : number_(l.balance),
      (l.rate === null || l.rate === undefined || l.rate === '') ? '' : number_(l.rate),
      l.memo ? String(l.memo) : ''
    ];
  });
  return replaceRows_(ss, TABS.loans, HEADERS.loans, rows);
}

function writeSchedule_(ss, items) {
  var rows = items.map(function (x) {
    return [
      x.label ? String(x.label) : '',
      x.dueDate ? String(x.dueDate) : '',
      (x.amount === null || x.amount === undefined || x.amount === '') ? '' : number_(x.amount),
      x.status ? String(x.status) : '미정',
      x.memo ? String(x.memo) : ''
    ];
  });
  return replaceRows_(ss, TABS.schedule, HEADERS.schedule, rows);
}

function writeMonthly_(ss, items) {
  var rows = items.map(function (x) {
    return [
      x.month ? String(x.month) : '',
      (x.amount === null || x.amount === undefined || x.amount === '') ? '' : number_(x.amount),
      x.kind ? String(x.kind) : '',
      x.memo ? String(x.memo) : ''
    ];
  });
  return replaceRows_(ss, TABS.monthly, HEADERS.monthly, rows);
}

function writeStocks_(ss, items) {
  var rows = items.map(function (x) {
    var qty = number_(x.qty);
    var avg = number_(x.avgPrice);
    var cur = (x.currentPrice === null || x.currentPrice === undefined || x.currentPrice === '') ? avg : number_(x.currentPrice);
    var value = qty * cur;
    return [x.name ? String(x.name) : '', qty, avg, cur, value, value - qty * avg, x.memo ? String(x.memo) : ''];
  });
  return replaceRows_(ss, TABS.stocks, HEADERS.stocks, rows);
}

/** v4.4: 개인대출 쓰기 — 대출명 | 잔액 | 금리(%) | 비고 | 입주포함(Y/N)
 *  · 예전 4칸 시트는 '입주포함' 열을 새로 만든 뒤 쓴다(기존 행은 빈 칸 = N). */
function writePersonal_(ss, items) {
  var sh = tab_(ss, TABS.personal, HEADERS.personal);
  if (sh.getMaxColumns() < HEADERS.personal.length) {
    sh.insertColumnsAfter(sh.getMaxColumns(), HEADERS.personal.length - sh.getMaxColumns());
  }
  var forHouseCol = HEADERS.personal.length;
  if (String(sh.getRange(1, forHouseCol).getValue() || '').trim() === '') {
    sh.getRange(1, forHouseCol).setValue(HEADERS.personal[forHouseCol - 1]).setFontWeight('bold');
  }
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, HEADERS.personal.length).clearContent();
  if (!items.length) return 0;
  var rows = items.map(function (x) {
    return [
      x.name ? String(x.name) : '',
      number_(x.balance),
      (x.rate === null || x.rate === undefined || x.rate === '') ? '' : number_(x.rate),
      x.memo ? String(x.memo) : '',
      isYes_(x.forHouse) ? 'Y' : 'N'
    ];
  });
  sh.getRange(2, 1, rows.length, HEADERS.personal.length).setValues(rows);
  return rows.length;
}

/* ------------------------------------------------------------------ 값 정리 */

function number_(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  var n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : 0;
}

/** 셀 값을 'YYYY-MM-DD' 문자열로 만듭니다(날짜 서식이어도 동일). */
function dateText_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  var m = s.match(/^(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})/);
  if (m) return m[1] + '-' + pad2_(m[2]) + '-' + pad2_(m[3]);
  return s;
}

/** 셀 값을 'YYYY-MM' 문자열로 만듭니다. */
function monthText_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM');
  }
  var s = String(v).trim();
  var m = s.match(/^(\d{4})[-.\/](\d{1,2})/);
  if (m) return m[1] + '-' + pad2_(m[2]);
  return s;
}

function pad2_(v) {
  return ('0' + String(v)).slice(-2);
}
