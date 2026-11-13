/**
 * 데모(Mock) API — VITE_GAS_URL 이 비어 있을 때 localStorage 로 동작.
 * 백엔드(google-sheet-db.gs)와 동일한 입출력 구조를 지원합니다.
 */
import { MOCK_ADMIN_PASSWORD } from '../config';
import { genId } from '../utils/id';

const KEY = 'mathrillerpad-mock-db-v2';

function load() {
  try {
    const db = JSON.parse(localStorage.getItem(KEY));
    if (db && db.Boards) {
      db.Comments = db.Comments || [];
      return db;
    }
  } catch { /* ignore */ }
  return { Boards: [], Sections: [], Posts: [], Comments: [] };
}

function save(db) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    throw new Error('브라우저 저장 공간이 가득 찼습니다.');
  }
}

const delay = (v) => new Promise((r) => setTimeout(() => r(v), 150));
const alive = (r) => !r.deleted;

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function publicBoard(b, extra = {}) {
  const { adminHash, deleted, ...rest } = b;
  return { ...rest, hasOwnPassword: !!adminHash, ...extra };
}

function publicPost(p) {
  const { passwordHash, deleted, ...rest } = p;
  return {
    ...rest,
    order: Number(p.order) || 0,
    likes: Number(p.likes) || 0,
    hasPassword: !!passwordHash,
  };
}

function requireBoard(db, boardId) {
  const b = db.Boards.find((x) => x.id === boardId && alive(x));
  if (!b) throw new Error('존재하지 않거나 삭제된 보드입니다.');
  return b;
}

async function isAdmin(db, boardId, password) {
  if (!password) return false;
  if (password === MOCK_ADMIN_PASSWORD) return true;
  const b = db.Boards.find((x) => x.id === boardId && alive(x));
  return !!(b && b.adminHash && b.adminHash === (await sha256(password)));
}

async function assertAdmin(db, boardId, password) {
  if (!(await isAdmin(db, boardId, password))) throw new Error('관리자 권한이 없습니다. 다시 로그인하세요.');
}

async function assertPostOwnerOrAdmin(db, post, password, boardId) {
  if (await isAdmin(db, boardId, password)) return;
  if (!password) throw new Error('비밀번호를 입력하세요.');
  if (post.passwordHash && post.passwordHash === (await sha256(password))) return;
  throw new Error('비밀번호가 올바르지 않습니다.');
}

export const mockApi = {
  async listBoards() {
    const db = load();
    return delay(
      db.Boards.filter(alive)
        .map((b) =>
          publicBoard(b, {
            sectionCount: db.Sections.filter((s) => s.boardId === b.id && alive(s)).length,
            postCount: db.Posts.filter((p) => p.boardId === b.id && alive(p)).length,
          }),
        )
        .sort((a, b) => b.createdAt - a.createdAt),
    );
  },

  async getBoard(boardId) {
    const db = load();
    const board = requireBoard(db, boardId);
    return delay({
      board: publicBoard(board),
      sections: db.Sections.filter((s) => s.boardId === boardId && alive(s)).sort((a, b) => a.order - b.order),
      posts: db.Posts.filter((p) => p.boardId === boardId && alive(p))
        .sort((a, b) => (a.order - b.order) || (a.createdAt - b.createdAt))
        .map(publicPost),
      comments: (db.Comments || []).filter((c) => c.boardId === boardId && alive(c)).sort((a, b) => a.createdAt - b.createdAt),
    });
  },

  async createBoard({ title, description, adminPassword }) {
    if (!title?.trim()) throw new Error('보드 제목을 입력하세요.');
    const db = load();
    const board = {
      id: genId('b'),
      title: title.trim(),
      description: (description || '').trim(),
      adminHash: adminPassword ? await sha256(adminPassword) : '',
      createdAt: Date.now(),
      deleted: false,
    };
    db.Boards.push(board);
    db.Sections.push({ id: genId('s'), boardId: board.id, title: '첫 번째 섹션', order: 0, createdAt: Date.now(), deleted: false });
    save(db);
    return delay(publicBoard(board));
  },

  async deleteBoard({ boardId, password }) {
    if (password !== MOCK_ADMIN_PASSWORD) throw new Error('마스터 관리자 권한이 필요합니다.');
    const db = load();
    requireBoard(db, boardId).deleted = true;
    save(db);
    return delay({ boardId });
  },

  async createSection({ boardId, title }) {
    if (!title?.trim()) throw new Error('섹션 이름을 입력하세요.');
    const db = load();
    requireBoard(db, boardId);
    const order = Math.max(-1, ...db.Sections.filter((s) => s.boardId === boardId).map((s) => s.order)) + 1;
    const section = { id: genId('s'), boardId, title: title.trim(), order, createdAt: Date.now(), deleted: false };
    db.Sections.push(section);
    save(db);
    return delay(section);
  },

  async updateSection({ boardId, sectionId, title, password }) {
    if (!title?.trim()) throw new Error('섹션 이름을 입력하세요.');
    const db = load();
    await assertAdmin(db, boardId, password);
    const s = db.Sections.find((x) => x.id === sectionId && x.boardId === boardId);
    if (!s) throw new Error('섹션을 찾을 수 없습니다.');
    s.title = title.trim();
    save(db);
    return delay({ sectionId, title: s.title });
  },

  async reorderSections({ boardId, sectionIds, password }) {
    const db = load();
    await assertAdmin(db, boardId, password);
    const ids = sectionIds || [];
    ids.forEach((id, idx) => {
      const s = db.Sections.find((x) => x.id === id && x.boardId === boardId);
      if (s) s.order = idx;
    });
    save(db);
    return delay({ reordered: ids.length });
  },

  async deleteSection({ boardId, sectionId, password }) {
    const db = load();
    await assertAdmin(db, boardId, password);
    const s = db.Sections.find((x) => x.id === sectionId && x.boardId === boardId);
    if (!s) throw new Error('섹션을 찾을 수 없습니다.');
    s.deleted = true;
    db.Posts.forEach((p) => { if (p.sectionId === sectionId) p.deleted = true; });
    save(db);
    return delay({ sectionId });
  },

  async createPost({ boardId, sectionId, title, author, content, image, linkUrl, password }) {
    const db = load();
    requireBoard(db, boardId);
    if (!db.Sections.some((s) => s.id === sectionId && s.boardId === boardId && alive(s))) {
      throw new Error('존재하지 않거나 삭제된 섹션입니다.');
    }
    const imageUrl = image?.base64 || '';
    if (!content?.trim() && !title?.trim() && !imageUrl) throw new Error('내용 또는 이미지를 입력하세요.');

    const secPosts = db.Posts.filter((p) => p.boardId === boardId && p.sectionId === sectionId && alive(p));
    const maxOrder = Math.max(-1, ...secPosts.map((p) => p.order ?? 0));

    const post = {
      id: genId('p'),
      boardId,
      sectionId,
      title: (title || '').trim(),
      author: (author || '').trim() || '익명',
      content: (content || '').trim(),
      imageUrl,
      imageKind: imageUrl ? (image.kind === 'drawing' ? 'drawing' : 'upload') : '',
      sourceUrl: '',
      linkUrl: linkUrl || '',
      order: maxOrder + 1,
      passwordHash: password ? await sha256(password) : '',
      likes: 0,
      createdAt: Date.now(),
      deleted: false,
    };
    db.Posts.push(post);
    save(db);
    return delay(publicPost(post));
  },

  async updatePost({ boardId, postId, title, author, content, image, linkUrl, sectionId, password }) {
    const db = load();
    const p = db.Posts.find((x) => x.id === postId && x.boardId === boardId && alive(x));
    if (!p) throw new Error('게시물을 찾을 수 없습니다.');
    await assertPostOwnerOrAdmin(db, p, password, boardId);

    if (title !== undefined) p.title = String(title).trim();
    if (author !== undefined) p.author = String(author).trim() || '익명';
    if (content !== undefined) p.content = String(content).trim();
    if (linkUrl !== undefined) p.linkUrl = String(linkUrl).trim();
    if (sectionId && sectionId !== p.sectionId) p.sectionId = sectionId;

    if (image) {
      if (image.base64) {
        p.imageUrl = image.base64;
        p.imageKind = image.kind === 'drawing' ? 'drawing' : 'upload';
      } else if (image.remove) {
        p.imageUrl = '';
        p.imageKind = '';
      }
    }
    save(db);
    return delay(publicPost(p));
  },

  async movePost({ boardId, postId, targetSectionId, newOrder, orderedPostIds }) {
    const db = load();
    const p = db.Posts.find((x) => x.id === postId && x.boardId === boardId && alive(x));
    if (!p) throw new Error('게시물을 찾을 수 없습니다.');
    if (targetSectionId) p.sectionId = targetSectionId;
    if (typeof newOrder === 'number') p.order = newOrder;

    if (Array.isArray(orderedPostIds)) {
      orderedPostIds.forEach((id, idx) => {
        const item = db.Posts.find((x) => x.id === id && x.boardId === boardId);
        if (item) item.order = idx;
      });
    }
    save(db);
    return delay({ postId, sectionId: p.sectionId, order: p.order });
  },

  async likePost({ boardId, postId, delta = 1 }) {
    const db = load();
    const p = db.Posts.find((x) => x.id === postId && x.boardId === boardId && alive(x));
    if (!p) throw new Error('게시물을 찾을 수 없습니다.');
    p.likes = Math.max(0, (Number(p.likes) || 0) + delta);
    save(db);
    return delay({ postId, likes: p.likes });
  },

  async deletePost({ boardId, postId, password }) {
    const db = load();
    const p = db.Posts.find((x) => x.id === postId && x.boardId === boardId);
    if (!p) throw new Error('게시물을 찾을 수 없습니다.');
    await assertPostOwnerOrAdmin(db, p, password, boardId);
    p.deleted = true;
    save(db);
    return delay({ postId });
  },

  async createComment({ boardId, postId, author, content }) {
    const db = load();
    const comment = {
      id: genId('c'),
      postId,
      boardId,
      author: (author || '').trim() || '익명',
      content: (content || '').trim(),
      createdAt: Date.now(),
      deleted: false,
    };
    db.Comments = db.Comments || [];
    db.Comments.push(comment);
    save(db);
    return delay(comment);
  },

  async deleteComment({ boardId, commentId, password }) {
    const db = load();
    await assertAdmin(db, boardId, password);
    const c = (db.Comments || []).find((x) => x.id === commentId && x.boardId === boardId);
    if (!c) throw new Error('댓글을 찾을 수 없습니다.');
    c.deleted = true;
    save(db);
    return delay({ commentId });
  },

  async importPosts({ boardId, posts, comments }) {
    const db = load();
    requireBoard(db, boardId);
    const secs = db.Sections.filter((s) => s.boardId === boardId && alive(s));
    const byTitle = Object.fromEntries(secs.map((s) => [s.title, s.id]));
    let order = Math.max(-1, ...secs.map((s) => s.order));

    const results = posts.map((it, index) => {
      const t = (it.sectionTitle || '').trim() || '가져온 게시물';
      if (!byTitle[t]) {
        const s = { id: genId('s'), boardId, title: t, order: ++order, createdAt: Date.now(), deleted: false };
        db.Sections.push(s);
        byTitle[t] = s.id;
      }
      const url = (it.attachmentUrl || '').trim();
      const isImg = /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(url);
      const postId = genId('p');
      db.Posts.push({
        id: postId,
        boardId,
        sectionId: byTitle[t],
        title: it.title || '',
        author: it.author || '익명',
        content: it.content || '',
        imageUrl: isImg ? url : '',
        imageKind: isImg ? 'migrated' : '',
        sourceUrl: url,
        linkUrl: url && !isImg ? url : '',
        order: index,
        passwordHash: '',
        likes: Number(it.likes) || 0,
        createdAt: Number(new Date(it.createdAt)) || Date.now(),
        deleted: false,
      });
      return { index, postId, status: isImg ? 'image' : url ? 'link' : 'text' };
    });

    if (Array.isArray(comments)) {
      db.Comments = db.Comments || [];
      comments.forEach((c) => {
        const target = results[c.postIndex];
        if (target) {
          db.Comments.push({
            id: genId('c'),
            postId: target.postId,
            boardId,
            author: c.author || '익명',
            content: c.content || '',
            createdAt: Number(new Date(c.createdAt)) || Date.now(),
            deleted: false,
          });
        }
      });
    }

    save(db);
    return delay({ imported: posts.length, results });
  },

  async verifyAdmin({ boardId, password }) {
    return delay({ valid: await isAdmin(load(), boardId, password) });
  },

  async verifyPostPassword({ postId, password }) {
    const db = load();
    const p = db.Posts.find((x) => x.id === postId);
    if (!p || !p.passwordHash) return delay({ valid: false });
    return delay({ valid: p.passwordHash === (await sha256(password)) });
  },
};
