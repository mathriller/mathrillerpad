/**
 * ════════════════════════════════════════════════════════════════════
 *  MathrillerPad — Google Sheets DB 백엔드 (Google Apps Script)
 * ════════════════════════════════════════════════════════════════════
 *
 *  [설치 방법]
 *   1. 새 구글 스프레드시트를 만들고  확장 프로그램 → Apps Script 를 엽니다.
 *   2. 기본 Code.gs 내용을 모두 지우고 이 파일 전체를 붙여넣고 저장합니다.
 *   3. 상단 함수 선택 드롭다운에서  setup  을 선택 후 ▶ 실행
 *      → 권한 승인(스프레드시트 / 드라이브 / 외부 URL 접근) 후
 *        Boards, Sections, Posts 3개 탭과 이미지 저장용 드라이브 폴더가 자동 생성됩니다.
 *   4. 배포 → 새 배포 → 유형: "웹 앱"
 *        - 다음 사용자 인증 정보로 실행: "나"
 *        - 액세스 권한이 있는 사용자: "모든 사용자"
 *      → 발급된 웹 앱 URL(…/exec)을 프론트엔드 .env 의 VITE_GAS_URL 에 넣습니다.
 *   5. 코드를 수정했다면  배포 → 배포 관리 → 편집(연필) → 버전: "새 버전"  으로 재배포해야 반영됩니다.
 *
 *  [관리자 비밀번호 변경]
 *   - 가장 간단한 방법: 아래 DEFAULT_ADMIN_PASSWORD 값을 수정 후 재배포
 *   - 권장 방법(코드 노출 X): 프로젝트 설정(⚙) → 스크립트 속성 → ADMIN_PASSWORD 추가
 *     (스크립트 속성이 존재하면 코드의 기본값보다 우선합니다)
 *
 *  [DB 구조]
 *   Boards   : id | title | description | adminHash | createdAt | deleted
 *   Sections : id | boardId | title | order | createdAt | deleted
 *   Posts    : id | boardId | sectionId | title | author | content | imageUrl
 *              | imageKind | sourceUrl | linkUrl | createdAt | deleted
 *   - 삭제는 deleted 플래그(TRUE) 방식의 "소프트 삭제"입니다. (실수로 지워도 시트에서 복구 가능)
 *   - 이미지는 셀 용량 제한(5만 자) 때문에 구글 드라이브 폴더에 파일로 저장하고 URL만 시트에 기록합니다.
 * ════════════════════════════════════════════════════════════════════
 */

// ───────────────────────── 설정 ─────────────────────────
/** 🔑 초기 마스터 비밀번호 (스크립트 속성 ADMIN_PASSWORD 가 있으면 그 값이 우선) */
var DEFAULT_ADMIN_PASSWORD = 'admin1234';

/** 업로드/마이그레이션 이미지가 저장될 드라이브 폴더 이름 */
var IMAGE_FOLDER_NAME = 'MathrillerPad_Images';

/** 마이그레이션 시 다운로드 허용 최대 크기 (바이트) */
var MAX_FETCH_BYTES = 15 * 1024 * 1024;

var SCHEMA = {
  Boards: ['id', 'title', 'description', 'adminHash', 'createdAt', 'deleted'],
  Sections: ['id', 'boardId', 'title', 'order', 'createdAt', 'deleted'],
  Posts: ['id', 'boardId', 'sectionId', 'title', 'author', 'content', 'imageUrl',
          'imageKind', 'sourceUrl', 'linkUrl', 'createdAt', 'deleted'],
};

// ───────────────────────── 진입점 ─────────────────────────
function doGet(e) {
  return handle_((e && e.parameter) || {});
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: '잘못된 JSON 요청입니다.' });
  }
  return handle_(body);
}

/** 최초 1회 수동 실행: 시트/폴더 생성 + 권한 승인 */
function setup() {
  ensureSheets_();
  getImageFolder_();
  // 외부 URL 권한 승인을 위해 한 번 호출
  try { UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true }); } catch (e) {}
  Logger.log('✅ 설정 완료! 이제 "웹 앱"으로 배포하세요.');
}

// ───────────────────────── 라우터 ─────────────────────────
var READ_ACTIONS = { ping: 1, listBoards: 1, getBoard: 1 };

function handle_(p) {
  var action = p.action || 'ping';
  var lock = null;
  try {
    ensureSheets_();
    if (!READ_ACTIONS[action]) {
      lock = LockService.getScriptLock();
      lock.waitLock(30000);
    }
    var data;
    switch (action) {
      case 'ping':          data = { pong: true, time: Date.now() }; break;
      case 'listBoards':    data = listBoards_(); break;
      case 'getBoard':      data = getBoard_(p.boardId); break;
      case 'createBoard':   data = createBoard_(p); break;
      case 'createSection': data = createSection_(p); break;
      case 'createPost':    data = createPost_(p); break;
      case 'importPosts':   data = importPosts_(p); break;
      case 'verifyAdmin':   data = { valid: isAdmin_(p.boardId, p.password) }; break;
      case 'deletePost':    data = deletePost_(p); break;
      case 'deleteSection': data = deleteSection_(p); break;
      case 'deleteBoard':   data = deleteBoard_(p); break;
      default: throw new Error('알 수 없는 action: ' + action);
    }
    return json_({ ok: true, data: data });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    if (lock) { try { lock.releaseLock(); } catch (e) {} }
  }
}

// ───────────────────────── Boards ─────────────────────────
function listBoards_() {
  var boards = readTable_('Boards').filter(notDeleted_);
  var sections = readTable_('Sections').filter(notDeleted_);
  var posts = readTable_('Posts').filter(notDeleted_);
  return boards
    .map(function (b) {
      return publicBoard_(b, {
        sectionCount: sections.filter(function (s) { return s.boardId === b.id; }).length,
        postCount: posts.filter(function (x) { return x.boardId === b.id; }).length,
      });
    })
    .sort(function (a, b) { return b.createdAt - a.createdAt; });
}

function getBoard_(boardId) {
  if (!boardId) throw new Error('boardId가 필요합니다.');
  var board = findBoard_(boardId);
  if (!board) throw new Error('존재하지 않거나 삭제된 보드입니다.');
  var sections = readTable_('Sections')
    .filter(function (s) { return s.boardId === boardId && notDeleted_(s); })
    .sort(function (a, b) { return (a.order - b.order) || (a.createdAt - b.createdAt); });
  var posts = readTable_('Posts')
    .filter(function (x) { return x.boardId === boardId && notDeleted_(x); })
    .sort(function (a, b) { return a.createdAt - b.createdAt; })
    .map(publicPost_);
  return {
    board: publicBoard_(board),
    sections: sections.map(function (s) {
      return { id: s.id, boardId: s.boardId, title: str_(s.title), order: Number(s.order) || 0, createdAt: Number(s.createdAt) || 0 };
    }),
    posts: posts,
  };
}

function createBoard_(p) {
  assertMasterAdmin_(p.password || p.masterPassword);
  var title = clip_(p.title, 200);
  if (!title) throw new Error('보드 제목을 입력하세요.');
  var board = {
    id: genId_('b'),
    title: title,
    description: clip_(p.description, 2000),
    adminHash: p.adminPassword ? sha256_(String(p.adminPassword)) : '',
    createdAt: Date.now(),
    deleted: false,
  };
  appendRows_('Boards', [board]);
  // 기본 섹션 하나 생성
  appendRows_('Sections', [{ id: genId_('s'), boardId: board.id, title: '첫 번째 섹션', order: 0, createdAt: Date.now(), deleted: false }]);
  return publicBoard_(board);
}

function deleteBoard_(p) {
  // 보드 삭제는 마스터 비밀번호만 허용
  if (String(p.password || '') !== getMasterPassword_()) throw new Error('마스터 관리자 권한이 필요합니다.');
  if (!markDeleted_('Boards', p.boardId)) throw new Error('보드를 찾을 수 없습니다.');
  return { boardId: p.boardId };
}

// ───────────────────────── Sections ─────────────────────────
function createSection_(p) {
  requireBoard_(p.boardId);
  var title = clip_(p.title, 200);
  if (!title) throw new Error('섹션 이름을 입력하세요.');
  var existing = readTable_('Sections').filter(function (s) { return s.boardId === p.boardId; });
  var maxOrder = existing.reduce(function (m, s) { return Math.max(m, Number(s.order) || 0); }, -1);
  var section = { id: genId_('s'), boardId: p.boardId, title: title, order: maxOrder + 1, createdAt: Date.now(), deleted: false };
  appendRows_('Sections', [section]);
  return section;
}

function deleteSection_(p) {
  assertAdmin_(p.boardId, p.password);
  if (!markDeleted_('Sections', p.sectionId, p.boardId)) throw new Error('섹션을 찾을 수 없습니다.');
  // 섹션에 속한 게시물도 함께 소프트 삭제
  markDeletedWhere_('Posts', function (row) { return row.sectionId === p.sectionId && row.boardId === p.boardId; });
  return { sectionId: p.sectionId };
}

// ───────────────────────── Posts ─────────────────────────
function createPost_(p) {
  requireBoard_(p.boardId);
  requireSection_(p.boardId, p.sectionId);
  var content = clip_(p.content, 20000);
  var title = clip_(p.title, 300);
  var imageUrl = '', imageKind = '';
  if (p.image && p.image.base64) {
    imageUrl = saveBase64Image_(p.image.base64, p.image.mimeType, p.image.kind || 'upload');
    imageKind = p.image.kind === 'drawing' ? 'drawing' : 'upload';
  }
  if (!content && !title && !imageUrl) throw new Error('내용 또는 이미지를 입력하세요.');
  var post = {
    id: genId_('p'),
    boardId: p.boardId,
    sectionId: p.sectionId,
    title: title,
    author: clip_(p.author, 100) || '익명',
    content: content,
    imageUrl: imageUrl,
    imageKind: imageKind,
    sourceUrl: '',
    linkUrl: clip_(p.linkUrl, 2000),
    createdAt: Date.now(),
    deleted: false,
  };
  appendRows_('Posts', [post]);
  return publicPost_(post);
}

function deletePost_(p) {
  assertAdmin_(p.boardId, p.password);
  if (!markDeleted_('Posts', p.postId, p.boardId)) throw new Error('게시물을 찾을 수 없습니다.');
  return { postId: p.postId };
}

/**
 * 패들렛 CSV 마이그레이션 (프론트엔드에서 10건 내외로 나눠서 호출)
 *  p.posts = [{ sectionTitle, title, author, content, attachmentUrl, createdAt }]
 *  - attachmentUrl 은 브라우저가 아닌 서버(GAS)에서 UrlFetchApp 으로 다운로드 → CORS 문제 없음
 *  - 이미지면 드라이브에 영구 저장, 이미지가 아니면 링크(linkUrl)로 보존
 */
function importPosts_(p) {
  requireBoard_(p.boardId);
  var items = Array.isArray(p.posts) ? p.posts.slice(0, 50) : [];
  if (!items.length) return { imported: 0, results: [] };

  // 1) 섹션 이름 → ID 매핑 (없으면 생성)
  var sections = readTable_('Sections').filter(function (s) { return s.boardId === p.boardId && notDeleted_(s); });
  var byTitle = {};
  sections.forEach(function (s) { byTitle[str_(s.title)] = s.id; });
  var maxOrder = sections.reduce(function (m, s) { return Math.max(m, Number(s.order) || 0); }, -1);
  var newSections = [];
  items.forEach(function (it) {
    var t = clip_(it.sectionTitle, 200) || '가져온 게시물';
    if (!byTitle[t]) {
      var s = { id: genId_('s'), boardId: p.boardId, title: t, order: ++maxOrder, createdAt: Date.now(), deleted: false };
      byTitle[t] = s.id;
      newSections.push(s);
    }
  });
  if (newSections.length) appendRows_('Sections', newSections);

  // 2) 첨부 URL 병렬 다운로드
  var fetchIdx = [], requests = [];
  items.forEach(function (it, i) {
    var url = String(it.attachmentUrl || '').trim();
    if (/^https?:\/\//i.test(url)) {
      fetchIdx.push(i);
      requests.push({ url: url, muteHttpExceptions: true, followRedirects: true });
    }
  });
  var responses = [];
  if (requests.length) {
    try {
      responses = UrlFetchApp.fetchAll(requests);
    } catch (err) {
      // fetchAll 전체 실패 시 개별 재시도
      responses = requests.map(function (r) {
        try { return UrlFetchApp.fetch(r.url, r); } catch (e) { return null; }
      });
    }
  }
  var fetched = {};
  fetchIdx.forEach(function (itemIdx, k) { fetched[itemIdx] = responses[k]; });

  // 3) 행 생성
  var results = [];
  var rows = items.map(function (it, i) {
    var url = String(it.attachmentUrl || '').trim();
    var imageUrl = '', linkUrl = '', status = 'text';
    var res = fetched[i];
    if (res) {
      try {
        var code = res.getResponseCode();
        var blob = res.getBlob();
        var type = String(blob.getContentType() || '').toLowerCase();
        if (code >= 200 && code < 300 && type.indexOf('image/') === 0 && blob.getBytes().length <= MAX_FETCH_BYTES) {
          imageUrl = saveBlobImage_(blob, 'padlet');
          status = 'image';
        } else {
          linkUrl = url; status = 'link';
        }
      } catch (e) {
        linkUrl = url; status = 'link';
      }
    } else if (url) {
      linkUrl = url; status = 'link';
    }
    var created = Number(new Date(it.createdAt)) || Date.now();
    results.push({ index: i, status: status });
    return {
      id: genId_('p'),
      boardId: p.boardId,
      sectionId: byTitle[clip_(it.sectionTitle, 200) || '가져온 게시물'],
      title: clip_(it.title, 300),
      author: clip_(it.author, 100) || '익명',
      content: clip_(it.content, 20000),
      imageUrl: imageUrl,
      imageKind: imageUrl ? 'migrated' : '',
      sourceUrl: url,
      linkUrl: linkUrl,
      createdAt: created,
      deleted: false,
    };
  });
  appendRows_('Posts', rows);
  return { imported: rows.length, results: results, newSections: newSections.length };
}

// ───────────────────────── 이미지 저장 (Google Drive) ─────────────────────────
function getImageFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('IMAGE_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) {}
  }
  var folder = DriveApp.createFolder(IMAGE_FOLDER_NAME);
  props.setProperty('IMAGE_FOLDER_ID', folder.getId());
  return folder;
}

function saveBase64Image_(base64, mimeType, prefix) {
  var raw = String(base64);
  var m = raw.match(/^data:([^;]+);base64,(.*)$/);
  if (m) { mimeType = m[1]; raw = m[2]; }
  mimeType = mimeType || 'image/png';
  if (mimeType.indexOf('image/') !== 0) throw new Error('이미지 파일만 업로드할 수 있습니다.');
  var bytes = Utilities.base64Decode(raw);
  var blob = Utilities.newBlob(bytes, mimeType);
  return saveBlobImage_(blob, prefix);
}

function saveBlobImage_(blob, prefix) {
  var type = blob.getContentType() || 'image/png';
  var ext = (type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '');
  blob.setName((prefix || 'img') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) + '.' + ext);
  var file = getImageFolder_().createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    // 학교/회사 Workspace 정책상 외부 공유가 막혀 있으면 같은 도메인 사용자만 볼 수 있습니다.
    try { file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); } catch (e2) {}
  }
  // <img> 태그에서 바로 표시 가능한 썸네일 URL
  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1600';
}

// ───────────────────────── 관리자 인증 ─────────────────────────
function getMasterPassword_() {
  var v = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  return v ? String(v) : DEFAULT_ADMIN_PASSWORD;
}

/** 마스터 비밀번호 또는 보드 생성 시 지정한 보드 전용 비밀번호 */
function isAdmin_(boardId, password) {
  password = String(password || '');
  if (!password) return false;
  if (password === getMasterPassword_()) return true;
  if (!boardId) return false;
  var board = findBoard_(boardId);
  return !!(board && board.adminHash && board.adminHash === sha256_(password));
}

function assertAdmin_(boardId, password) {
  if (!isAdmin_(boardId, password)) throw new Error('관리자 권한이 없습니다. 다시 로그인하세요.');
}

function assertMasterAdmin_(password) {
  if (String(password || '') !== getMasterPassword_()) {
    throw new Error('마스터 관리자 권한이 필요합니다.');
  }
}

// ───────────────────────── 시트 유틸 ─────────────────────────
function ensureSheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SCHEMA).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, SCHEMA[name].length).setValues([SCHEMA[name]]).setFontWeight('bold').setBackground('#e8eaf6');
      sh.setFrozenRows(1);
    }
  });
  var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('시트1');
  if (def && ss.getSheets().length > 3 && def.getLastRow() === 0) ss.deleteSheet(def);
}

function sheet_(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function readTable_(name) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var cols = SCHEMA[name];
  var values = sh.getRange(2, 1, last - 1, cols.length).getValues();
  return values.map(function (r, i) {
    var o = { _row: i + 2 };
    cols.forEach(function (c, j) { o[c] = r[j] instanceof Date ? r[j].getTime() : r[j]; });
    o.id = str_(o.id);
    if ('boardId' in o) o.boardId = str_(o.boardId);
    if ('sectionId' in o) o.sectionId = str_(o.sectionId);
    o.createdAt = Number(o.createdAt) || 0;
    return o;
  }).filter(function (o) { return o.id; });
}

function appendRows_(name, objects) {
  if (!objects.length) return;
  var sh = sheet_(name);
  var cols = SCHEMA[name];
  var rows = objects.map(function (o) { return cols.map(function (c) { return toCell_(o[c]); }); });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, cols.length).setValues(rows);
}

function markDeleted_(name, id, boardId) {
  if (!id) return false;
  var row = readTable_(name).filter(function (r) {
    return r.id === String(id) && (!boardId || name === 'Boards' || r.boardId === String(boardId));
  })[0];
  if (!row) return false;
  sheet_(name).getRange(row._row, SCHEMA[name].indexOf('deleted') + 1).setValue(true);
  return true;
}

function markDeletedWhere_(name, predicate) {
  var sh = sheet_(name);
  var col = SCHEMA[name].indexOf('deleted') + 1;
  readTable_(name).forEach(function (r) {
    if (notDeleted_(r) && predicate(r)) sh.getRange(r._row, col).setValue(true);
  });
}

// ───────────────────────── 기타 헬퍼 ─────────────────────────
function findBoard_(boardId) {
  return readTable_('Boards').filter(function (b) { return b.id === String(boardId) && notDeleted_(b); })[0] || null;
}
function requireBoard_(boardId) {
  if (!findBoard_(boardId)) throw new Error('존재하지 않거나 삭제된 보드입니다.');
}
function requireSection_(boardId, sectionId) {
  var ok = readTable_('Sections').some(function (s) { return s.id === String(sectionId) && s.boardId === String(boardId) && notDeleted_(s); });
  if (!ok) throw new Error('존재하지 않거나 삭제된 섹션입니다.');
}
function publicBoard_(b, extra) {
  var o = { id: b.id, title: str_(b.title), description: str_(b.description), createdAt: Number(b.createdAt) || 0, hasOwnPassword: !!b.adminHash };
  if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
  return o;
}
function publicPost_(x) {
  return {
    id: x.id, boardId: x.boardId, sectionId: x.sectionId, title: str_(x.title), author: str_(x.author),
    content: str_(x.content), imageUrl: str_(x.imageUrl), imageKind: str_(x.imageKind),
    sourceUrl: str_(x.sourceUrl), linkUrl: str_(x.linkUrl), createdAt: Number(x.createdAt) || 0,
  };
}
function notDeleted_(r) {
  return !(r.deleted === true || String(r.deleted).toUpperCase() === 'TRUE');
}
/** 타임스탬프 기반 고유 ID (예: b-mh3k2x9a-4f7q) */
function genId_(prefix) {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}
function str_(v) { return v === null || v === undefined ? '' : String(v); }
function clip_(v, max) { return str_(v).trim().slice(0, max); }
function sha256_(s) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return d.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
/** 문자열 앞에 ' 를 붙여 수식 인젝션(=, +, -, @) 및 숫자/날짜 자동 변환을 방지 */
function toCell_(v) {
  if (typeof v === 'string' && v.length) return "'" + v;
  return v === undefined || v === null ? '' : v;
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
