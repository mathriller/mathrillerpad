import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import { IS_MOCK, POLL_INTERVAL } from '../../config';
import { useAdmin } from '../../hooks/useAdmin';
import { boardUrl } from '../../hooks/useBoardRoute';
import AdminLoginModal from '../common/AdminLoginModal';
import ShareModal from '../common/ShareModal';
import Spinner from '../common/Spinner';
import { useToast } from '../common/Toast';
import { gradientFor } from '../hub/HubPage';
import CsvImportModal from './CsvImportModal';
import PostComposer from './PostComposer';
import Section from './Section';

/** 개별 보드 화면 (?board=보드ID) — 해당 보드의 Sections / Posts 만 필터링해 표시 */
export default function BoardPage({ boardId, navigate }) {
  const toast = useToast();
  const admin = useAdmin(boardId);
  const [data, setData] = useState(null); // { board, sections, posts }
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [composerSection, setComposerSection] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [showShare, setShowShare] = useState(false);
  const [newSection, setNewSection] = useState('');
  const [addingSection, setAddingSection] = useState(false);

  // 경쟁 상태(Race Condition) 방지용 요청 시퀀스 카운터
  const reqSeqRef = useRef(0);
  const busy = useRef(false);

  const load = useCallback(
    async (silent = false) => {
      if (busy.current) return;
      busy.current = true;
      if (silent) setSyncing(true);
      const seq = ++reqSeqRef.current;
      try {
        const d = await api.getBoard(boardId);
        // 더 최신 요청이나 낙관적 업데이트가 발생했다면 이전 응답은 버림
        if (seq < reqSeqRef.current) return;
        setData(d);
        setError('');
        document.title = `${d.board.title} · MathrillerPad`;
      } catch (err) {
        if (!silent && seq >= reqSeqRef.current) setError(err.message);
      } finally {
        busy.current = false;
        setSyncing(false);
      }
    },
    [boardId],
  );

  // 최초 로드 + 주기적 동기화 (탭이 활성화되어 있을 때만)
  useEffect(() => {
    load();
    const t = setInterval(() => !document.hidden && load(true), POLL_INTERVAL);
    const onVis = () => !document.hidden && load(true);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  const postsBySection = useMemo(() => {
    const m = {};
    data?.posts.forEach((p) => {
      const sId = String(p.sectionId);
      (m[sId] ||= []).push(p);
    });
    return m;
  }, [data]);

  // ── 액션 ──
  const addSection = async (e) => {
    e.preventDefault();
    if (!newSection.trim()) return;
    setAddingSection(true);
    try {
      const s = await api.createSection({ boardId, title: newSection });
      ++reqSeqRef.current; // 이전 폴링 응답 무효화
      setData((d) => ({ ...d, sections: [...d.sections, s] }));
      setNewSection('');
      toast('새 섹션이 추가되었습니다');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setAddingSection(false);
    }
  };

  const createPost = async (payload) => {
    const post = await api.createPost({ boardId, sectionId: composerSection.id, ...payload });
    ++reqSeqRef.current;
    setData((d) => ({ ...d, posts: [...d.posts, post] }));
    toast('메모가 등록되었습니다');
  };

  const handleAuthError = (err) => {
    toast(err.message, 'error');
    if (err.message.includes('권한') || err.message.includes('비밀번호')) admin.logout();
  };

  // 낙관적 업데이트 (Optimistic Update) 적용 메모 삭제
  const deletePost = async (post) => {
    if (!confirm('이 메모를 삭제할까요?')) return;
    ++reqSeqRef.current;
    const backup = data;
    setData((d) => ({
      ...d,
      posts: d.posts.filter((p) => String(p.id) !== String(post.id)),
    }));
    toast('메모를 삭제했습니다');

    try {
      await api.deletePost({ boardId, postId: post.id, password: admin.password });
    } catch (err) {
      setData(backup); // 실패 시 롤백
      handleAuthError(err);
    }
  };

  // 낙관적 업데이트 (Optimistic Update) 적용 섹션 삭제: 클릭 즉시 화면에서 제거!
  const deleteSection = async (section) => {
    const n = postsBySection[String(section.id)]?.length || 0;
    if (!confirm(`"${section.title}" 섹션${n ? `과 메모 ${n}개` : ''}를 삭제할까요?`)) return;

    ++reqSeqRef.current; // 진행 중인 오래된 폴링 응답 무효화
    const backup = data;
    // UI에서 즉시 제거
    setData((d) => ({
      ...d,
      sections: d.sections.filter((s) => String(s.id) !== String(section.id)),
      posts: d.posts.filter((p) => String(p.sectionId) !== String(section.id)),
    }));
    toast('섹션을 삭제했습니다');

    try {
      await api.deleteSection({ boardId, sectionId: section.id, password: admin.password });
    } catch (err) {
      setData(backup); // 실패 시 원래대로 복구
      handleAuthError(err);
    }
  };

  // ── 렌더 ──
  if (error && !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="text-5xl">😢</span>
        <p className="text-lg font-bold text-slate-700">보드를 불러올 수 없습니다</p>
        <p className="text-sm text-slate-500">{error}</p>
        <div className="flex gap-2">
          <button onClick={() => load()} className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white">다시 시도</button>
          <button onClick={() => navigate(null)} className="rounded-lg bg-slate-200 px-4 py-2 font-semibold text-slate-700">허브로</button>
        </div>
      </div>
    );
  }
  if (!data) {
    return <div className="flex min-h-screen items-center justify-center text-indigo-500"><Spinner className="h-10 w-10" /></div>;
  }

  const { board, sections } = data;

  return (
    <div className={`flex h-[100dvh] flex-col bg-gradient-to-br ${gradientFor(board.id)}`}>
      {/* 상단 바 */}
      <header className="z-20 flex flex-wrap items-center gap-2 bg-black/20 px-3 py-2.5 text-white backdrop-blur-md sm:px-5">
        <button
          onClick={() => navigate(null)}
          className="rounded-lg bg-white/20 px-2.5 py-1.5 text-xs sm:text-sm font-semibold hover:bg-white/30 transition flex items-center gap-1"
          title="관리자 허브로 이동"
        >
          <span>← 허브</span>
        </button>
        <div className="mr-auto min-w-0">
          <h1 className="truncate text-lg font-black leading-tight drop-shadow sm:text-xl">{board.title}</h1>
          {board.description && <p className="truncate text-xs text-white/85">{board.description}</p>}
        </div>
        {syncing && <Spinner className="h-4 w-4 text-white/80" />}
        <button
          onClick={() => setShowShare(true)}
          className="flex items-center gap-1 rounded-lg bg-white/20 px-2.5 py-1.5 text-xs sm:text-sm font-bold hover:bg-white/30 transition"
        >
          <span>📲 QR · 공유</span>
        </button>
        <button
          onClick={() => setShowImport(true)}
          className="rounded-lg bg-white/20 px-2.5 py-1.5 text-xs sm:text-sm font-semibold hover:bg-white/30 transition"
        >
          📥 패들렛 가져오기
        </button>
        {admin.isAdmin ? (
          <button
            onClick={admin.logout}
            className="flex items-center gap-1 rounded-lg bg-amber-300 px-2.5 py-1.5 text-xs sm:text-sm font-bold text-amber-950 hover:bg-amber-200 shadow transition"
          >
            <span>👑 관리자 모드 On</span>
          </button>
        ) : (
          <button
            onClick={() => setShowLogin(true)}
            className="rounded-lg bg-white/90 px-2.5 py-1.5 text-xs sm:text-sm font-bold text-slate-800 hover:bg-white shadow transition"
          >
            🔐 관리자 로그인
          </button>
        )}
      </header>

      {IS_MOCK && <div className="bg-amber-300/90 px-4 py-1 text-center text-xs font-semibold text-amber-900">데모 모드 (localStorage) — 구글 시트 미연결</div>}

      {/* 선반(Shelf): 가로로 나열되는 섹션 열 */}
      <main className="shelf-scroll flex min-h-0 flex-1 items-start gap-4 overflow-x-auto p-4 sm:p-5">
        {sections.map((s) => (
          <Section
            key={s.id}
            section={s}
            posts={postsBySection[String(s.id)] || []}
            isAdmin={admin.isAdmin}
            onAddPost={setComposerSection}
            onDeleteSection={deleteSection}
            onDeletePost={deletePost}
            onImageClick={setLightbox}
          />
        ))}

        {/* 새 섹션 추가 열 */}
        <form onSubmit={addSection} className="w-[85vw] shrink-0 rounded-2xl bg-white/30 p-3.5 ring-1 ring-white/50 backdrop-blur-md sm:w-72">
          <input
            value={newSection}
            onChange={(e) => setNewSection(e.target.value)}
            placeholder="＋ 새 섹션 이름"
            maxLength={200}
            className="w-full rounded-xl bg-white/95 px-3 py-2 text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-white"
          />
          <button
            type="submit"
            disabled={!newSection.trim() || addingSection}
            className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900/80 py-2.5 text-sm font-bold text-white hover:bg-slate-900 disabled:opacity-40 shadow transition"
          >
            {addingSection && <Spinner className="h-4 w-4" />} 섹션 추가
          </button>
        </form>
      </main>

      <PostComposer
        key={composerSection?.id}
        open={!!composerSection}
        section={composerSection}
        onClose={() => setComposerSection(null)}
        onSubmit={createPost}
      />
      <AdminLoginModal
        open={showLogin}
        onClose={() => setShowLogin(false)}
        onLogin={admin.login}
        hint={board.hasOwnPassword ? '보드 전용 비밀번호 또는 마스터 비밀번호를 입력하세요.' : '마스터 관리자 비밀번호를 입력하세요.'}
      />
      <ShareModal
        open={showShare}
        onClose={() => setShowShare(false)}
        url={boardUrl(boardId)}
        title={board.title}
      />
      <CsvImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        boardId={boardId}
        masterPassword={admin.password}
        onDone={() => load(true)}
      />

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" referrerPolicy="no-referrer" className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
        </div>
      )}
    </div>
  );
}
