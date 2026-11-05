import { useCallback, useState } from 'react';
import { api } from '../api';

/**
 * 관리자 세션 관리 (localStorage 기반으로 유지)
 *  - 'main' 키: 마스터 관리자 비밀번호 (허브 접속 및 모든 보드 제어 권한)
 *  - '[boardId]' 키: 해당 보드 전용 관리자 비밀번호
 *  - 마스터 비밀번호가 있으면 어떤 보드에서든 자동으로 관리자 권한이 부여됩니다.
 */
const KEY = 'mathrillerpad-admin-v2';

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

export function useAdmin(boardId) {
  const scope = boardId || 'main';
  const [store, setStore] = useState(readAll);

  // 마스터 비밀번호가 있으면 최우선 적용, 없으면 보드 전용 비밀번호
  const masterPassword = store['main'] || '';
  const scopePassword = store[scope] || '';
  const password = boardId ? (masterPassword || scopePassword) : masterPassword;
  const isMasterAdmin = !!masterPassword;
  const isAdmin = !!password;

  const persist = (next) => {
    localStorage.setItem(KEY, JSON.stringify(next));
    setStore(next);
  };

  const login = useCallback(
    async (pw) => {
      // boardId가 없으면 마스터 비밀번호 검증 (boardId='')
      // boardId가 있으면 해당 보드에서 비밀번호 검증
      const { valid } = await api.verifyAdmin({ boardId: boardId || '', password: pw });
      if (!valid) throw new Error('비밀번호가 올바르지 않습니다.');

      const next = readAll();
      if (!boardId) {
        // 허브에서 로그인한 경우 마스터 비밀번호로 저장
        next['main'] = pw;
      } else {
        // 개별 보드에서 로그인했을 때, 만약 마스터 비밀번호와 같다면 main에도 등록
        const checkMaster = await api.verifyAdmin({ boardId: '', password: pw }).catch(() => ({ valid: false }));
        if (checkMaster.valid) {
          next['main'] = pw;
        } else {
          next[scope] = pw;
        }
      }
      persist(next);
    },
    [boardId, scope],
  );

  const logout = useCallback(() => {
    const next = readAll();
    if (!boardId) {
      delete next['main'];
    } else {
      delete next[scope];
      // 마스터로 로그인되어 있었다면 마스터도 함께 해제
      delete next['main'];
    }
    persist(next);
  }, [boardId, scope]);

  return { isAdmin, isMasterAdmin, password, login, logout };
}
