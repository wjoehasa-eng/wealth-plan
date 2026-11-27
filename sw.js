/* 입주 자금관리 — 서비스 워커 v4.7.5
 * 앱 껍데기(index.html, 아이콘)만 캐시합니다. 데이터는 localStorage/구글 시트에 있습니다.
 * 새 버전은 즉시 활성화(skipWaiting + clients.claim)되어 폰·PC가 바로 새 코드를 받습니다.
 * v4.7.5: 토스 스타일 화면을 기본 주소(/)로 승격하면서 미리보기 /toss/ 폴더를 없앴습니다.
 *   - 프리캐시 목록은 루트 파일만 남겼습니다.
 *   - 화면(document) 응답은 '요청한 그 주소'로만 캐시합니다. 그래야 예전에 /toss/를 열어 둔
 *     기기가 오프라인일 때 엉뚱한 화면이 루트 자리에 열리지 않습니다.
 */
const CACHE = 'wealth-plan-v4-7-9';
const SCOPE = new URL('./', self.location).pathname;      /* 예: /wealth-plan/ */
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL).catch(() => c.addAll(['./', './index.html'])))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting' || (e.data && e.data.type === 'skipWaiting')) self.skipWaiting();
});

function isRootShell(pathname) {
  return pathname === SCOPE || pathname === SCOPE + 'index.html';
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // 저장(POST)은 서비스 워커를 거치지 않습니다.
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== location.origin) return;       // 구글 시트 등 외부 요청은 그대로 통과

  // 화면(문서)은 항상 네트워크 최신 → 실패할 때만 캐시로 연다. (HTTP 캐시도 우회)
  if (req.mode === 'navigate') {
    const root = isRootShell(url.pathname);
    e.respondWith(
      fetch(new Request(req.url, { cache: 'reload', credentials: 'same-origin' }))
        .then((res) => {
          const copy = res.clone();
          // 루트 화면만 index.html 자리에 넣고, 다른 주소는 그 주소 그대로 보관한다.
          const key = root ? SCOPE + 'index.html' : req;
          caches.open(CACHE).then((c) => c.put(key, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((hit) => {
          if (hit) return hit;
          if (!root) return caches.match(SCOPE + 'index.html');
          return caches.match(SCOPE + 'index.html').then((h) => h || caches.match(SCOPE));
        }))
    );
    return;
  }

  // 코드·매니페스트는 네트워크 우선(빠른 반영), 아이콘 등은 캐시 우선
  const isCode = /\.(html|js|webmanifest|json)$/i.test(url.pathname);
  if (isCode) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
      return res;
    }).catch(() => hit))
  );
});
