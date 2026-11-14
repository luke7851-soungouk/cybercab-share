/* ==========================================================================
   사이버캡 셰어 — 실제 카카오맵 SDK 기반 유휴시간 로보택시 공유 웹앱
   · 지도: 카카오맵 JavaScript SDK (일반지도 / 스카이뷰, 확대·축소·드래그)
   · 경로: 실주행 경로 폴리라인(kakao.maps.Polyline) + 실제 거리 기반 요금
   · 차량: 실제 위·경도 위를 달리는 커스텀 오버레이 5대
   ========================================================================== */

/* ---------------------------------------------------------------- 1. 설정 */

/* 카카오 developers > 내 애플리케이션 > JavaScript 키.
   아래 상수에 넣거나, 주소 뒤에 ?key=... 로 넘기거나, 지도 안내 패널에 붙여넣으면 됩니다. */
const KAKAO_JS_KEY = "87b1fb17b271c6d182a27370e6094706";   /* 카카오 앱: 사이버캡 공유 (ID 1650269) */

const PICKUP = { ko: '정관읍 중앙공원', en: 'Jungang Park, Jeonggwan', lat: 35.322678, lng: 129.180878 };
const R = window.CYBERCAB_ROUTES || { dest: {}, loops: {} };

const DEST_META = {
  gijang:    { ce: '🚉', area: '기장읍',  areaEn: 'Gijang-eup' },
  osiria:    { ce: '🌊', area: '기장읍',  areaEn: 'Gijang-eup' },
  centum:    { ce: '🏬', area: '해운대구', areaEn: 'Haeundae-gu' },
  haeundae:  { ce: '🏖', area: '해운대구', areaEn: 'Haeundae-gu' },
  gwangalli: { ce: '🌉', area: '수영구',  areaEn: 'Suyeong-gu' },
  busan:     { ce: '🚄', area: '동구',    areaEn: 'Dong-gu' },
  gimhae:    { ce: '✈️', area: '강서구',  areaEn: 'Gangseo-gu' }
};
const DEST_EN = {
  gijang: 'Gijang Station', osiria: 'Osiria Coast Walk', centum: 'Centum City',
  haeundae: 'Haeundae Beach', gwangalli: 'Gwangalli Beach', busan: 'Busan Station', gimhae: 'Gimhae Airport'
};

/* 추천 목적지 — 실주행 거리·소요시간(OSRM 실측)은 routes.js 에서 읽습니다. */
const DESTS = Object.keys(DEST_META).map(function (id) {
  var r = R.dest[id] || {};
  var m = DEST_META[id];
  return {
    id: id, ko: r.name || id, en: DEST_EN[id] || id,
    area: m.area, areaEn: m.areaEn, ce: m.ce,
    km: r.km || 0, min: r.min || 0,
    lat: r.lat, lng: r.lng, path: r.path || null
  };
});

const PAYS = [
  { id: 'kakao',   ko: '카카오페이', en: 'Kakao Pay',    bg: '#FFE812', fg: '#191919', ic: 'K', tag: '기본' },
  { id: 'samsung', ko: '삼성카드',   en: 'Samsung Card', num: '•••• 4821', bg: '#1428A0', fg: '#fff', ic: 'S' },
  { id: 'naver',   ko: '네이버페이', en: 'Naver Pay',    bg: '#03C75A', fg: '#fff', ic: 'N' },
  { id: 'toss',    ko: '토스페이',   en: 'Toss Pay',     bg: '#0064FF', fg: '#fff', ic: 'T' }
];

const OPTIONS = [
  { id: 'standard', ko: '사이버캡 스탠다드', en: 'Cybercab Standard', note: '가장 빠른 배차 · 4인승', noteEn: 'Fastest match · seats 4', eta: 2, mult: 1.000, cab: 'c1' },
  { id: 'direct',   ko: '사이버캡 다이렉트', en: 'Cybercab Direct',   note: '무정차 쾌속 · 4인승',   noteEn: 'Non-stop express',        eta: 4, mult: 1.129, cab: 'c2' },
  { id: 'xl',       ko: '사이버캡 XL',     en: 'Cybercab XL',       note: '4인 + 대형 짐',        noteEn: '4 seats + big luggage',   eta: 5, mult: 1.288, cab: 'c3' }
];

/* 실제 정관읍 도로 위를 도는 5대 — loop 경로는 routes.js 의 실주행 좌표 */
const CABS = [
  { id: 'c1', plate: '부산 70바 4821', model: 'Tesla Cybercab', battery: 82, rating: 4.98, mine: true,  eta: 2, loop: 'c1', kmh: 26, at: 0.10 },
  { id: 'c2', plate: '부산 31나 7788', model: 'Tesla Cybercab', battery: 64, rating: 4.92, mine: false, eta: 3, loop: 'c2', kmh: 31, at: 0.55 },
  { id: 'c3', plate: '부산 08다 1122', model: 'Cybercab XL',    battery: 91, rating: 4.88, mine: false, eta: 4, loop: 'c3', kmh: 22, at: 0.28 },
  { id: 'c4', plate: '부산 55라 3390', model: 'Tesla Cybercab', battery: 73, rating: 4.95, mine: false, eta: 4, loop: 'c4', kmh: 34, at: 0.72 },
  { id: 'c5', plate: '부산 21마 6604', model: 'Tesla Cybercab', battery: 58, rating: 4.90, mine: false, eta: 6, loop: 'c5', kmh: 29, at: 0.40 }
];

const COUPON = 3000;
const FEE_RATE = 0.15;
const BASE_FARE = 5200;   /* 부산 기본요금대 */
const PER_KM = 879;       /* km 당 요금 */
const OSRM = 'https://router.project-osrm.org/route/v1/driving/';

const SLOT_LABEL = {
  weekday: { ko: '평일', en: 'Weekday' },
  night:   { ko: '심야', en: 'Night' },
  weekend: { ko: '주말', en: 'Weekend' }
};

const DEFAULT_STATE = {
  mode: 'rider',
  lang: 'KO',
  dest: null,
  custom: null,
  option: 'standard',
  pay: 'kakao',
  coupon: true,
  phase: 'idle',
  sheetMin: false,
  mapBig: false,
  mapType: 'roadmap',
  driving: true,
  autoReturn: true,
  battery: 78,
  minBattery: 20,
  radius: 15,
  slots: [
    { id: 'weekday', start: '09:00', end: '18:00', on: true },
    { id: 'night',   start: '22:00', end: '06:00', on: true },
    { id: 'weekend', start: '10:00', end: '20:00', on: false }
  ],
  trips: [
    { time: '08:12', to: 'gijang',   fare: 19600 },
    { time: '10:36', to: 'osiria',   fare: 24300 },
    { time: '12:20', to: 'centum',   fare: 22700 }
  ],
  metrics: { rides_requested: 0, rides_completed: 0, rider_gross: 0, owner_net: 0 }
};

/* --------------------------------------------------------------- 2. 상태 */

var state = clone(DEFAULT_STATE);
var ride = null;
var timers = [];
var cabPopId = null;
var toastTimer = null;
var cabTimer = null;
var searchTimer = null;
var lastResults = [];

var MAP = {
  sdk: false, map: null, ready: false, key: null,
  cabs: {}, pickupOv: null, destOv: null, halo: null, line: null,
  approach: null, dot: null, type: 'roadmap', sig: '', boundsK: 0
};

/* ------------------------------------------------------------- 3. 도우미 */

function clone(o) { return JSON.parse(JSON.stringify(o)); }
function el(id) { return document.getElementById(id); }
function isKO() { return state.lang === 'KO'; }
function T(ko, en) { return isKO() ? ko : en; }
function num(n) {
  n = Math.round(n);
  var s = String(Math.abs(n)), out = '';
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && ((s.length - i) % 3) === 0) out += ',';
    out += s.charAt(i);
  }
  return (n < 0 ? '-' : '') + out;
}
function won(n) { return num(n) + T('원', ' KRW'); }
function wonShort(n) { return num(n) + '원'; }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function clockAfter(min) {
  var d = new Date(new Date().getTime() + Math.round(min) * 60000);
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}
function nowClock() {
  var d = new Date();
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function destObj(id) {
  var key = id || state.dest;
  if (!key) return null;
  if (key === 'custom') {
    var c = state.custom;
    if (!c || !c.lat) return null;
    return {
      id: 'custom', ko: c.name, en: c.name, area: c.addr || T('검색한 장소', 'searched place'),
      areaEn: c.addr || 'searched place', ce: '📍', km: c.km, min: c.min,
      lat: c.lat, lng: c.lng, path: c.path || null, road: !!c.road
    };
  }
  for (var i = 0; i < DESTS.length; i++) { if (DESTS[i].id === key) return DESTS[i]; }
  return null;
}
function optObj(id) {
  var key = id || state.option;
  for (var i = 0; i < OPTIONS.length; i++) { if (OPTIONS[i].id === key) return OPTIONS[i]; }
  return OPTIONS[0];
}
function payObj(id) {
  var key = id || state.pay;
  for (var i = 0; i < PAYS.length; i++) { if (PAYS[i].id === key) return PAYS[i]; }
  return PAYS[0];
}
function cabObj(id) {
  for (var i = 0; i < CABS.length; i++) { if (CABS[i].id === id) return CABS[i]; }
  return CABS[0];
}
function payLabel(p) {
  if (p.id === 'samsung') return T('삼성카드 ', 'Samsung Card ') + p.num;
  return isKO() ? p.ko : p.en;
}
function clearTimers() {
  for (var i = 0; i < timers.length; i++) { clearInterval(timers[i]); clearTimeout(timers[i]); }
  timers = [];
}
function showToast(msg) {
  var t = el('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.className = 'toast'; }, 2600);
}
function save() {
  try { localStorage.setItem('cybercab-share:v1', JSON.stringify(state)); } catch (e) {}
}
function signal(txt) {
  if (window.pickle && window.pickle.widget && window.pickle.widget.signal) {
    try { window.pickle.widget.signal(txt); } catch (e) {}
  }
}

/* --------------------------------------------------------------- 4. 요금 */

function baseFareOf(d) { return Math.round((BASE_FARE + PER_KM * (d.km || 0)) / 100) * 100; }
function fareOf(o, d) { return Math.round(baseFareOf(d) * o.mult / 100) * 100; }
function payAmount(fare) { return state.coupon ? Math.max(0, fare - COUPON) : fare; }

/* ------------------------------------------------------- 5. SVG 조각들 */

function carBodySvg() {
  return '<svg viewBox="0 0 320 108" xmlns="http://www.w3.org/2000/svg">'
    + '<defs>'
    + '<linearGradient id="bg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3C4E64"/><stop offset=".55" stop-color="#1D2735"/><stop offset="1" stop-color="#0B1119"/></linearGradient>'
    + '<linearGradient id="gl1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#AECBE8" stop-opacity=".55"/><stop offset=".6" stop-color="#4E6A87" stop-opacity=".28"/><stop offset="1" stop-color="#22303F" stop-opacity=".4"/></linearGradient>'
    + '<linearGradient id="gr1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#22E2A6" stop-opacity="0"/><stop offset=".5" stop-color="#22E2A6" stop-opacity=".65"/><stop offset="1" stop-color="#22E2A6" stop-opacity="0"/></linearGradient>'
    + '</defs>'
    + '<ellipse cx="162" cy="99" rx="132" ry="6" fill="url(#gr1)" opacity=".5"/>'
    + '<path d="M24 76 C30 64 44 55 62 51 L126 38 C156 32 194 31 220 36 L262 45 C277 48 289 57 295 69 L305 72 C311 74 313 77 313 83 L313 85 L24 85 Z" fill="url(#bg1)" stroke="rgba(255,255,255,.16)" stroke-width="1.2" stroke-linejoin="round"/>'
    + '<path d="M98 52 L152 42 C178 38 202 38 218 41 L236 45 L221 59 L106 61 Z" fill="url(#gl1)" stroke="rgba(255,255,255,.14)" stroke-width="1"/>'
    + '<rect x="25" y="70" width="28" height="5" rx="2.5" fill="#FF5A5F" opacity=".95"/>'
    + '<rect x="272" y="66" width="34" height="4.5" rx="2.2" fill="#22E2A6"/>'
    + '<circle cx="96" cy="80" r="18" fill="#06090D" stroke="#2B3746" stroke-width="2.4"/>'
    + '<circle cx="96" cy="80" r="7.5" fill="#161F2A" stroke="#4C5F76" stroke-width="1.6"/>'
    + '<circle cx="238" cy="80" r="18" fill="#06090D" stroke="#2B3746" stroke-width="2.4"/>'
    + '<circle cx="238" cy="80" r="7.5" fill="#161F2A" stroke="#4C5F76" stroke-width="1.6"/>'
    + '</svg>';
}
function carSmallSvg() {
  return '<svg viewBox="0 0 320 108" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M24 76 C30 64 44 55 62 51 L126 38 C156 32 194 31 220 36 L262 45 C277 48 289 57 295 69 L305 72 C311 74 313 77 313 83 L313 85 L24 85 Z" fill="#1B2532" stroke="rgba(25,25,25,.25)" stroke-width="1.4" stroke-linejoin="round"/>'
    + '<path d="M98 52 L152 42 C178 38 202 38 218 41 L236 45 L221 59 L106 61 Z" fill="rgba(120,170,215,.35)" stroke="rgba(255,255,255,.18)" stroke-width="1"/>'
    + '<rect x="25" y="70" width="26" height="5" rx="2.5" fill="#FF5A5F" opacity=".9"/>'
    + '<rect x="272" y="66" width="34" height="4.5" rx="2.2" fill="#FFE812"/>'
    + '<circle cx="96" cy="80" r="17" fill="#06090D" stroke="#2B3746" stroke-width="2"/>'
    + '<circle cx="238" cy="80" r="17" fill="#06090D" stroke="#2B3746" stroke-width="2"/>'
    + '</svg>';
}
function optCarSvg(sel) {
  var c = sel ? '#191919' : '#9A9A9A';
  return '<svg width="34" height="22" viewBox="0 0 34 22" fill="none">'
    + '<path d="M3 15h28" stroke="' + c + '" stroke-width="1.6" stroke-linecap="round"/>'
    + '<path d="M5 15c.2-2.6 1.7-4.2 3.9-4.8l2.6-.8c1.1-.3 2.3-.5 3.7-.5s2.6.2 3.7.5l2.6.8c2.2.6 3.7 2.2 3.9 4.8" stroke="' + c + '" stroke-width="1.6" stroke-linejoin="round"/>'
    + '<circle cx="10" cy="17.4" r="1.7" stroke="' + c + '" stroke-width="1.4"/>'
    + '<circle cx="24" cy="17.4" r="1.7" stroke="' + c + '" stroke-width="1.4"/>'
    + '</svg>';
}
function pinSvg() {
  return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 22s7-6.2 7-11.4A7 7 0 0 0 5 10.6C5 15.8 12 22 12 22Z" fill="#2C7BFF"/><circle cx="12" cy="10" r="2.6" fill="#fff"/></svg>';
}
function cabTopSvg(fill) {
  return '<path d="M0 -8.5 C3.6 -8.5 5.6 -5.8 5.6 -2.6 L5.6 5.6 C5.6 7.6 3.6 8.6 0 8.6 C-3.6 8.6 -5.6 7.6 -5.6 5.6 L-5.6 -2.6 C-5.6 -5.8 -3.6 -8.5 0 -8.5 Z" fill="' + fill + '"/>'
    + '<rect x="-4" y="-4.4" width="8" height="3.6" rx="1.4" fill="#FFE812" opacity=".85"/>';
}

/* --------------------------------------------------- 6. 카카오맵 SDK */

function storedKey() {
  try { return (localStorage.getItem('cybercabKakaoKey') || '').trim(); } catch (e) { return ''; }
}
function activeKey() {
  var k = String(KAKAO_JS_KEY || '').trim();
  if (k && k.indexOf('PLACEHOLDER') < 0 && k.length > 10) return k;
  var q = '';
  try { q = (new URLSearchParams(location.search).get('key') || '').trim(); } catch (e) {}
  if (q && q.indexOf('PLACEHOLDER') < 0) {
    try { localStorage.setItem('cybercabKakaoKey', q); } catch (e) {}
    return q;
  }
  return storedKey();
}
function ll(lat, lng) { return new kakao.maps.LatLng(lat, lng); }
function isSdk() { return !!(window.kakao && kakao.maps && kakao.maps.LatLng); }

function loadSdk(key) {
  return new Promise(function (resolve, reject) {
    if (isSdk()) { resolve(); return; }
    var s = document.createElement('script');
    s.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=' + encodeURIComponent(key) + '&autoload=false&libraries=services';
    s.async = true;
    var done = false;
    s.onload = function () {
      if (done) return;
      done = true;
      try {
        kakao.maps.load(function () { resolve(); });
      } catch (e) { reject(e); }
    };
    s.onerror = function () { if (!done) { done = true; reject(new Error('sdk')); } };
    document.head.appendChild(s);
    setTimeout(function () { if (!done) { done = true; reject(new Error('timeout')); } }, 12000);
  });
}

function bootMap() {
  var key = activeKey();
  if (!key) { showKeyPanel(''); return; }
  loadSdk(key).then(function () {
    initMap(key);
  }).catch(function () {
    showKeyPanel(T('지도를 불러오지 못했습니다. 키와 등록 도메인을 확인해 주세요.', 'Could not load the map SDK. Check the key and its registered domain.'));
  });
}

function showKeyPanel(err) {
  var box = el('mapKey');
  if (!box) return;
  box.hidden = false;
  var key = storedKey();
  box.innerHTML = ''
    + '<div class="mk-h">'
    +   '<div class="mk-ic"><svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M12 22s7-6.2 7-11.4A7 7 0 0 0 5 10.6C5 15.8 12 22 12 22Z" fill="#191919"/><circle cx="12" cy="10" r="2.6" fill="#FFE812"/></svg></div>'
    +   '<div><div class="mk-t">' + T('지도를 켜려면 카카오 JavaScript 키가 필요합니다', 'Add a Kakao JavaScript key to turn on the map') + '</div>'
    +   '<div class="mk-s">KAKAO MAPS · JEONGGWAN-EUP</div></div>'
    + '</div>'
    + '<p>' + T('카카오 <b>개발자센터 → 내 애플리케이션 → 앱 선택 → 앱 키</b>에서 <b>JavaScript 키</b>를 복사해 붙여넣으세요. 지도·주변 차량·경로·장소 검색이 실제 카카오맵으로 동작합니다.',
             'Paste the <b>JavaScript key</b> from your Kakao app (Developers → My Applications → App keys). The map, nearby cars, routes and place search then run on the real Kakao map.') + '</p>'
    + '<div class="mk-in">'
    +   '<input id="keyInput" type="text" autocomplete="off" spellcheck="false" placeholder="JavaScript 앱 키 (32자)" value="' + esc(key) + '">'
    +   '<button class="mk-go" onclick="saveKey()">' + T('저장', 'Save') + '</button>'
    + '</div>'
    + (err ? '<div class="mk-err">' + esc(err) + '</div>' : '')
    + '<div class="mk-steps">'
    +   '<b>' + T('키를 쓰려면 플랫폼 등록이 필요합니다', 'Register the domain first') + '</b><br>'
    +   T('카카오 개발자센터 → 앱 → <b>플랫폼 → Web</b>에 사이트 도메인 <code>https://luke7851-soungouk.github.io</code> 를 등록해야 지도 타일이 표시됩니다. 로컬 테스트는 <code>http://localhost:8000</code> 도 등록해 주세요.',
        'Add <code>https://luke7851-soungouk.github.io</code> under <b>Platform → Web</b>. For local testing add <code>http://localhost:8000</code> too.') + '<br>'
    +   T('키는 이 브라우저에만 저장되며 서버로 보내지 않습니다.', 'The key is stored only in this browser.') + '<br>'
    +   T('키가 없어도 목적지·옵션·결제·차주 모드는 그대로 사용할 수 있습니다.', 'Without a key, destinations, options, payment and owner mode still work.') + '<br>'
    +   '<span style="color:#B0AB9E">' + T('소스의 KAKAO_JS_KEY 상수에 넣으면 배포본에서도 바로 켜집니다.', 'You can also set KAKAO_JS_KEY in app.js and redeploy.') + '</span>'
    + '</div>';
}
function saveKey() {
  var v = (el('keyInput') && el('keyInput').value || '').trim();
  if (!v || v.length < 10) { showKeyPanel(T('키가 너무 짧습니다. JavaScript 앱 키 32자를 붙여넣어 주세요.', 'That key is too short. Paste the 32-character JavaScript key.')); return; }
  try { localStorage.setItem('cybercabKakaoKey', v); } catch (e) {}
  location.reload();
}

function initMap(key) {
  MAP.key = key;
  var box = el('kakaoMap');
  if (!box) return;
  MAP.map = new kakao.maps.Map(box, { center: ll(PICKUP.lat, PICKUP.lng), level: 5 });
  MAP.map.setMinLevel(2);
  MAP.map.setMaxLevel(9);
  MAP.sdk = true;
  MAP.ready = true;
  el('mapKey').hidden = true;
  el('mapTypeBtn').hidden = false;

  kakao.maps.event.addListener(MAP.map, 'zoom_changed', function () { syncZoomUi(); save(); });
  kakao.maps.event.addListener(MAP.map, 'click', function () { if (cabPopId) { cabPopId = null; renderCabPop(); } });

  buildPickupOverlay();
  buildCabOverlays();
  setMapType(state.mapType, true);
  syncZoomUi();
  MAP.sig = '';
  renderMapLayers(true);
  startCabTick();
  showMapNote(T('실제 카카오맵 · 부산 기장군 정관읍', 'Live Kakao map · Jeonggwan-eup, Busan'));
}

function showMapNote(txt) {
  var n = el('mapNote');
  if (!n) return;
  n.hidden = false;
  n.innerHTML = txt;
  clearTimeout(showMapNote._t);
  showMapNote._t = setTimeout(function () { n.hidden = true; }, 5200);
}

/* ---- 현위치(승차 지점) ---- */
function buildPickupOverlay() {
  if (MAP.pickupOv || !MAP.ready) return;
  var node = document.createElement('div');
  node.className = 'pk-mk';
  node.innerHTML = '<i></i>';
  MAP.pickupOv = new kakao.maps.CustomOverlay({
    position: ll(PICKUP.lat, PICKUP.lng), content: node, xAnchor: 0.5, yAnchor: 0.5, zIndex: 8
  });
  MAP.pickupOv.setMap(MAP.map);
}

/* ---- 주변 사이버캡 5대 (실제 좌표 · 도로 위 이동) ---- */
function loopPath(cab) {
  var l = (R.loops && R.loops[cab.loop]) || null;
  var pts = (l && l.path) || [];
  if (!pts.length) {
    /* 데이터가 없을 때를 위한 최소 폴백: 현위치 둘레 */
    pts = [];
    for (var i = 0; i < 12; i++) {
      var a = i / 12 * Math.PI * 2;
      pts.push([PICKUP.lat + Math.sin(a) * 0.004, PICKUP.lng + Math.cos(a) * 0.004]);
    }
  }
  return pts;
}
function segLen(a, b) {
  var dy = (b[0] - a[0]) * 111320;
  var dx = (b[1] - a[1]) * 111320 * Math.cos((a[0] + b[0]) / 2 * Math.PI / 180);
  return Math.sqrt(dx * dx + dy * dy);
}
function pathMetrics(pts) {
  var cum = [0], total = 0;
  for (var i = 1; i < pts.length; i++) { total += segLen(pts[i - 1], pts[i]); cum.push(total); }
  return { cum: cum, total: total || 1 };
}
function pointAt(pts, cum, total, dist) {
  var d = ((dist % total) + total) % total;
  var i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  var a = pts[i - 1], b = pts[i] || pts[i - 1];
  var seg = (cum[i] - cum[i - 1]) || 1;
  var t = Math.max(0, Math.min(1, (d - cum[i - 1]) / seg));
  var lat = a[0] + (b[0] - a[0]) * t;
  var lng = a[1] + (b[1] - a[1]) * t;
  var dy = b[0] - a[0], dx = (b[1] - a[1]) * Math.cos(lat * Math.PI / 180);
  var bearing = Math.atan2(dx, dy) * 180 / Math.PI;  /* 0 = 북쪽 */
  return { lat: lat, lng: lng, bearing: bearing };
}

function buildCabOverlays() {
  if (!MAP.ready) return;
  for (var i = 0; i < CABS.length; i++) {
    var c = CABS[i];
    if (MAP.cabs[c.id]) continue;
    var pts = loopPath(c);
    c._pts = pts;
    c._m = pathMetrics(pts);
    if (c._dist == null) c._dist = c._m.total * (c.at || 0);

    var node = document.createElement('div');
    node.className = 'cabmk' + (c.mine ? ' mine' : '');
    node.innerHTML = '<div class="cabmk-eta">' + c.eta + T('분', 'm') + '</div>'
      + '<div class="cabmk-rot"><div class="cabmk-body">'
      + '<svg viewBox="-10 -10 20 20" xmlns="http://www.w3.org/2000/svg">' + cabTopSvg('#FFE812') + '</svg>'
      + '</div></div>';
    node.addEventListener('click', (function (id) {
      return function (ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); tapCab(id); };
    })(c.id));

    var ov = new kakao.maps.CustomOverlay({
      position: ll(pts[0][0], pts[0][1]), content: node, xAnchor: 0.5, yAnchor: 0.5,
      zIndex: 5, clickable: true
    });
    ov.setMap(MAP.map);
    MAP.cabs[c.id] = { ov: ov, node: node };
    placeCab(c, true);
  }
}

function placeCab(c, initial) {
  var h = MAP.cabs[c.id];
  if (!h || !c._m) return;
  var p = pointAt(c._pts, c._m.cum, c._m.total, c._dist);
  c.lat = p.lat; c.lng = p.lng; c.rot = p.bearing;
  if (h.ov && isSdk()) h.ov.setPosition(ll(p.lat, p.lng));
  var rot = h.node.querySelector('.cabmk-rot');
  if (rot) rot.style.transform = 'rotate(' + Math.round(p.bearing) + 'deg)';
}

function startCabTick() {
  if (cabTimer) clearInterval(cabTimer);
  var last = Date.now();
  cabTimer = setInterval(function () {
    var now = Date.now();
    var dt = Math.min(2, (now - last) / 1000);
    last = now;
    var moving = (state.phase === 'idle' || state.phase === 'route');
    for (var i = 0; i < CABS.length; i++) {
      var c = CABS[i];
      if (!c._m) continue;
      if (moving) c._dist += (c.kmh * 1000 / 3600) * dt;
      placeCab(c);
    }
    if (state.phase === 'matched' && ride && ride.car && MAP.approach) {
      var cc = cabObj(ride.car.id);
      MAP.approach.setPath([ll(cc.lat, cc.lng), ll(PICKUP.lat, PICKUP.lng)]);
    }
  }, 300);
}

function updateCabVisibility() {
  for (var i = 0; i < CABS.length; i++) {
    var c = CABS[i], h = MAP.cabs[c.id];
    if (!h) continue;
    var hide = (state.phase === 'riding' || state.phase === 'done');
    if (state.phase === 'matched') hide = !(ride && ride.car && ride.car.id === c.id);
    h.node.style.display = hide ? 'none' : 'block';
    var assigned = !!(ride && ride.car && ride.car.id === c.id &&
      (state.phase === 'matched' || state.phase === 'riding' || state.phase === 'done'));
    h.node.className = 'cabmk' + (c.mine ? ' mine' : '') + (state.phase === 'route' ? ' dim' : '') + (assigned ? ' assigned' : '');
  }
}

/* ---- 경로 폴리라인 + 목적지 핀 ---- */
function clearRouteLayers() {
  [MAP.halo, MAP.line, MAP.approach, MAP.dot].forEach(function (o) { if (o) o.setMap(null); });
  MAP.halo = MAP.line = MAP.approach = MAP.dot = null;
  if (MAP.destOv) { MAP.destOv.setMap(null); MAP.destOv = null; }
}

function renderMapLayers(force) {
  if (!MAP.ready) return;
  var d = destObj();
  var show = !!(d && state.phase !== 'idle');
  var sig = (show ? d.id + ':' + (d.lat || '') + ':' + (d.lng || '') : 'none') + '|' + state.phase + '|' + state.mapBig;
  updateCabVisibility();
  if (!force && sig === MAP.sig) { updateDot(); return; }
  MAP.sig = sig;
  clearRouteLayers();
  if (!show) { fitPickup(); return; }

  var pts = d.path && d.path.length ? d.path : [[PICKUP.lat, PICKUP.lng], [d.lat, d.lng]];
  var path = pts.map(function (p) { return ll(p[0], p[1]); });

  MAP.halo = new kakao.maps.Polyline({
    path: path, strokeWeight: 11, strokeColor: '#FFFFFF', strokeOpacity: 0.92, strokeStyle: 'solid', zIndex: 2
  });
  MAP.halo.setMap(MAP.map);
  MAP.line = new kakao.maps.Polyline({
    path: path, strokeWeight: 6, strokeColor: '#191919', strokeOpacity: 0.9, strokeStyle: 'solid', zIndex: 3
  });
  MAP.line.setMap(MAP.map);

  /* 목적지 핀 */
  var dn = document.createElement('div');
  dn.className = 'dst-mk';
  dn.innerHTML = '<div class="dl">' + esc(isKO() ? d.ko : d.en) + '</div><div class="dp"><i></i></div>';
  MAP.destOv = new kakao.maps.CustomOverlay({
    position: ll(d.lat, d.lng), content: dn, xAnchor: 0.5, yAnchor: 1, zIndex: 9
  });
  MAP.destOv.setMap(MAP.map);

  if (state.phase === 'matched' && ride && ride.car) {
    var cc = cabObj(ride.car.id);
    MAP.approach = new kakao.maps.Polyline({
      path: [ll(cc.lat, cc.lng), ll(PICKUP.lat, PICKUP.lng)],
      strokeWeight: 3, strokeColor: '#191919', strokeOpacity: 0.45, strokeStyle: 'dashed', zIndex: 2
    });
    MAP.approach.setMap(MAP.map);
  }
  if (state.phase === 'riding') {
    MAP.dot = new kakao.maps.CustomOverlay({
      position: ll(PICKUP.lat, PICKUP.lng),
      content: '<div class="ride-dot"></div>', xAnchor: 0.5, yAnchor: 0.5, zIndex: 7
    });
    MAP.dot.setMap(MAP.map);
    updateDot();
  }
  fitRoute(pts, d);
}

function updateDot() {
  if (!MAP.dot || !ride || !ride.dest || !ride.dest.path) return;
  var pts = ride.dest.path;
  var m = pathMetrics(pts);
  var p = pointAt(pts, m.cum, m.total, m.total * Math.max(0, Math.min(1, ride.progress || 0)));
  MAP.dot.setPosition(ll(p.lat, p.lng));
}

function boundsOf(pts) {
  var b = new kakao.maps.LatLngBounds();
  b.extend(ll(PICKUP.lat, PICKUP.lng));
  for (var i = 0; i < pts.length; i++) b.extend(ll(pts[i][0], pts[i][1]));
  return b;
}

/* 목적지까지 전체 경로가 시트 위쪽 화면에 들어오도록 자동 맞춤 */
var VISIBLE_MAP = { idle: 0.5, route: 0.34, searching: 0.6, matched: 0.38, riding: 0.54, done: 0.24 };
function fitRoute(pts, d) {
  if (!MAP.ready) return;
  var h = (el('mapWrap') && el('mapWrap').clientHeight) || 560;
  var w = (el('mapWrap') && el('mapWrap').clientWidth) || 420;
  var vis = state.mapBig ? 0.92 : (VISIBLE_MAP[state.phase] || 0.4);
  /* 카카오 setBounds 의 상단 패딩이 중심을 어긋나게 만들어서(실측: top>0 이면 경로가 화면 밖으로)
     하단 패딩만으로 시트 위 가시 영역을 정확히 지정합니다. */
  var bottom = Math.max(40, Math.round(h * (1 - vis)) - 6);
  try {
    MAP.map.setBounds(boundsOf(pts), 0, 0, bottom, 0);
  } catch (e) {
    try { MAP.map.setBounds(boundsOf(pts)); } catch (e2) {}
  }
  MAP.boundsK++;
  topAlignRoute(pts, Math.min(44, Math.max(0, (h - bottom) * 0.16)), h - bottom);
  syncZoomUi();
}

/* setBounds 결과가 화면 맨 위에 붙는 경우가 있어, 경로가 위쪽 여백 안에 오도록 중심을 살짝 내립니다. */
function topAlignRoute(pts, margin, sheetTop) {
  if (!MAP.ready || !margin) return;
  try {
    var pr = MAP.map.getProjection();
    var minY = 1e9, maxY = -1e9;
    var all = [[PICKUP.lat, PICKUP.lng]].concat(pts);
    for (var i = 0; i < all.length; i++) {
      var p = pr.containerPointFromCoords(ll(all[i][0], all[i][1]));
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    var sheetTopPx = sheetTop || (MAP.map.getNode().clientHeight * 0.6);
    var room = sheetTopPx - 16 - maxY;              /* 아래로 더 내릴 수 있는 여유 */
    var want = margin - minY;
    var dy = Math.max(0, Math.min(want, room));
    if (dy < 1) return;
    var ctr = MAP.map.getCenter();
    var pc = pr.containerPointFromCoords(ctr);
    var tgt = pr.coordsFromContainerPoint(new kakao.maps.Point(pc.x, pc.y - dy));
    MAP.map.setCenter(tgt);
  } catch (e) {}
}

function fitPickup() {
  if (!MAP.ready) return;
  MAP.map.setLevel(5);
  MAP.map.panTo(ll(PICKUP.lat, PICKUP.lng));
}

/* ---- 확대·축소·현위치·지도 종류 ---- */
function zoomFactor(level) { return Math.pow(2, 5 - level); }
function syncZoomUi() {
  if (!MAP.ready) return;
  var lv = MAP.map.getLevel();
  var k = zoomFactor(lv);
  var lab = el('zoomLabel');
  if (lab) {
    lab.textContent = (k >= 10 ? k.toFixed(0) : (k >= 0.1 ? k.toFixed(1) : k.toFixed(2))) + 'x';
    lab.className = 'zlab' + (lv === 5 ? ' one' : '');
  }
  var zin = el('zoomInBtn'), zout = el('zoomOutBtn');
  if (zin) zin.className = 'mbtn' + (lv <= 2 ? ' off' : '');
  if (zout) zout.className = 'mbtn' + (lv >= 9 ? ' off' : '');
  state.zoom = k;
}
function zoomIn() { if (!MAP.ready) return false; MAP.map.setLevel(Math.max(2, MAP.map.getLevel() - 1)); syncZoomUi(); save(); return true; }
function zoomOut() { if (!MAP.ready) return false; MAP.map.setLevel(Math.min(9, MAP.map.getLevel() + 1)); syncZoomUi(); save(); return true; }
function setZoom(k) {
  if (!MAP.ready) return null;
  var lv = Math.round(5 - Math.log2(Math.max(0.05, parseFloat(k) || 1)));
  MAP.map.setLevel(Math.max(2, Math.min(9, lv)));
  syncZoomUi(); save();
  showToast(T('지도 ' + zoomFactor(MAP.map.getLevel()).toFixed(1) + '배', 'Map ' + zoomFactor(MAP.map.getLevel()).toFixed(1) + 'x'));
  return zoomFactor(MAP.map.getLevel());
}
function recenter() {
  if (!MAP.ready) { showToast(T('지도를 먼저 켜 주세요', 'Turn the map on first')); return; }
  fitPickup();
  syncZoomUi();
  showToast(T('현위치로 이동했습니다 · 정관읍 중앙공원', 'Back to your location · Jungang Park'));
}
function setMapType(t, quiet) {
  state.mapType = (t === 'skyview') ? 'skyview' : 'roadmap';
  if (MAP.ready) {
    try {
      MAP.map.setMapTypeId(state.mapType === 'skyview' ? kakao.maps.MapTypeId.SKYVIEW : kakao.maps.MapTypeId.ROADMAP);
    } catch (e) {
      state.mapType = 'roadmap';
      try { MAP.map.setMapTypeId(kakao.maps.MapTypeId.ROADMAP); } catch (e2) {}
    }
  }
  var b = el('mapTypeBtn'), l = el('mapTypeLabel');
  var sky = state.mapType === 'skyview';
  if (b) b.className = 'maptype' + (sky ? ' on' : '');
  if (l) l.textContent = sky ? T('일반지도', 'Road map') : T('스카이뷰', 'Skyview');
  save();
  if (!quiet) showToast(sky ? T('스카이뷰로 전환했습니다', 'Skyview on') : T('일반지도로 전환했습니다', 'Road map on'));
  return state.mapType;
}
function toggleMapType() { return setMapType(state.mapType === 'skyview' ? 'roadmap' : 'skyview'); }

/* ---- 장소 키워드 검색 (카카오맵 services.Places) ---- */
function searchPlaces(q, cb) {
  if (!isSdk() || !kakao.maps.services || !kakao.maps.services.Places) { cb([]); return; }
  try {
    var ps = new kakao.maps.services.Places();
    ps.keywordSearch(q, function (data, status) {
      if (status !== kakao.maps.services.Status.OK) { cb([]); return; }
      cb(data.slice(0, 8).map(function (p) {
        return {
          name: p.place_name,
          addr: p.road_address_name || p.address_name || '',
          lat: parseFloat(p.y), lng: parseFloat(p.x),
          cat: p.category_name ? String(p.category_name).split('>').pop().trim() : ''
        };
      }));
    }, {});
  } catch (e) { cb([]); }
}

/* ---------------------------------------------- 7. 경로 없는 목적지 처리 */

function havKm(aLat, aLng, bLat, bLng) {
  var Rk = 6371, dLat = (bLat - aLat) * Math.PI / 180, dLng = (bLng - aLng) * Math.PI / 180;
  var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * Rk * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function estimateFromLine(lat, lng) {
  var straight = havKm(PICKUP.lat, PICKUP.lng, lat, lng);
  var km = Math.max(0.3, straight * 1.28);      /* 도로 우회 계수 */
  return {
    km: Math.round(km * 10) / 10,
    min: Math.max(3, Math.round(km / 26 * 60))  /* 시내 평균 26km/h */
  };
}
/* 검색한 장소는 실제 도로 경로를 한 번 조회하고, 실패하면 직선 추정으로 남깁니다. */
function refineRoute(lat, lng) {
  var url = OSRM + PICKUP.lng + ',' + PICKUP.lat + ';' + lng + ',' + lat + '?overview=full&geometries=geojson';
  return fetch(url, { mode: 'cors' }).then(function (r) { return r.json(); }).then(function (j) {
    if (!j || j.code !== 'Ok' || !j.routes || !j.routes[0]) return null;
    var rt = j.routes[0];
    return {
      km: Math.round(rt.distance / 100) / 10,
      min: Math.max(3, Math.round(rt.duration / 60 * 1.3)),
      path: rt.geometry.coordinates.map(function (c) { return [c[1], c[0]]; }),
      road: true
    };
  }).catch(function () { return null; });
}

/* ------------------------------------------------------------ 8. 시트들 */

function sheetFor(phase) {
  if (phase === 'route') return sheetRoute();
  if (phase === 'searching') return sheetSearching();
  if (phase === 'matched') return sheetMatched();
  if (phase === 'riding') return sheetRiding();
  if (phase === 'done') return sheetDone();
  return sheetIdle();
}

function sheetIdle() {
  var html = '<div class="sheet-inner">';
  html += '<div class="pickup">'
    + '<div class="pickup-ic">' + pinSvg() + '</div>'
    + '<div class="pickup-tx"><b>' + T(PICKUP.ko, PICKUP.en) + '</b>'
    + '<span>' + T('현위치 · GPS 정확도 12m', 'Current location · GPS ±12m') + '</span></div>'
    + '<button class="mini-ghost" onclick="recenter()">' + T('지도', 'Map') + '</button>'
    + '</div>';
  html += '<div class="q">' + T('어디로 갈까요?', 'Where to?') + '</div>';
  html += '<div class="searchbox">'
    + '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="10.5" cy="10.5" r="6.4" stroke="#9E9E9E" stroke-width="2"/><path d="M15.4 15.4 20 20" stroke="#9E9E9E" stroke-width="2" stroke-linecap="round"/></svg>'
    + '<input id="destInput" class="searchinput" type="text" autocomplete="off" placeholder="' + T('카카오맵 장소 검색 (예: 기장역, 광안리)', 'Search a place (e.g. Gijang Station)') + '" oninput="onDestSearch(this.value)">'
    + '</div>';
  html += '<div class="results" id="destResults"></div>';
  html += '<div class="sect">' + T('추천 목적지 · 실주행 거리', 'SUGGESTED · REAL ROAD DISTANCE') + '</div>';
  html += '<div class="chips" id="destChips">';
  for (var i = 0; i < DESTS.length; i++) {
    var d = DESTS[i];
    html += '<button class="chip" onclick="selectDest(\'' + d.id + '\')"><span class="ce">' + d.ce + '</span>' + (isKO() ? d.ko : d.en) + '</button>';
  }
  html += '</div>';
  html += '<div class="nearby"><span class="live-dot"></span><div>'
    + T('정관읍 도로 위에 사이버캡 <b>' + CABS.length + '대</b>가 운행 중입니다',
        '<b>' + CABS.length + '</b> Cybercabs are driving the streets of Jeonggwan')
    + '</div></div>';
  html += '</div>';
  return html;
}

function resultRow(nm, sub, right, onclick) {
  return '<div class="rrow" onclick="' + onclick + '">'
    + '<div style="font-size:15px">' + sub.ic + '</div>'
    + '<div><div class="rn">' + esc(nm) + '</div><div class="ra">' + esc(sub.text) + '</div></div>'
    + '<div class="rk">' + right + '</div>'
    + '</div>';
}

function onDestSearch(v) {
  var box = el('destResults');
  if (!box) return;
  var q = String(v || '').trim();
  if (!q) { box.innerHTML = ''; lastResults = []; return; }
  var low = q.toLowerCase().replace(/\s+/g, '');
  var local = '';
  for (var i = 0; i < DESTS.length; i++) {
    var d = DESTS[i];
    var hay = (d.ko + d.en + d.area + d.areaEn).toLowerCase().replace(/\s+/g, '');
    if (hay.indexOf(low) < 0) continue;
    local += resultRow(isKO() ? d.ko : d.en,
      { ic: d.ce, text: d.area + ' · ' + d.km + 'km' },
      T('약 ' + d.min + '분', '~' + d.min + ' min'),
      'selectDest(\'' + d.id + '\')');
  }
  var note = '<div class="ra" style="padding:6px 2px" id="placeState">' + T('카카오맵에서 장소를 찾는 중…', 'searching Kakao places…') + '</div>';
  box.innerHTML = local + note;

  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(function () {
    searchPlaces(q, function (list) {
      lastResults = list || [];
      var add = '';
      for (var i = 0; i < lastResults.length; i++) {
        var p = lastResults[i];
        if (!isFinite(p.lat) || !isFinite(p.lng)) continue;
        var km = estimateFromLine(p.lat, p.lng).km;
        add += resultRow(p.name,
          { ic: '📍', text: (p.addr || p.cat || T('주소 없음', 'no address')) },
          km + 'km',
          'choosePlace(' + i + ')');
      }
      var cur = el('destResults');
      if (!cur || String((el('destInput') || {}).value || '').trim() !== q) return;
      cur.innerHTML = local + (add || '<div class="ra" style="padding:6px 2px">' + T('카카오맵 검색 결과가 없습니다', 'No Kakao place found') + '</div>');
    });
  }, 320);
}

function choosePlace(i) {
  var p = lastResults[i];
  if (!p) return;
  var est = estimateFromLine(p.lat, p.lng);
  state.dest = 'custom';
  state.custom = { name: p.name, addr: p.addr || '', lat: p.lat, lng: p.lng, km: est.km, min: est.min, path: null, road: false };
  state.phase = 'route';
  state.sheetMin = false;
  cabPopId = null;
  save();
  renderAll();
  showToast(T(p.name + ' · ' + est.km + 'km (경로 확인 중)', p.name + ' · ' + est.km + 'km (refining route)'));
  refineRoute(p.lat, p.lng).then(function (r) {
    if (!r || state.dest !== 'custom' || !state.custom) return;
    if (Math.abs(state.custom.lat - p.lat) > 1e-6 || Math.abs(state.custom.lng - p.lng) > 1e-6) return;
    state.custom.km = r.km; state.custom.min = r.min; state.custom.path = r.path; state.custom.road = true;
    save();
    MAP.sig = '';
    renderAll();
    if (ride && state.phase !== 'route') { /* 이미 호출한 경우는 그대로 둠 */ }
  });
  signal(T(p.name + '까지 배차 정보를 확인합니다.', 'Showing ride options to ' + p.name));
}

function sumLine(d) {
  var extra = d.road === false && d.id === 'custom' ? T(' · 직선 추정', ' · straight-line est.') : ' · ' + T('실주행 경로', 'real road route');
  return T('약 ' + d.min + '분 소요', 'about ' + d.min + ' min')
    + ' <i></i> ' + clockAfter(d.min) + T(' 도착 예정', ' arrival')
    + ' <i></i> ' + d.km + 'km' + extra;
}

function sheetRoute() {
  var d = destObj();
  var o = optObj();
  if (!d) return sheetIdle();
  var html = '<div class="sheet-inner">';
  html += '<div class="rh">'
    + '<div class="rps">'
    +   '<div class="rp"><i class="d1"></i><span>' + T(PICKUP.ko, PICKUP.en) + '</span></div>'
    +   '<div class="rpline"></div>'
    +   '<div class="rp"><i class="d2"></i><span>' + esc(isKO() ? d.ko : d.en) + '</span></div>'
    + '</div>'
    + '<button class="chg" onclick="clearDest()">' + T('변경', 'Edit') + '</button>'
    + '</div>';
  html += '<div class="sum">' + sumLine(d) + '</div>';
  html += '<div class="sect">' + T('차량 선택', 'CHOOSE A RIDE') + '</div>';
  html += '<div class="opts">';
  for (var i = 0; i < OPTIONS.length; i++) {
    var oo = OPTIONS[i];
    var sel = oo.id === o.id;
    html += '<div class="opt' + (sel ? ' sel' : '') + '" onclick="setOption(\'' + oo.id + '\')">'
      + '<div class="opt-ic">' + optCarSvg(sel) + '</div>'
      + '<div class="opt-tx">'
      +   '<div class="opt-nm">' + (isKO() ? oo.ko : oo.en) + '</div>'
      +   '<div class="opt-nt">' + (isKO() ? oo.note : oo.noteEn) + '</div>'
      +   '<div class="opt-eta"><i></i>' + T(oo.eta + '분 후 도착', 'in ' + oo.eta + ' min') + '</div>'
      + '</div>'
      + '<div class="opt-pr"><b>' + wonShort(fareOf(oo, d)) + '</b><span>' + T('예상', 'est.') + '</span></div>'
      + '</div>';
  }
  html += '</div>';
  html += '<div class="coupon' + (state.coupon ? ' on' : '') + '" onclick="toggleCoupon()">'
    + '<div class="cp-ic">🎟</div>'
    + '<div class="cp-tx"><b>' + T('첫 탑승 3,000원 할인', 'First ride 3,000 off') + '</b>'
    + '<span>' + T(state.coupon ? '쿠폰이 적용되었습니다' : '쿠폰을 적용하려면 눌러 주세요', state.coupon ? 'Coupon applied' : 'Tap to apply the coupon') + '</span></div>'
    + '<div class="ck">✓</div>'
    + '</div>';
  var p = payObj();
  html += '<div class="paybar" onclick="openPay()">'
    + '<span class="pb-ic" style="background:' + p.bg + ';color:' + p.fg + '">' + p.ic + '</span>'
    + '<span class="pb-nm">' + payLabel(p) + '</span>'
    + (p.tag ? '<span class="pb-tag">' + T(p.tag, 'default') + '</span>' : '')
    + '<span class="pb-arw">›</span>'
    + '</div>';
  html += kakaoCardHtml(d);
  html += '<div class="foot"><button class="callbtn" onclick="callCab()">'
    + '<span class="cb-l">' + T('사이버캡 호출하기', 'Call a Cybercab') + '</span>'
    + '<span class="cb-r">' + payLabel(p) + ' · ' + wonShort(payAmount(fareOf(o, d))) + '</span>'
    + '</button></div>';
  html += '</div>';
  return html;
}

function sheetSearching() {
  return '<div class="sheet-inner"><div class="srch">'
    + '<div class="radar"><div class="rr"></div><div class="rr"></div><div class="rr"></div>'
    + '<div class="radar-core">'
    + '<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M3.2 14.6h17.6" stroke="#191919" stroke-width="1.7" stroke-linecap="round"/><path d="M5 14.6c.2-2.2 1.5-3.6 3.4-4.1l2.3-.7c1-.3 2.1-.45 3.3-.45s2.3.15 3.3.45l2.3.7c1.9.5 3.2 1.9 3.4 4.1" stroke="#191919" stroke-width="1.7" stroke-linejoin="round"/><circle cx="7.8" cy="16.8" r="1.5" stroke="#191919" stroke-width="1.4"/><circle cx="16.2" cy="16.8" r="1.5" stroke="#191919" stroke-width="1.4"/></svg>'
    + '</div></div>'
    + '<h2>' + T('주변 사이버캡을 찾고 있어요', 'Finding a Cybercab nearby') + '</h2>'
    + '<p>' + T('정관읍 중앙공원 주변 · 잠시만 기다려 주세요', 'Around Jungang Park · just a moment') + '</p>'
    + '<div class="srch-meta">'
    + '<span>' + T('반경 3km', '3 km radius') + '</span>'
    + '<span>' + T('사이버캡 ' + CABS.length + '대', CABS.length + ' cabs') + '</span>'
    + '<span>' + T('평균 2분', 'avg 2 min') + '</span>'
    + '</div>'
    + '</div>'
    + '<button class="ghost" onclick="cancelRide()">' + T('호출 취소', 'Cancel call') + '</button>'
    + '</div>';
}

function sheetMatched() {
  if (!ride) return sheetIdle();
  var c = ride.car, d = ride.dest, left = ride.etaLeft;
  var etaTxt = left > 0 ? (left + T('분', 'min')) : T('도착', 'Here');
  return '<div class="sheet-inner">'
    + '<div class="matched-top"><div style="flex:1">'
    + '<div class="mtitle">' + T('배차 완료', 'Your ride is set') + (c.mine ? '<span class="badge-mine">' + T('내 차량', 'My car') + '</span>' : '') + '</div>'
    + '<div class="msub" id="matchState">' + T(left > 0 ? '사이버캡이 승차 지점으로 오고 있습니다' : '차량이 승차 지점에 도착했습니다', left > 0 ? 'Your Cybercab is on the way' : 'Your car has arrived') + '</div>'
    + '</div></div>'
    + '<div class="car-card" style="background:#fff">'
    +   '<div class="car-vis">' + carSmallSvg() + '</div>'
    +   '<div style="flex:1;min-width:0">'
    +     '<div class="car-plate">' + c.plate + '</div>'
    +     '<div class="car-model">' + c.model + ' · ' + T('무인 자율주행', 'driverless') + '</div>'
    +     '<div class="car-tags"><span class="ctag k">🔋 ' + c.battery + '%</span><span class="ctag">⭐ ' + c.rating.toFixed(2) + '</span><span class="ctag">' + T('4인승', '4 seats') + '</span></div>'
    +   '</div>'
    +   '<div class="eta-big"><b id="matchEta">' + etaTxt + '</b><span>' + T('도착까지', 'to arrival') + '</span></div>'
    + '</div>'
    + '<div class="grid3">'
    +   '<div class="g3"><span>' + T('목적지', 'Destination') + '</span><b style="font-size:12px">' + esc(isKO() ? d.ko : d.en) + '</b></div>'
    +   '<div class="g3"><span>' + T('예상 요금', 'Fare') + '</span><b style="font-size:14px">' + wonShort(ride.pay) + '</b></div>'
    +   '<div class="g3"><span>' + T('결제', 'Payment') + '</span><b style="font-size:11.5px">' + payLabel(payObj(ride.payId)) + '</b></div>'
    + '</div>'
    + '<div class="btnrow">'
    +   '<button class="btn-main" onclick="openDoor()">🔓 ' + T('차량 문 열기 (원터치 잠금 해제)', 'Unlock the door') + '</button>'
    +   '<div class="btn-pair">'
    +     '<button class="btn-main sub" onclick="shareRoute()">' + (ride.shared ? '✅ ' + T('경로 공유됨', 'Shared') : '🛡 ' + T('안심 경로 공유', 'Share route')) + '</button>'
    +     '<button class="btn-main sub" onclick="cancelRide()">' + T('호출 취소', 'Cancel') + '</button>'
    +   '</div>'
    + '</div>'
    + '</div>';
}

function sheetRiding() {
  if (!ride) return sheetIdle();
  var d = ride.dest;
  return '<div class="sheet-inner">'
    + '<div class="ride-h">'
    +   '<div><div class="mtitle">' + T('탑승 중', 'On the way') + '</div>'
    +   '<div class="msub">' + T(PICKUP.ko, PICKUP.en) + ' → ' + esc(isKO() ? d.ko : d.en) + '</div></div>'
    +   '<span class="badge"><span class="live-dot" style="background:#191919"></span>' + T('자율주행', 'FSD') + '</span>'
    + '</div>'
    + '<div class="progress"><i id="rideBar"></i></div>'
    + '<div class="grid3">'
    +   '<div class="g3"><span>' + T('남은 시간', 'Time left') + '</span><b id="rideEta">' + d.min + T('분', 'min') + '</b></div>'
    +   '<div class="g3"><span>' + T('남은 거리', 'Distance') + '</span><b id="rideKm">' + d.km + 'km</b></div>'
    +   '<div class="g3"><span>' + T('현재 속도', 'Speed') + '</span><b id="rideSpd">42km/h</b></div>'
    + '</div>'
    + '<div class="car-card" style="margin-top:11px">'
    +   '<div class="car-vis" style="width:56px">' + carSmallSvg() + '</div>'
    +   '<div style="flex:1;min-width:0"><div class="car-plate" style="font-size:13.5px">' + ride.car.plate + '</div>'
    +   '<div class="car-model">' + ride.car.model + ' · ' + T('도착 예정 ', 'arriving ') + clockAfter(d.min) + '</div></div>'
    +   '<div class="car-tags" style="margin:0">' + (ride.shared ? '<span class="ctag k">🛡 ' + T('경로 공유 중', 'route shared') + '</span>' : '') + '</div>'
    + '</div>'
    + '<div style="font-size:10.5px;color:#9A9A9A;text-align:center;margin-top:10px">' + T('FSD가 스스로 주행합니다 · 안전벨트를 착용해 주세요', 'FSD is driving · please keep your seatbelt on') + '</div>'
    + '</div>';
}

function sheetDone() {
  if (!ride) return sheetIdle();
  var d = ride.dest, base = baseFareOf(d), optAdj = ride.fare - base, hh = ride.time || nowClock();
  var html = '<div class="sheet-inner">'
    + '<div class="done-h"><div class="ok">✓</div>'
    + '<h2>' + T('목적지에 도착했습니다', 'You have arrived') + '</h2>'
    + '<p>' + esc(isKO() ? d.ko : d.en) + ' · ' + hh + ' ' + T('자동 결제 완료', 'auto-paid') + '</p></div>'
    + '<div class="rcp">'
    +   '<div class="rrow2"><span>' + T('기본 요금', 'Base fare') + '</span><b>' + wonShort(BASE_FARE) + '</b></div>'
    +   '<div class="rrow2"><span>' + T('거리 요금', 'Distance') + ' (' + d.km + 'km × ' + num(PER_KM) + '원)</span><b>' + wonShort(base - BASE_FARE) + '</b></div>';
  if (optAdj !== 0) {
    html += '<div class="rrow2"><span>' + (isKO() ? optObj(ride.optId).ko : optObj(ride.optId).en) + '</span><b>+' + wonShort(optAdj) + '</b></div>';
  }
  if (ride.couponOn) {
    html += '<div class="rrow2 off"><span>' + T('쿠폰 할인', 'Coupon') + '</span><b>-' + wonShort(COUPON) + '</b></div>';
  }
  html += '<div class="rtotal"><span>' + T('결제 금액', 'Total paid') + '</span><span>' + wonShort(ride.pay) + '</span></div>'
    +   '<div class="rrow2" style="margin-top:6px"><span>' + T('결제 수단', 'Payment') + '</span><b>' + payLabel(payObj(ride.payId)) + '</b></div>'
    +   '<div class="rrow2"><span>' + T('차량', 'Vehicle') + '</span><b>' + ride.car.plate + '</b></div>'
    +   '</div>';
  if (ride.car.mine) {
    var fee = Math.round(ride.pay * FEE_RATE);
    html += '<div class="setl">'
      + '<div class="st">💰 ' + T('차주 정산 내역', 'Owner settlement') + '</div>'
      + '<div class="sr"><span>' + T('승객 결제', 'Rider paid') + '</span><span>' + wonShort(ride.pay) + '</span></div>'
      + '<div class="sr"><span>' + T('플랫폼 수수료 15%', 'Platform fee 15%') + '</span><span>-' + wonShort(fee) + '</span></div>'
      + '<div class="sr strong"><span>' + T('차주 순수익', 'Owner net') + '</span><span>' + wonShort(ride.pay - fee) + '</span></div>'
      + '<div class="note">' + T('내 차량 운행분이라 내 차주 정산에 자동 반영되었습니다', 'This was your own car, so it was added to your owner earnings') + '</div>'
      + '</div>';
  } else {
    html += '<div class="setl"><div class="st">' + T('다른 차주의 차량입니다', 'Another owner’s car') + '</div>'
      + '<div class="sr">' + T('정산은 해당 차주 계정으로 처리됩니다.', 'The fare is settled to that owner’s account.') + '</div></div>';
  }
  html += '<div class="foot"><button class="callbtn plain" onclick="finishRide()">' + T('확인', 'Done') + '</button></div>'
    + '</div>';
  return html;
}

/* ------------------------------------------------------ 9. 카카오 앱 연결 */

var KAKAO_T_SCHEME = 'kakaot://';
var KAKAO_T_STORE = 'https://play.google.com/store/apps/details?id=com.kakao.taxi';
var KAKAO_MAP_DEST = 'https://map.kakao.com/link/to/';

function kakaoMapUrl(id) {
  var d = destObj(id);
  if (!d) return '';
  var nm = String(isKO() ? d.ko : d.en).replace(/[\s,]+/g, '');
  return KAKAO_MAP_DEST + encodeURIComponent(nm) + ',' + d.lat + ',' + d.lng;
}
function kakaoCardHtml(d) {
  if (!d) return '';
  var nm = esc(isKO() ? d.ko : d.en);
  return '<div class="kx">'
    + '<div class="kx-h">' + T('실제 호출로 잇기', 'CONTINUE IN KAKAO') + '</div>'
    + '<div class="kx-row">'
    +   '<a class="kx-b" href="' + KAKAO_T_SCHEME + '" rel="noopener noreferrer" onclick="return openExt(this)">🚕 ' + T('카카오 T 앱 열기', 'Open Kakao T') + '</a>'
    +   '<a class="kx-b alt" href="' + kakaoMapUrl(d.id) + '" rel="noopener noreferrer" onclick="return openExt(this)">🗺 ' + T('카카오맵 길찾기', 'KakaoMap route') + '</a>'
    + '</div>'
    + '<div class="kx-n">'
    +   T('카카오 T는 목적지 자동 입력을 지원하지 않아, 앱에서 <b>' + nm + '</b>을(를) 검색해 호출해야 합니다. 앱이 없으면 <a href="' + KAKAO_T_STORE + '" rel="noopener noreferrer" onclick="return openExt(this)">스토어에서 설치</a>.',
        'Kakao T cannot prefill a destination: search <b>' + nm + '</b> in the app. <a href="' + KAKAO_T_STORE + '" rel="noopener noreferrer" onclick="return openExt(this)">Get the app</a> if missing.')
    + '</div>'
    + '</div>';
}
function openExt(node) {
  var url = (node && node.getAttribute) ? node.getAttribute('href') : '';
  if (!url) return true;
  try {
    if (window.open) {
      var w = window.open(url, '_blank');
      if (w) return false;
    }
  } catch (e) {}
  return true;
}

/* ------------------------------------------------------- 10. 렌더링 */

function renderRider() {
  var cnt = el('cabCount');
  if (cnt) cnt.textContent = String(CABS.length);
  var sh = el('sheet');
  var big = !!state.mapBig;
  var min = !!(state.sheetMin && state.phase === 'idle' && !big);
  if (sh) sh.className = 'sheet ph-' + state.phase + (min ? ' min' : '') + (big ? ' big' : '');
  var bf = el('bigFrom'), bt = el('bigTo');
  var d = destObj();
  if (bf) bf.textContent = T(PICKUP.ko, PICKUP.en);
  if (bt) bt.textContent = (d && state.phase !== 'idle') ? (isKO() ? d.ko : d.en) : T('어디로 갈까요?', 'Where to?');
  var ex = el('mapExpBtn');
  if (ex) {
    ex.className = 'mapexp' + (big ? ' on' : '');
    var ic = el('mapExpIcon');
    if (ic) ic.innerHTML = big
      ? '<svg viewBox="0 0 24 24" fill="none"><path d="M4 9h5V4M20 9h-5V4M20 15h-5v5M4 15h5v5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none"><path d="M9 4H4v5M15 4h5v5M15 20h5v-5M9 20H4v-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  var body = el('sheetBody');
  if (body) body.innerHTML = sheetFor(state.phase);
  renderMapLayers(false);
  renderCabPop();
  if (ride && state.phase === 'matched') {
    var e = el('matchEta');
    if (e) e.textContent = ride.etaLeft > 0 ? (ride.etaLeft + T('분', 'min')) : T('도착', 'Here');
  }
  if (ride && state.phase === 'riding') {
    var bar = el('rideBar');
    if (bar) bar.style.width = Math.round((ride.progress || 0) * 100) + '%';
  }
}

function renderCabPop() {
  var pop = el('cabPop');
  if (!pop) return;
  if (!cabPopId) { pop.hidden = true; pop.innerHTML = ''; return; }
  var c = cabObj(cabPopId);
  pop.hidden = false;
  pop.innerHTML = '<div class="cp-head">'
    + '<div style="width:26px;height:26px;border-radius:8px;background:#FFE812;display:grid;place-items:center">'
    + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3.2 14.6h17.6" stroke="#191919" stroke-width="1.8" stroke-linecap="round"/><path d="M5 14.6c.2-2.2 1.5-3.6 3.4-4.1l2.3-.7c1-.3 2.1-.45 3.3-.45s2.3.15 3.3.45l2.3.7c1.9.5 3.2 1.9 3.4 4.1" stroke="#191919" stroke-width="1.8" stroke-linejoin="round"/></svg>'
    + '</div>'
    + '<div><div class="cp-plate">' + c.plate + '</div><div class="cp-sub">' + c.model + ' · ' + T('실시간 위치', 'live position') + '</div></div>'
    + '<button class="cp-x" onclick="closeCab()">✕</button>'
    + '</div>'
    + '<div class="cp-tags">'
    + '<span class="ctag k">🔋 ' + T('배터리 ', 'battery ') + c.battery + '%</span>'
    + '<span class="ctag">⭐ ' + c.rating.toFixed(2) + '</span>'
    + '<span class="ctag">' + T(c.eta + '분 후 도착', 'in ' + c.eta + ' min') + '</span>'
    + (c.mine ? '<span class="ctag k">' + T('내 차량', 'My car') + '</span>' : '')
    + '</div>'
    + '<div style="font-size:10px;color:#8A8A8A;margin-top:7px">'
    + T('위치 ' + (c.lat ? c.lat.toFixed(5) + ', ' + c.lng.toFixed(5) : '-'), 'at ' + (c.lat ? c.lat.toFixed(5) + ', ' + c.lng.toFixed(5) : '-'))
    + '</div>'
    + (state.phase === 'route'
      ? '<button class="btn-main" style="margin-top:9px;padding:11px;font-size:12.5px" onclick="callFromCab(\'' + c.id + '\')">' + T('이 차량으로 호출', 'Call this car') + '</button>'
      : '');
}

function tapCab(id) {
  cabPopId = (cabPopId === id) ? null : id;
  renderCabPop();
}
function closeCab() { cabPopId = null; renderCabPop(); }

/* ------------------------------------------------------- 11. 동작 */

function setMode(m) {
  state.mode = (m === 'owner') ? 'owner' : 'rider';
  cabPopId = null;
  save();
  renderAll();
  if (state.mode === 'rider' && MAP.ready && MAP.map) {
    setTimeout(function () { try { MAP.map.relayout(); } catch (e) {} if (MAP.sig) { MAP.sig = ''; renderMapLayers(true); } }, 60);
  }
}

function toggleLang() {
  state.lang = isKO() ? 'EN' : 'KO';
  save();
  MAP.sig = '';
  renderAll();
}

function toggleSheet() {
  if (state.phase !== 'idle') return;
  if (state.mapBig) { setMapBig(false); return; }
  state.sheetMin = !state.sheetMin;
  renderRider();
}
function expandSheet() { state.sheetMin = false; renderRider(); }

function setMapBig(v) {
  state.mapBig = (typeof v === 'boolean') ? v : !state.mapBig;
  if (state.mapBig) state.sheetMin = false;
  cabPopId = null;
  save();
  renderRider();
  MAP.sig = '';
  setTimeout(function () { renderMapLayers(true); if (MAP.map) { try { MAP.map.relayout(); } catch (e) {} } }, 60);
  if (state.mapBig) showToast(T('지도를 크게 봅니다 · 다시 누르면 돌아갑니다', 'Map expanded · tap again to shrink'));
  return state.mapBig;
}
function toggleMapBig() { return setMapBig(!state.mapBig); }

function selectDest(id) {
  if (state.phase !== 'idle' && state.phase !== 'route') {
    showToast(T('운행 중에는 목적지를 바꿀 수 없습니다', 'You cannot change the destination during a ride'));
    return;
  }
  var d = destObj(id);
  if (!d) return;
  state.dest = d.id;
  state.custom = null;
  state.phase = 'route';
  state.sheetMin = false;
  cabPopId = null;
  MAP.sig = '';
  save();
  renderAll();
  signal(T(d.ko + '까지 배차 정보를 확인합니다.', 'Showing ride options to ' + d.en));
}

function clearDest() {
  state.dest = null;
  state.custom = null;
  state.phase = 'idle';
  MAP.sig = '';
  save();
  renderAll();
}

function setOption(id) {
  state.option = id;
  save();
  renderRider();
  signal(T(optObj(id).ko + '을 선택했습니다.', 'Selected ' + optObj(id).en));
}

function toggleCoupon() { state.coupon = !state.coupon; save(); renderRider(); }

function openPay() {
  var box = el('payList');
  if (!box) return;
  var html = '';
  for (var i = 0; i < PAYS.length; i++) {
    var p = PAYS[i];
    html += '<div class="payopt' + (p.id === state.pay ? ' on' : '') + '" onclick="selectPay(\'' + p.id + '\')">'
      + '<span class="pb-ic" style="background:' + p.bg + ';color:' + p.fg + '">' + p.ic + '</span>'
      + '<div><div class="pn">' + payLabel(p) + '</div>'
      + '<div class="pd">' + (p.tag ? T('기본 결제 수단', 'default method') : (p.id === 'samsung' ? T('신용카드', 'credit card') : T('간편결제', 'wallet'))) + '</div></div>'
      + '<div class="pc"></div>'
      + '</div>';
  }
  box.innerHTML = html;
  el('payModal').hidden = false;
}
function modalBg(e) { if (e && e.target && e.target.id === 'payModal') el('payModal').hidden = true; }

function selectPay(id) {
  state.pay = id;
  el('payModal').hidden = true;
  save();
  renderRider();
  showToast(T(payObj(id).ko + '로 결제합니다', 'Paying with ' + payObj(id).en));
}

function callFromCab(cabId) {
  if (state.phase !== 'route') return;
  var c = cabObj(cabId);
  var opt = 'standard';
  if (c.id === 'c2') opt = 'direct';
  if (c.id === 'c3') opt = 'xl';
  state.option = opt;
  cabPopId = null;
  if (!state.dest) { showToast(T('먼저 목적지를 선택해 주세요', 'Pick a destination first')); renderRider(); return; }
  renderRider();
  callCab();
}

function callCab() {
  if (state.phase !== 'route') return;
  var d = destObj();
  if (!d) return;
  var o = optObj();
  var car = matchCar(o);
  var fare = fareOf(o, d);
  ride = {
    dest: d, optId: o.id, car: car,
    fare: fare, couponOn: state.coupon,
    pay: payAmount(fare), payId: state.pay,
    etaLeft: car.eta, progress: 0, shared: false
  };
  state.phase = 'searching';
  state.sheetMin = false;
  state.mapBig = false;
  cabPopId = null;
  MAP.sig = '';
  if (!state.metrics) state.metrics = { rides_requested: 0, rides_completed: 0, rider_gross: 0, owner_net: 0 };
  state.metrics.rides_requested = (state.metrics.rides_requested || 0) + 1;
  save();
  renderAll();
  signal(T('사이버캡 호출을 시작했습니다. 주변 차량을 찾는 중입니다.', 'Requested a Cybercab. Searching nearby cars.'));
  clearTimers();
  timers.push(setTimeout(onMatched, 2400));
}

function matchCar(o) {
  var c = cabObj(o.cab);
  if (o.id === 'standard' && !state.driving) c = cabObj('c2');
  var out = clone(c);
  var live = cabObj(c.id);
  out.lat = live.lat; out.lng = live.lng;
  return out;
}

function onMatched() {
  if (!ride || state.phase !== 'searching') return;
  clearTimers();
  state.phase = 'matched';
  MAP.sig = '';
  ride.etaLeft = ride.car.eta;
  save();
  renderAll();
  signal(T('배차가 완료되었습니다. ' + ride.car.plate + ' 차량이 ' + ride.car.eta + '분 후 도착합니다.',
    'Matched. ' + ride.car.plate + ' arrives in ' + ride.car.eta + ' min.'));
  timers.push(setInterval(function () {
    if (!ride || state.phase !== 'matched') return;
    if (ride.etaLeft > 0) ride.etaLeft = ride.etaLeft - 1;
    var e = el('matchEta');
    if (e) e.textContent = ride.etaLeft > 0 ? (ride.etaLeft + T('분', 'min')) : T('도착', 'Here');
    var st = el('matchState');
    if (st && ride.etaLeft <= 0) st.textContent = T('차량이 승차 지점에 도착했습니다 · 문을 열어 주세요', 'Your car is at the pickup point · open the door');
  }, 2400));
}

function shareRoute() {
  if (!ride) return;
  ride.shared = true;
  renderRider();
  showToast(T('가족에게 안심 경로를 공유했습니다', 'Route shared with your family'));
  signal(T('안심 경로 공유를 켰습니다. 보호자에게 실시간 위치가 전송됩니다.', 'Safe-route sharing is on. Live location is sent to your guardian.'));
}

function openDoor() {
  if (!ride || state.phase !== 'matched') return;
  clearTimers();
  state.phase = 'riding';
  ride.progress = 0;
  MAP.sig = '';
  save();
  renderAll();
  signal(T('도어 잠금을 해제했습니다. 탑승 후 목적지로 출발합니다.', 'Door unlocked. Departing to your destination.'));
  var ticks = 0, total = 10;
  timers.push(setInterval(function () {
    if (!ride || state.phase !== 'riding') return;
    ticks++;
    var p = Math.min(1, ticks / total);
    ride.progress = p;
    var bar = el('rideBar');
    if (bar) bar.style.width = Math.round(2 + p * 98) + '%';
    var eta = el('rideEta');
    if (eta) eta.textContent = Math.max(0, Math.ceil(ride.dest.min * (1 - p))) + T('분', 'min');
    var km = el('rideKm');
    if (km) km.textContent = Math.max(0, ride.dest.km * (1 - p)).toFixed(1) + 'km';
    var spd = el('rideSpd');
    if (spd) spd.textContent = (34 + Math.round(Math.random() * 14)) + 'km/h';
    updateDot();
    if (p >= 1) { clearTimers(); arrive(); }
  }, 650));
}

function arrive() {
  if (!ride) return;
  clearTimers();
  state.phase = 'done';
  ride.time = nowClock();
  var fee = Math.round(ride.pay * FEE_RATE);
  var net = ride.pay - fee;
  if (!state.metrics) state.metrics = { rides_requested: 0, rides_completed: 0, rider_gross: 0, owner_net: 0 };
  state.metrics.rides_completed = (state.metrics.rides_completed || 0) + 1;
  state.metrics.rider_gross = (state.metrics.rider_gross || 0) + ride.pay;
  if (ride.car.mine) {
    var trips = state.trips || [];
    for (var i = 0; i < trips.length; i++) delete trips[i].fresh;
    trips.push({ time: ride.time, to: ride.dest.id, name: ride.dest.id === 'custom' ? ride.dest.ko : null, fare: ride.pay, fresh: true });
    state.trips = trips;
    state.battery = Math.max(12, state.battery - 2);
    state.metrics.owner_net = (state.metrics.owner_net || 0) + net;
  }
  MAP.sig = '';
  save();
  renderAll();
  signal(T('목적지에 도착해 ' + wonShort(ride.pay) + '이 자동 결제되었습니다.',
    'Arrived. ' + wonShort(ride.pay) + ' was charged automatically.'));
}

function finishRide() {
  clearTimers();
  ride = null;
  state.phase = 'idle';
  state.dest = null;
  state.custom = null;
  MAP.sig = '';
  save();
  renderAll();
  showToast(T('이용해 주셔서 감사합니다', 'Thanks for riding with us'));
}

function cancelRide() {
  clearTimers();
  var had = ride;
  ride = null;
  state.phase = state.dest ? 'route' : 'idle';
  MAP.sig = '';
  save();
  renderAll();
  if (had) signal(T('호출을 취소했습니다.', 'The ride was cancelled.'));
}

/* ------------------------------------------------------ 12. 차주 화면 */

function renderOwner() {
  var s = state;
  var pill = el('drivePill');
  if (pill) {
    if (s.battery <= s.minBattery) { pill.className = 'opill warn'; pill.textContent = T('충전 복귀 중', 'RETURNING'); }
    else if (s.driving) { pill.className = 'opill on'; pill.textContent = T('수익 운행 ON', 'EARNING ON'); }
    else { pill.className = 'opill off'; pill.textContent = T('수익 운행 OFF', 'EARNING OFF'); }
  }
  var ds = el('driveSwitch'); if (ds) ds.className = 'sw' + (s.driving ? ' on' : '');
  var rs = el('returnSwitch'); if (rs) rs.className = 'sw' + (s.autoReturn ? ' on' : '');

  var arc = el('batteryArc');
  if (arc) {
    var C = 2 * Math.PI * 18;
    arc.setAttribute('stroke-dasharray', C.toFixed(1));
    arc.setAttribute('stroke-dashoffset', (C * (1 - s.battery / 100)).toFixed(1));
    arc.setAttribute('stroke', s.battery <= s.minBattery ? '#FFB443' : '#22E2A6');
  }
  var bt = el('batteryTxt'); if (bt) bt.textContent = s.battery + '%';

  var mb = el('minBattery'); if (mb) mb.value = s.minBattery;
  var mbv = el('minBatteryVal'); if (mbv) mbv.textContent = s.minBattery + '%';
  var mbh = el('minBatteryHint');
  if (mbh) mbh.innerHTML = T(
    '배터리가 <b>' + s.minBattery + '%</b> 이하로 떨어지면 가장 가까운 슈퍼차저로 자동 복귀하고, 충전 후 다시 배차를 받습니다.',
    'Below <b>' + s.minBattery + '%</b> it drives to the nearest Supercharger and re-joins dispatch once charged.');

  var rd = el('radius'); if (rd) rd.value = s.radius;
  var rdv = el('radiusVal'); if (rdv) rdv.textContent = s.radius + 'km';
  var rdh = el('radiusHint');
  if (rdh) rdh.innerHTML = T(
    '정관읍 기준 반경 ' + s.radius + 'km · 이 밖의 호출은 받지 않습니다.' + (s.radius >= 35 ? ' <b>김해공항까지 커버</b>' : ''),
    s.radius + 'km radius from Jeonggwan · calls outside are declined.' + (s.radius >= 35 ? ' <b>Airport covered</b>' : ''));

  renderSlots();
  renderDashboard();
  renderLive();
}

function renderSlots() {
  var box = el('slotList');
  if (!box) return;
  var html = '';
  for (var i = 0; i < state.slots.length; i++) {
    var sl = state.slots[i];
    var lab = SLOT_LABEL[sl.id] ? (isKO() ? SLOT_LABEL[sl.id].ko : SLOT_LABEL[sl.id].en) : sl.id;
    html += '<div class="slot' + (sl.on ? '' : ' off') + '">'
      + '<div class="sname">' + lab + '</div>'
      + '<input class="tin" type="time" value="' + sl.start + '" onchange="setSlotTime(' + i + ',\'start\',this.value)">'
      + '<span class="tilde">~</span>'
      + '<input class="tin" type="time" value="' + sl.end + '" onchange="setSlotTime(' + i + ',\'end\',this.value)">'
      + '<div class="sw' + (sl.on ? ' on' : '') + '" onclick="toggleSlot(' + i + ')"></div>'
      + '</div>';
  }
  box.innerHTML = html;
}

function tripName(t) {
  if (t.name) return t.name;
  var d = destObj(t.to);
  return d ? (isKO() ? d.ko : d.en) : t.to;
}

function renderDashboard() {
  var trips = state.trips || [];
  var gross = 0;
  for (var i = 0; i < trips.length; i++) gross += trips[i].fare;
  var fee = Math.round(gross * FEE_RATE), net = gross - fee;

  var dn = el('dNet'); if (dn) dn.textContent = won(net);
  var dg = el('dGross'); if (dg) dg.textContent = won(gross);
  var df = el('dFee'); if (df) df.textContent = '-' + won(fee);
  var dt = el('dTrips'); if (dt) dt.textContent = T(trips.length + '건', trips.length + ' trips');
  var dm = el('dMonth');
  if (dm) dm.textContent = T(
    '월 20일 운행 기준 약 ' + won(net * 20) + ' · 건당 평균 ' + won(trips.length ? gross / trips.length : 0),
    'About ' + won(net * 20) + ' per month (20 days) · avg ' + won(trips.length ? gross / trips.length : 0));

  var list = el('tripList');
  if (!list) return;
  if (!trips.length) { list.innerHTML = '<div class="oempty">' + T('오늘 운행 기록이 없습니다.', 'No trips today.') + '</div>'; return; }
  var html = '';
  for (var j = trips.length - 1; j >= 0; j--) {
    var t = trips[j];
    html += '<div class="otrip">'
      + '<div class="tt">' + t.time + '</div>'
      + '<div class="tr">' + T('중앙공원', 'Jungang Park') + ' → ' + esc(tripName(t)) + (t.fresh ? '<span class="onew">NEW</span>' : '') + '</div>'
      + '<div class="tf">' + wonShort(t.fare) + '</div>'
      + '</div>';
  }
  list.innerHTML = html;
}

function renderLive() {
  var s = state;
  var dot = el('liveDot'), main = el('liveMain'), sub = el('liveSub');
  if (!main || !sub) return;
  var calls = Math.max(1, Math.round(s.radius / 2.5));
  if (!s.driving) {
    if (dot) dot.className = 'pdot off';
    main.textContent = T('운행 꺼짐 · 집에 대기 중', 'Off · parked at home');
    sub.textContent = T('수익 운행을 켜면 스케줄 시간대에 자동으로 시작됩니다.', 'Turn on earning mode and it starts automatically at the next slot.');
  } else if (s.battery <= s.minBattery) {
    if (dot) dot.className = 'pdot off';
    main.textContent = T('슈퍼차저로 복귀 중', 'Returning to Supercharger');
    sub.textContent = T('배터리 ' + s.battery + '% · 복귀 기준 ' + s.minBattery + '% · 충전 후 자동 재배차', 'Battery ' + s.battery + '% · threshold ' + s.minBattery + '%');
  } else {
    if (dot) dot.className = 'pdot';
    main.textContent = T('운행 중 · 호출 대기', 'Active · waiting for a call');
    sub.textContent = T(
      '반경 ' + s.radius + 'km 내 호출 ' + calls + '건 · 평균 대기 2분 · 배터리 ' + s.battery + '%',
      calls + ' calls within ' + s.radius + 'km · avg wait 2 min · battery ' + s.battery + '%');
  }
}

function toggleDispatch() {
  state.driving = !state.driving;
  save(); renderOwner();
  signal(state.driving ? T('차주가 수익 운행을 켰습니다.', 'Earning mode on.') : T('차주가 수익 운행을 껐습니다.', 'Earning mode off.'));
}
function toggleReturn() { state.autoReturn = !state.autoReturn; save(); renderOwner(); }
function toggleSlot(i) { state.slots[i].on = !state.slots[i].on; save(); renderOwner(); }
function setSlotTime(i, key, val) { state.slots[i][key] = val; save(); }
function setMinBattery(v) { state.minBattery = parseInt(v, 10) || 20; save(); renderOwner(); }
function setRadius(v) { state.radius = parseInt(v, 10) || 15; save(); renderOwner(); }

/* ------------------------------------------------------ 13. 렌더 전체 */

function renderAll() {
  document.body.className = 'mode-' + state.mode;
  var rv = el('riderView'); if (rv) rv.hidden = state.mode !== 'rider';
  var ov = el('ownerView'); if (ov) ov.hidden = state.mode !== 'owner';
  var tabs = document.querySelectorAll('.mtab');
  for (var i = 0; i < tabs.length; i++) {
    var on = tabs[i].getAttribute('data-mode') === state.mode;
    tabs[i].className = 'mtab' + (on ? ' on' : '');
  }
  renderLang();
  if (state.mode === 'rider') renderRider(); else renderOwner();
}

function renderLang() {
  var nodes = document.querySelectorAll('[data-ko]');
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    n.textContent = isKO() ? n.getAttribute('data-ko') : n.getAttribute('data-en');
  }
  var lb = el('langBtn');
  if (lb) lb.textContent = isKO() ? 'KO' : 'EN';
  var pn = el('pickupName');
  if (pn) pn.textContent = T(PICKUP.ko, PICKUP.en);
  var mt = el('mapTypeLabel');
  if (mt) mt.textContent = state.mapType === 'skyview' ? T('일반지도', 'Road map') : T('스카이뷰', 'Skyview');
  try { document.documentElement.lang = isKO() ? 'ko' : 'en'; } catch (e) {}
}

/* ------------------------------------------------------- 14. 초기화 */

function resetAll() {
  clearTimers();
  ride = null;
  cabPopId = null;
  state = clone(DEFAULT_STATE);
  MAP.sig = '';
  save();
  renderAll();
  showToast(T('처음 상태로 되돌렸습니다', 'Reset to the first screen'));
}

/* 다른 화면(위젯 호스트·키오스크 스크립트)에서 조작할 수 있는 명령 */
if (window.pickle && window.pickle.widget) {
  window.pickle.widget.oncommand = function (cmd) {
    var parts = String(cmd || '').trim().split(/\s+/);
    var a = parts[0], b = parts[1];
    if (a === 'mode') setMode(b === 'owner' ? 'owner' : 'rider');
    else if (a === 'dest' || a === 'where') {
      if (!b) clearDest();
      else {
        var d = destObj(b);
        if (!d) { var idx = parseInt(b, 10); d = (idx >= 1 && idx <= DESTS.length) ? DESTS[idx - 1] : null; }
        if (d) { setMode('rider'); selectDest(d.id); }
      }
    } else if (a === 'option' || a === 'car') {
      if (b === 'standard' || b === 'direct' || b === 'xl') setOption(b);
    } else if (a === 'pay') {
      for (var i = 0; i < PAYS.length; i++) { if (PAYS[i].id === b) selectPay(b); }
    } else if (a === 'call') {
      if (!state.dest) { showToast(T('먼저 목적지를 선택해 주세요', 'Pick a destination first')); return; }
      setMode('rider'); callCab();
    } else if (a === 'door') { if (state.phase === 'matched') openDoor(); }
    else if (a === 'ride') {
      var dd = b ? destObj(b) : null;
      if (!dd && b) { var ix = parseInt(b, 10); dd = (ix >= 1 && ix <= DESTS.length) ? DESTS[ix - 1] : null; }
      if (!dd) { showToast(T('목적지를 함께 지정해 주세요 (예: ride centum)', 'Add a destination (e.g. ride centum)')); return; }
      setMode('rider'); state.dest = dd.id; state.phase = 'route'; MAP.sig = ''; renderAll(); callCab();
    } else if (a === 'dispatch') {
      if (b === 'on') state.driving = true; else if (b === 'off') state.driving = false; else state.driving = !state.driving;
      save(); renderAll();
    } else if (a === 'zoom') {
      if (!b || b === 'in' || b === '+' || b === 'up') zoomIn();
      else if (b === 'out' || b === '-' || b === 'down') zoomOut();
      else if (b === 'reset' || b === 'fit' || b === 'default') recenter();
      else setZoom(b);
    } else if (a === 'map') {
      if (b === 'big' || b === 'large' || b === 'expand' || b === 'on') setMapBig(true);
      else if (b === 'small' || b === 'shrink' || b === 'collapse' || b === 'off') setMapBig(false);
      else setMapBig(!state.mapBig);
    } else if (a === 'sky' || a === 'satellite') setMapType('skyview');
    else if (a === 'road') setMapType('roadmap');
    else if (a === 'reset') resetAll();
  };
}

function boot() {
  try {
    var raw = localStorage.getItem('cybercab-share:v1');
    if (raw) {
      var st = JSON.parse(raw);
      for (var k in st) { if (Object.prototype.hasOwnProperty.call(st, k)) state[k] = st[k]; }
    }
  } catch (e) {}
  if (!state.slots || !state.slots.length) state.slots = clone(DEFAULT_STATE.slots);
  if (!state.trips) state.trips = clone(DEFAULT_STATE.trips);
  if (!state.metrics) state.metrics = clone(DEFAULT_STATE.metrics);
  state.mode = 'rider';
  state.sheetMin = false;
  state.mapBig = false;
  if (state.dest && !destObj(state.dest)) { state.dest = null; state.custom = null; }
  state.phase = state.dest ? 'route' : 'idle';
  var cv = el('carVisual');
  if (cv) cv.innerHTML = carBodySvg();
  renderAll();
  bootMap();
}

boot();
