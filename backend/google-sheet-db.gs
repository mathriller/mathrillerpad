/**
 * ════════════════════════════════════════════════════════════════════
 *  MathrillerPad — Google Sheets DB 백엔드 (Google Apps Script)
 * ════════════════════════════════════════════════════════════════════
 *
 *  [기능 목록]
 *   1. 멀티 보드 / 섹션 선반 / 메모 CRUD
 *   2. 섹션 이름 수정 & 섹션 좌우 순서 이동
 *   3. 메모 섹션 간 이동 및 상하 순서 이동
 *   4. 작성자 암호 설정을 통한 메모 직접 수정 / 삭제
 *   5. 하트 좋아요 (Like) 토글
 *   6. 메모별 댓글 (Comments) 등록 및 관리
 *   7. 패들렛 엑셀/CSV 영구 마이그레이션 (사진 드라이브 저장 + 댓글 + 반응)
 *   8. 마스터/보드 관리자 권한 인증
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
          'imageKind', 'sourceUrl', 'linkUrl', 'order', 'passwordHash', 'likes', 'createdAt', 'deleted'],
  Comments: ['id', 'postId', 'boardId', 'author', 'content', 'createdAt', 'deleted'],
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
      case 'ping':             data = { pong: true, time: Date.now() }; break;
      case 'listBoards':       data = listBoards_(); break;
      case 'getBoard':         data = getBoard_(p.boardId); break;
      case 'createBoard':      data = createBoard_(p); break;
      case 'deleteBoard':      data = deleteBoard_(p); break;

      case 'createSection':    data = createSection_(p); break;
      case 'updateSection':    data = updateSection_(p); break;
      case 'reorderSections':  data = reorderSections_(p); break;
      case 'deleteSection':    data = deleteSection_(p); break;

      case 'createPost':       data = createPost_(p); break;
      case 'updatePost':       data = updatePost_(p); break;
      case 'movePost':         data = movePost_(p); break;
      case 'likePost':         data = likePost_(p); break;
      case 'deletePost':       data = deletePost_(p); break;

      case 'createComment':    data = createComment_(p); break;
      case 'deleteComment':    data = deleteComment_(p); break;

      case 'importPosts':      data = importPosts_(p); break;
      case 'verifyAdmin':      data = { valid: isAdmin_(p.boardId, p.password) }; break;
      case 'verifyPostPassword': data = { valid: verifyPostPassword_(p.postId, p.password) }; break;

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
    .sort(function (a, b) { return (a.order - b.order) || (a.createdAt - b.createdAt); })
    .map(publicPost_);

  var comments = readTable_('Comments')
    .filter(function (c) { return c.boardId === boardId && notDeleted_(c); })
    .sort(function (a, b) { return a.createdAt - b.createdAt; })
    .map(publicComment_);

  return {
    board: publicBoard_(board),
    sections: sections.map(function (s) {
      return { id: s.id, boardId: s.boardId, title: str_(s.title), order: Number(s.order) || 0, createdAt: Number(s.createdAt) || 0 };
    }),
    posts: posts,
    comments: comments,
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
  // 기본 첫 섹션 생성
  appendRows_('Sections', [{ id: genId_('s'), boardId: board.id, title: '첫 번째 섹션', order: 0, createdAt: Date.now(), deleted: false }]);
  return publicBoard_(board);
}

function deleteBoard_(p) {
  if (String(p.password || '') !== getMasterPassword_()) throw new Error('마스터 관리자 권한이 필요합니다.');
  if (!markDeleted_('Boards', p.boardId)) throw new Error('보드를 찾을 수 없습니다.');
  return { boardId: p.boardId };
}

// ───────────────────────── Sections ─────────────────────────
function createSection_(p) {
  requireBoard_(p.boardId);
  var title = clip_(p.title, 200);
  if (!title) throw new Error('섹션 이름을 입력하세요.');
  var existing = readTable_('Sections').filter(function (s) { return s.boardId === p.boardId && notDeleted_(s); });
  var maxOrder = existing.reduce(function (m, s) { return Math.max(m, Number(s.order) || 0); }, -1);
  var section = { id: genId_('s'), boardId: p.boardId, title: title, order: maxOrder + 1, createdAt: Date.now(), deleted: false };
  appendRows_('Sections', [section]);
  return section;
}

function updateSection_(p) {
  assertAdmin_(p.boardId, p.password);
  var title = clip_(p.title, 200);
  if (!title) throw new Error('섹션 이름을 입력하세요.');
  var row = findRow_('Sections', p.sectionId, p.boardId);
  if (!row) throw new Error('섹션을 찾을 수 없습니다.');
  updateCell_('Sections', row._row, 'title', title);
  return { sectionId: p.sectionId, title: title };
}

function reorderSections_(p) {
  assertAdmin_(p.boardId, p.password);
  var ids = Array.isArray(p.sectionIds) ? p.sectionIds : [];
  if (!ids.length) return { reordered: 0 };
  var sections = readTable_('Sections').filter(function (s) { return s.boardId === p.boardId && notDeleted_(s); });
  var byId = {};
  sections.forEach(function (s) { byId[s.id] = s; });

  ids.forEach(function (id, idx) {
    var s = byId[id];
    if (s) {
      updateCell_('Sections', s._row, 'order', idx);
    }
  });
  return { reordered: ids.length };
}

function deleteSection_(p) {
  assertAdmin_(p.boardId, p.password);
  if (!markDeleted_('Sections', p.sectionId, p.boardId)) throw new Error('섹션을 찾을 수 없습니다.');
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

  var existing = readTable_('Posts').filter(function (x) { return x.boardId === p.boardId && x.sectionId === p.sectionId && notDeleted_(x); });
  var maxOrder = existing.reduce(function (m, x) { return Math.max(m, Number(x.order) || 0); }, -1);

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
    order: maxOrder + 1,
    passwordHash: p.password ? sha256_(String(p.password)) : '',
    likes: 0,
    createdAt: Date.now(),
    deleted: false,
  };
  appendRows_('Posts', [post]);
  return publicPost_(post);
}

function updatePost_(p) {
  var row = findRow_('Posts', p.postId, p.boardId);
  if (!row) throw new Error('게시물을 찾을 수 없습니다.');
  assertPostOwnerOrAdmin_(row, p.password, p.boardId);

  var title = clip_(p.title, 300);
  var content = clip_(p.content, 20000);
  var author = clip_(p.author, 100) || '익명';
  var linkUrl = clip_(p.linkUrl, 2000);

  updateCell_('Posts', row._row, 'title', title);
  updateCell_('Posts', row._row, 'content', content);
  updateCell_('Posts', row._row, 'author', author);
  updateCell_('Posts', row._row, 'linkUrl', linkUrl);

  // 이미지 교체 또는 삭제
  if (p.image) {
    if (p.image.base64) {
      var imageUrl = saveBase64Image_(p.image.base64, p.image.mimeType, p.image.kind || 'upload');
      var imageKind = p.image.kind === 'drawing' ? 'drawing' : 'upload';
      updateCell_('Posts', row._row, 'imageUrl', imageUrl);
      updateCell_('Posts', row._row, 'imageKind', imageKind);
    } else if (p.image.remove) {
      updateCell_('Posts', row._row, 'imageUrl', '');
      updateCell_('Posts', row._row, 'imageKind', '');
    }
  }

  // 섹션 이동 요청도 함께 포함된 경우
  if (p.sectionId && p.sectionId !== row.sectionId) {
    requireSection_(p.boardId, p.sectionId);
    updateCell_('Posts', row._row, 'sectionId', p.sectionId);
  }

  var updated = findRow_('Posts', p.postId, p.boardId);
  return publicPost_(updated);
}

function movePost_(p) {
  var row = findRow_('Posts', p.postId, p.boardId);
  if (!row) throw new Error('게시물을 찾을 수 없습니다.');
  assertPostOwnerOrAdmin_(row, p.password, p.boardId);

  var targetSectionId = p.targetSectionId || row.sectionId;
  requireSection_(p.boardId, targetSectionId);

  var newOrder = typeof p.newOrder === 'number' ? p.newOrder : Number(row.order) || 0;
  updateCell_('Posts', row._row, 'sectionId', targetSectionId);
  updateCell_('Posts', row._row, 'order', newOrder);

  // 같은 섹션 내 순서 재정렬이 주어진 경우
  if (Array.isArray(p.orderedPostIds)) {
    var posts = readTable_('Posts').filter(function (x) { return x.boardId === p.boardId && x.sectionId === targetSectionId && notDeleted_(x); });
    var byId = {};
    posts.forEach(function (x) { byId[x.id] = x; });
    p.orderedPostIds.forEach(function (id, idx) {
      if (byId[id]) {
        updateCell_('Posts', byId[id]._row, 'order', idx);
      }
    });
  }

  return { postId: p.postId, sectionId: targetSectionId, order: newOrder };
}

function likePost_(p) {
  var row = findRow_('Posts', p.postId, p.boardId);
  if (!row) throw new Error('게시물을 찾을 수 없습니다.');
  var delta = Number(p.delta) || 1;
  var current = Math.max(0, Number(row.likes) || 0);
  var next = Math.max(0, current + delta);
  updateCell_('Posts', row._row, 'likes', next);
  return { postId: p.postId, likes: next };
}

function deletePost_(p) {
  var row = findRow_('Posts', p.postId, p.boardId);
  if (!row) throw new Error('게시물을 찾을 수 없습니다.');
  assertPostOwnerOrAdmin_(row, p.password, p.boardId);

  if (!markDeleted_('Posts', p.postId, p.boardId)) throw new Error('게시물을 찾을 수 없습니다.');
  // 연관 댓글도 삭제
  markDeletedWhere_('Comments', function (c) { return c.postId === p.postId && c.boardId === p.boardId; });
  return { postId: p.postId };
}

function verifyPostPassword_(postId, password) {
  var row = readTable_('Posts').filter(function (x) { return x.id === String(postId); })[0];
  if (!row || !row.passwordHash) return false;
  return row.passwordHash === sha256_(String(password || ''));
}

function assertPostOwnerOrAdmin_(postRow, password, boardId) {
  if (isAdmin_(boardId, password)) return; // 관리자는 무조건 허용
  var pw = String(password || '');
  if (!postRow.passwordHash) {
    throw new Error('비밀번호가 설정되지 않은 메모는 관리자만 수정/삭제/이동할 수 있습니다.');
  }
  if (!pw) throw new Error('비밀번호를 입력하세요.');
  if (postRow.passwordHash && postRow.passwordHash === sha256_(pw)) return;
  throw new Error('비밀번호가 올바르지 않습니다.');
}

// ───────────────────────── Comments ─────────────────────────
function createComment_(p) {
  requireBoard_(p.boardId);
  var post = findRow_('Posts', p.postId, p.boardId);
  if (!post) throw new Error('존재하지 않거나 삭제된 메모입니다.');

  var content = clip_(p.content, 2000);
  if (!content) throw new Error('댓글 내용을 입력하세요.');

  var comment = {
    id: genId_('c'),
    postId: p.postId,
    boardId: p.boardId,
    author: clip_(p.author, 100) || '익명',
    content: content,
    createdAt: Date.now(),
    deleted: false,
  };
  appendRows_('Comments', [comment]);
  return publicComment_(comment);
}

function deleteComment_(p) {
  assertAdmin_(p.boardId, p.password);
  if (!markDeleted_('Comments', p.commentId, p.boardId)) throw new Error('댓글을 찾을 수 없습니다.');
  return { commentId: p.commentId };
}

// ───────────────────────── 패들렛 CSV/XLSX 마이그레이션 ─────────────────────────
function importPosts_(p) {
  requireBoard_(p.boardId);
  var items = Array.isArray(p.posts) ? p.posts.slice(0, 50) : [];
  if (!items.length) return { imported: 0, results: [] };

  // 1) 섹션 이름 매핑
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
      responses = requests.map(function (r) {
        try { return UrlFetchApp.fetch(r.url, r); } catch (e) { return null; }
      });
    }
  }
  var fetched = {};
  fetchIdx.forEach(function (itemIdx, k) { fetched[itemIdx] = responses[k]; });

  // 3) 행 생성
  var results = [];
  var postOrderMap = {};
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

    var secId = byTitle[clip_(it.sectionTitle, 200) || '가져온 게시물'];
    postOrderMap[secId] = (postOrderMap[secId] !== undefined ? postOrderMap[secId] + 1 : 0);

    var created = Number(new Date(it.createdAt)) || Date.now();
    var likes = Number(it.likes) || 0;
    var postId = genId_('p');
    results.push({ index: i, postId: postId, status: status });

    return {
      id: postId,
      boardId: p.boardId,
      sectionId: secId,
      title: clip_(it.title, 300),
      author: clip_(it.author, 100) || '익명',
      content: clip_(it.content, 20000),
      imageUrl: imageUrl,
      imageKind: imageUrl ? 'migrated' : '',
      sourceUrl: url,
      linkUrl: linkUrl,
      order: postOrderMap[secId],
      passwordHash: '',
      likes: likes,
      createdAt: created,
      deleted: false,
    };
  });
  appendRows_('Posts', rows);

  // 4) 댓글 마이그레이션이 포함된 경우
  if (Array.isArray(p.comments) && p.comments.length) {
    var commentRows = [];
    p.comments.forEach(function (c) {
      var targetPost = results[c.postIndex];
      if (targetPost && targetPost.postId) {
        commentRows.push({
          id: genId_('c'),
          postId: targetPost.postId,
          boardId: p.boardId,
          author: clip_(c.author, 100) || '익명',
          content: clip_(c.content, 2000),
          createdAt: Number(new Date(c.createdAt)) || Date.now(),
          deleted: false,
        });
      }
    });
    if (commentRows.length) appendRows_('Comments', commentRows);
  }

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
    try { file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); } catch (e2) {}
  }
  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1600';
}

// ───────────────────────── 관리자 인증 ─────────────────────────
function getMasterPassword_() {
  var v = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  return v ? String(v) : DEFAULT_ADMIN_PASSWORD;
}

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
    } else {
      // 기존 시트에 새로운 컬럼이 추가되었는지 확인하고 우측에 자동 보강
      var lastCol = Math.max(1, sh.getLastColumn());
      var existingHeaders = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(str_);
      var toAdd = [];
      SCHEMA[name].forEach(function (col) {
        if (existingHeaders.indexOf(col) === -1) {
          toAdd.push(col);
        }
      });
      if (toAdd.length) {
        sh.getRange(1, lastCol + 1, 1, toAdd.length).setValues([toAdd]).setFontWeight('bold').setBackground('#e8eaf6');
      }
    }
  });
  var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('시트1');
  if (def && ss.getSheets().length > 4 && def.getLastRow() === 0) ss.deleteSheet(def);
}

function sheet_(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function readTable_(name) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var lastCol = Math.max(1, sh.getLastColumn());
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(str_);
  var values = sh.getRange(2, 1, last - 1, lastCol).getValues();

  return values.map(function (r, i) {
    var o = { _row: i + 2 };
    headers.forEach(function (c, j) {
      if (c) {
        o[c] = r[j] instanceof Date ? r[j].getTime() : r[j];
      }
    });
    o.id = str_(o.id);
    if ('boardId' in o) o.boardId = str_(o.boardId);
    if ('sectionId' in o) o.sectionId = str_(o.sectionId);
    if ('postId' in o) o.postId = str_(o.postId);
    o.createdAt = Number(o.createdAt) || 0;
    return o;
  }).filter(function (o) { return o.id; });
}

function appendRows_(name, objects) {
  if (!objects.length) return;
  var sh = sheet_(name);
  var lastCol = Math.max(1, sh.getLastColumn());
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(str_);
  var rows = objects.map(function (o) {
    return headers.map(function (c) { return toCell_(o[c]); });
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
}

function updateCell_(name, rowNum, colName, value) {
  var sh = sheet_(name);
  var lastCol = Math.max(1, sh.getLastColumn());
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(str_);
  var colIdx = headers.indexOf(colName);
  if (colIdx === -1) {
    // 없으면 컬럼 추가
    colIdx = headers.length;
    sh.getRange(1, colIdx + 1).setValue(colName).setFontWeight('bold').setBackground('#e8eaf6');
  }
  sh.getRange(rowNum, colIdx + 1).setValue(toCell_(value));
}

function findRow_(name, id, boardId) {
  return readTable_(name).filter(function (r) {
    return r.id === String(id) && (!boardId || r.boardId === String(boardId));
  })[0] || null;
}

function markDeleted_(name, id, boardId) {
  if (!id) return false;
  var row = findRow_(name, id, boardId);
  if (!row) return false;
  updateCell_(name, row._row, 'deleted', true);
  return true;
}

function markDeletedWhere_(name, predicate) {
  readTable_(name).forEach(function (r) {
    if (notDeleted_(r) && predicate(r)) {
      updateCell_(name, r._row, 'deleted', true);
    }
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
    id: x.id,
    boardId: x.boardId,
    sectionId: x.sectionId,
    title: str_(x.title),
    author: str_(x.author),
    content: str_(x.content),
    imageUrl: str_(x.imageUrl),
    imageKind: str_(x.imageKind),
    sourceUrl: str_(x.sourceUrl),
    linkUrl: str_(x.linkUrl),
    order: Number(x.order) || 0,
    likes: Number(x.likes) || 0,
    hasPassword: !!x.passwordHash,
    createdAt: Number(x.createdAt) || 0,
  };
}
function publicComment_(c) {
  return {
    id: c.id,
    postId: c.postId,
    boardId: c.boardId,
    author: str_(c.author),
    content: str_(c.content),
    createdAt: Number(c.createdAt) || 0,
  };
}
function notDeleted_(r) {
  return !(r.deleted === true || String(r.deleted).toUpperCase() === 'TRUE');
}
function genId_(prefix) {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}
function str_(v) { return v === null || v === undefined ? '' : String(v); }
function clip_(v, max) { return str_(v).trim().slice(0, max); }
function sha256_(s) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return d.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
function toCell_(v) {
  if (typeof v === 'string' && v.length) return "'" + v;
  return v === undefined || v === null ? '' : v;
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
