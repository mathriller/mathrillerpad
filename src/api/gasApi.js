import { GAS_URL } from '../config';

/**
 * Google Apps Script 웹 앱 호출
 *  - 읽기: GET ?action=...
 *  - 쓰기: POST (Content-Type: text/plain) → CORS preflight(OPTIONS) 회피
 *  GAS 는 응답을 script.googleusercontent.com 으로 302 리다이렉트하며 fetch 가 자동으로 따라갑니다.
 */
async function parse(res) {
  if (!res.ok) throw new Error(`서버 응답 오류 (${res.status})`);
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error('서버 응답을 해석할 수 없습니다. GAS 배포 설정(액세스: 모든 사용자)을 확인하세요.');
  }
  if (!json.ok) throw new Error(json.error || '알 수 없는 서버 오류');
  return json.data;
}

export async function gasGet(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params, _t: Date.now() });
  const res = await fetch(`${GAS_URL}?${qs}`, { method: 'GET', redirect: 'follow' });
  return parse(res);
}

export async function gasPost(action, body = {}) {
  const res = await fetch(GAS_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...body }),
  });
  return parse(res);
}

export const gasApi = {
  listBoards: () => gasGet('listBoards'),
  getBoard: (boardId) => gasGet('getBoard', { boardId }),
  createBoard: (p) => gasPost('createBoard', p),
  deleteBoard: (p) => gasPost('deleteBoard', p),
  createSection: (p) => gasPost('createSection', p),
  deleteSection: (p) => gasPost('deleteSection', p),
  createPost: (p) => gasPost('createPost', p),
  deletePost: (p) => gasPost('deletePost', p),
  importPosts: (p) => gasPost('importPosts', p),
  verifyAdmin: (p) => gasPost('verifyAdmin', p),
};
