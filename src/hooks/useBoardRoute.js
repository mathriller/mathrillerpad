import { useCallback, useEffect, useState } from 'react';

/**
 * 쿼리 파라미터 기반 라우팅 (?board=보드ID)
 *  - "/" 또는 "?board=main" → 허브(메인)
 *  - "?board=b-xxxx"       → 개별 보드
 * 정적 호스팅(GitHub Pages 등)에서도 별도 서버 설정 없이 주소 공유가 가능합니다.
 */
function readBoardId() {
  const id = new URLSearchParams(window.location.search).get('board');
  return !id || id === 'main' ? null : id;
}

export function useBoardRoute() {
  const [boardId, setBoardId] = useState(readBoardId);

  useEffect(() => {
    const onPop = () => setBoardId(readBoardId());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((id) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('board', id);
    else url.searchParams.delete('board');
    window.history.pushState({}, '', url);
    setBoardId(id || null);
    window.scrollTo(0, 0);
  }, []);

  return { boardId, navigate };
}

/** 특정 보드의 공유 가능한 전체 URL */
export function boardUrl(id) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('board', id);
  return url.toString();
}
