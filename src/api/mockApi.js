/**
 * 데모(Mock) API — VITE_GAS_URL 이 비어 있을 때 localStorage 로 동작.
 * 백엔드(google-sheet-db.gs)와 동일한 입출력 구조를 흉내 냅니다.
 * ※ 데모 모드에서는 CORS 때문에 CSV 첨부 이미지를 다운로드하지 않고 원본 URL 을 그대로 참조합니다.
 */
import { MOCK_ADMIN_PASSWORD } from '../config';
import { genId } from '../utils/id';

const KEY = 'mathrillerpad-mock-db-v1';

function load() {
  try {
    const db = JSON.parse(localStorage.getItem(KEY));
    if (db && db.Boards) return db;
  } catch { /* ignore */ }
  return { Boards: [], Sections: [], Posts: [] };
}
function save(db) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    throw new Error('브라우저 저장 공간이 가득 찼습니다. (데모 모드 한계 — GAS 를 연결하세요)');
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
      posts: db.Posts.filter((p) => p.boardId === boardId && alive(p)).sort((a, b) => a.createdAt - b.createdAt),
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

  async createPost({ boardId, sectionId, title, author, content, image, linkUrl }) {
    const db = load();
    requireBoard(db, boardId);
    if (!db.Sections.some((s) => s.id === sectionId && s.boardId === boardId && alive(s))) {
      throw new Error('존재하지 않거나 삭제된 섹션입니다.');
    }
    const imageUrl = image?.base64 || '';
    if (!content?.trim() && !title?.trim() && !imageUrl) throw new Error('내용 또는 이미지를 입력하세요.');
    const post = {
      id: genId('p'), boardId, sectionId,
      title: (title || '').trim(),
      author: (author || '').trim() || '익명',
      content: (content || '').trim(),
      imageUrl,
      imageKind: imageUrl ? (image.kind === 'drawing' ? 'drawing' : 'upload') : '',
      sourceUrl: '', linkUrl: linkUrl || '',
      createdAt: Date.now(), deleted: false,
    };
    db.Posts.push(post);
    save(db);
    return delay(post);
  },

  async deletePost({ boardId, postId, password }) {
    const db = load();
    await assertAdmin(db, boardId, password);
    const p = db.Posts.find((x) => x.id === postId && x.boardId === boardId);
    if (!p) throw new Error('게시물을 찾을 수 없습니다.');
    p.deleted = true;
    save(db);
    return delay({ postId });
  },

  async importPosts({ boardId, posts }) {
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
      db.Posts.push({
        id: genId('p'), boardId, sectionId: byTitle[t],
        title: it.title || '', author: it.author || '익명', content: it.content || '',
        imageUrl: isImg ? url : '', imageKind: isImg ? 'migrated' : '',
        sourceUrl: url, linkUrl: url && !isImg ? url : '',
        createdAt: Number(new Date(it.createdAt)) || Date.now(), deleted: false,
      });
      return { index, status: isImg ? 'image' : url ? 'link' : 'text' };
    });
    save(db);
    return delay({ imported: posts.length, results });
  },

  async verifyAdmin({ boardId, password }) {
    return delay({ valid: await isAdmin(load(), boardId, password) });
  },
};
