import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import { IS_MOCK, POLL_INTERVAL } from '../../config';
import { useAdmin } from '../../hooks/useAdmin';
import { boardUrl } from '../../hooks/useBoardRoute';
import AdminLoginModal from '../common/AdminLoginModal';
import PasswordPromptModal from '../common/PasswordPromptModal';
import ShareModal from '../common/ShareModal';
import Spinner from '../common/Spinner';
import { useToast } from '../common/Toast';
import { gradientFor } from '../hub/HubPage';
import CsvImportModal from './CsvImportModal';
import PostComposer from './PostComposer';
import PostEditModal from './PostEditModal';
import Section from './Section';

const LIKES_KEY = 'mathrillerpad-likes-v1';

/** 개별 보드 화면 (?board=보드ID) */
export default function BoardPage({ boardId, navigate }) {
  const toast = useToast();
  const admin = useAdmin(boardId);
  const [data, setData] = useState(null); // { board, sections, posts, comments }
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);

  // 모달 상태
  const [composerSection, setComposerSection] = useState(null);
  const [editingPost, setEditingPost] = useState(null);
  const [confirmedPassword, setConfirmedPassword] = useState('');
  const [knownPasswords, setKnownPasswords] = useState({}); // { [postId]: verifiedPassword }
  const [promptModal, setPromptModal] = useState({ open: false, post: null, action: 'edit', pendingMove: null });
  const [showLogin, setShowLogin] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  // 새 섹션 추가 상태
  const [newSection, setNewSection] = useState('');
  const [addingSection, setAddingSection] = useState(false);

  // 좋아요 누른 게시물 목록 (localStorage)
  const [likedPosts, setLikedPosts] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(LIKES_KEY) || '[]'));
    } catch {
      return new Set();
    }
  });

  const persistLikedPosts = (nextSet) => {
    try {
      localStorage.setItem(LIKES_KEY, JSON.stringify([...nextSet]));
    } catch { /* ignore */ }
    setLikedPosts(new Set(nextSet));
  };

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
    data?.posts?.forEach((p) => {
      const sId = String(p.sectionId);
      (m[sId] ||= []).push(p);
    });
    return m;
  }, [data]);

  const commentsByPost = useMemo(() => {
    const m = {};
    data?.comments?.forEach((c) => {
      const pId = String(c.postId);
      (m[pId] ||= []).push(c);
    });
    return m;
  }, [data]);

  const handleAuthError = (err) => {
    toast(err.message, 'error');
    if (err.message.includes('권한') || err.message.includes('비밀번호')) {
      admin.logout();
    }
  };

  // ───────────────────────── 섹션 액션 ─────────────────────────
  const addSection = async (e) => {
    e.preventDefault();
    if (!newSection.trim()) return;
    setAddingSection(true);
    try {
      const s = await api.createSection({ boardId, title: newSection });
      ++reqSeqRef.current;
      setData((d) => ({ ...d, sections: [...d.sections, s] }));
      setNewSection('');
      toast('새 섹션이 추가되었습니다');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setAddingSection(false);
    }
  };

  const handleUpdateSectionTitle = async (section, newTitle) => {
    if (!newTitle.trim() || newTitle.trim() === section.title) return;
    ++reqSeqRef.current;
    const backup = data;
    setData((d) => ({
      ...d,
      sections: d.sections.map((s) => (s.id === section.id ? { ...s, title: newTitle.trim() } : s)),
    }));
    toast('섹션 이름이 변경되었습니다');
    try {
      await api.updateSection({ boardId, sectionId: section.id, title: newTitle.trim(), password: admin.password });
    } catch (err) {
      setData(backup);
      handleAuthError(err);
    }
  };

  const handleMoveSection = async (section, direction) => {
    const list = [...(data?.sections || [])];
    const idx = list.findIndex((s) => s.id === section.id);
    if (idx < 0) return;
    const targetIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;

    const temp = list[idx];
    list[idx] = list[targetIdx];
    list[targetIdx] = temp;
    const reordered = list.map((s, i) => ({ ...s, order: i }));

    ++reqSeqRef.current;
    const backup = data;
    setData((d) => ({ ...d, sections: reordered }));
    try {
      await api.reorderSections({ boardId, sectionIds: reordered.map((s) => s.id), password: admin.password });
    } catch (err) {
      setData(backup);
      handleAuthError(err);
    }
  };

  const deleteSection = async (section) => {
    const n = postsBySection[String(section.id)]?.length || 0;
    if (!confirm(`"${section.title}" 섹션${n ? `과 메모 ${n}개` : ''}를 삭제할까요?`)) return;

    ++reqSeqRef.current;
    const backup = data;
    setData((d) => ({
      ...d,
      sections: d.sections.filter((s) => String(s.id) !== String(section.id)),
      posts: d.posts.filter((p) => String(p.sectionId) !== String(section.id)),
    }));
    toast('섹션을 삭제했습니다');

    try {
      await api.deleteSection({ boardId, sectionId: section.id, password: admin.password });
    } catch (err) {
      setData(backup);
      handleAuthError(err);
    }
  };

  // ───────────────────────── 메모 액션 ─────────────────────────
  const createPost = async (payload) => {
    const post = await api.createPost({ boardId, sectionId: composerSection.id, ...payload });
    ++reqSeqRef.current;
    if (payload.password) {
      setKnownPasswords((prev) => ({ ...prev, [post.id]: payload.password }));
    }
    setData((d) => ({ ...d, posts: [...d.posts, post] }));
    toast('메모가 등록되었습니다');
  };

  const doMovePost = async (postId, targetSectionId, newOrder, orderedPostIds, password) => {
    const post = data?.posts?.find((p) => String(p.id) === String(postId));
    if (!post) return;

    ++reqSeqRef.current;
    const backup = data;

    setData((d) => {
      const updatedPosts = d.posts.map((p) => {
        if (String(p.id) === String(postId)) {
          return {
            ...p,
            sectionId: targetSectionId,
            order: typeof newOrder === 'number' ? newOrder : p.order,
          };
        }
        if (Array.isArray(orderedPostIds)) {
          const idx = orderedPostIds.indexOf(p.id);
          if (idx !== -1) {
            return { ...p, order: idx };
          }
        }
        return p;
      });
      return { ...d, posts: updatedPosts };
    });

    try {
      await api.movePost({
        boardId,
        postId,
        targetSectionId,
        newOrder,
        orderedPostIds,
        password: password || admin.password,
      });
      toast('메모를 이동했습니다');
    } catch (err) {
      setData(backup);
      handleAuthError(err);
      throw err;
    }
  };

  const handleMovePost = async (postOrId, targetSectionId, newOrder, orderedPostIds) => {
    const postId = typeof postOrId === 'string' ? postOrId : postOrId.id;
    const currentPost = data?.posts?.find((p) => String(p.id) === String(postId));
    if (!currentPost) return;

    // 관리자면 즉시 이동
    if (admin.isAdmin) {
      return doMovePost(postId, targetSectionId, newOrder, orderedPostIds, admin.password);
    }

    // 관리자가 아닌 경우: 암호가 없는 메모는 이동 불가
    if (!currentPost.hasPassword) {
      toast('비밀번호가 설정되지 않은 메모는 관리자만 이동할 수 있습니다.', 'info');
      setShowLogin(true);
      return;
    }

    // 이미 이번 세션에서 확인된 작성자 암호가 있는 경우 바로 이동
    const cachedPw = knownPasswords[postId];
    if (cachedPw) {
      try {
        return await doMovePost(postId, targetSectionId, newOrder, orderedPostIds, cachedPw);
      } catch {
        // 캐시된 비밀번호가 틀렸다면 캐시 삭제 후 모달 띄움
        setKnownPasswords((prev) => {
          const next = { ...prev };
          delete next[postId];
          return next;
        });
      }
    }

    // 암호 확인 모달 오픈
    setPromptModal({
      open: true,
      post: currentPost,
      action: 'move',
      pendingMove: { postId, targetSectionId, newOrder, orderedPostIds },
    });
  };

  // 메모 카드 위에 다른 메모 카드를 떨어뜨렸을 때 (위/아래 순서 변경 및 섹션 이동)
  const handleDropPostOnPost = (draggedPostId, targetPost, dropPosition) => {
    if (String(draggedPostId) === String(targetPost.id)) return;
    const draggedPost = data?.posts?.find((p) => String(p.id) === String(draggedPostId));
    if (!draggedPost) return;

    const targetSectionId = targetPost.sectionId;
    const currentList = (postsBySection[String(targetSectionId)] || []).filter(
      (p) => String(p.id) !== String(draggedPostId),
    );
    const targetIdx = currentList.findIndex((p) => String(p.id) === String(targetPost.id));
    const insertIdx = dropPosition === 'top' ? Math.max(0, targetIdx) : targetIdx + 1;

    const newOrderedList = [...currentList];
    newOrderedList.splice(insertIdx, 0, draggedPost);
    const orderedPostIds = newOrderedList.map((p) => p.id);

    handleMovePost(draggedPostId, targetSectionId, insertIdx, orderedPostIds);
  };

  // 섹션 빈 공간에 메모를 떨어뜨렸을 때 (맨 아래 추가)
  const handleDropPostOnSection = (draggedPostId, targetSectionId) => {
    const draggedPost = data?.posts?.find((p) => String(p.id) === String(draggedPostId));
    if (!draggedPost) return;

    const currentList = (postsBySection[String(targetSectionId)] || []).filter(
      (p) => String(p.id) !== String(draggedPostId),
    );
    const insertIdx = currentList.length;
    const newOrderedList = [...currentList, draggedPost];
    const orderedPostIds = newOrderedList.map((p) => p.id);

    handleMovePost(draggedPostId, targetSectionId, insertIdx, orderedPostIds);
  };

  // 섹션을 드래그하여 다른 섹션 옆으로 이동했을 때 (좌우 순서 변경)
  const handleDropSection = async (draggedSectionId, targetSectionId, dropPosition) => {
    if (!admin.isAdmin) {
      setShowLogin(true);
      toast('섹션 순서 변경은 관리자 로그인 후 가능합니다.', 'info');
      return;
    }
    if (String(draggedSectionId) === String(targetSectionId)) return;

    const list = [...(data?.sections || [])];
    const draggedIdx = list.findIndex((s) => String(s.id) === String(draggedSectionId));
    if (draggedIdx === -1) return;
    const [draggedSection] = list.splice(draggedIdx, 1);

    const targetIdx = list.findIndex((s) => String(s.id) === String(targetSectionId));
    if (targetIdx === -1) return;
    const insertIdx = dropPosition === 'left' ? targetIdx : targetIdx + 1;
    list.splice(insertIdx, 0, draggedSection);

    const reordered = list.map((s, i) => ({ ...s, order: i }));
    ++reqSeqRef.current;
    const backup = data;
    setData((d) => ({ ...d, sections: reordered }));
    toast('섹션 순서를 변경했습니다');

    try {
      await api.reorderSections({ boardId, sectionIds: reordered.map((s) => s.id), password: admin.password });
    } catch (err) {
      setData(backup);
      handleAuthError(err);
    }
  };

  // 하트 좋아요 토글
  const handleToggleLike = async (post) => {
    const isLiked = likedPosts.has(post.id);
    const delta = isLiked ? -1 : 1;
    const nextLikes = new Set(likedPosts);
    if (isLiked) nextLikes.delete(post.id);
    else nextLikes.add(post.id);
    persistLikedPosts(nextLikes);

    // 낙관적 업데이트
    setData((d) => ({
      ...d,
      posts: d.posts.map((p) =>
        p.id === post.id ? { ...p, likes: Math.max(0, (p.likes || 0) + delta) } : p,
      ),
    }));

    try {
      await api.likePost({ boardId, postId: post.id, delta });
    } catch {
      // 실패 시 롤백
      const rollSet = new Set(likedPosts);
      persistLikedPosts(rollSet);
      setData((d) => ({
        ...d,
        posts: d.posts.map((p) =>
          p.id === post.id ? { ...p, likes: post.likes || 0 } : p,
        ),
      }));
    }
  };

  // 수정 요청
  const handleEditRequest = (post) => {
    if (admin.isAdmin) {
      setConfirmedPassword(admin.password);
      setEditingPost(post);
    } else if (post.hasPassword) {
      setPromptModal({ open: true, post, action: 'edit' });
    } else {
      setShowLogin(true);
      toast('작성 시 비밀번호를 설정하지 않은 메모는 관리자만 수정할 수 있습니다.', 'info');
    }
  };

  // 삭제 요청
  const handleDeleteRequest = async (post) => {
    if (admin.isAdmin) {
      if (!confirm('이 메모를 삭제할까요?')) return;
      ++reqSeqRef.current;
      const backup = data;
      setData((d) => ({ ...d, posts: d.posts.filter((p) => String(p.id) !== String(post.id)) }));
      toast('메모를 삭제했습니다');
      try {
        await api.deletePost({ boardId, postId: post.id, password: admin.password });
      } catch (err) {
        setData(backup);
        handleAuthError(err);
      }
    } else if (post.hasPassword) {
      setPromptModal({ open: true, post, action: 'delete' });
    } else {
      setShowLogin(true);
      toast('작성 시 비밀번호를 설정하지 않은 메모는 관리자만 삭제할 수 있습니다.', 'info');
    }
  };

  // 비밀번호 입력 모달 제출
  const handlePromptSubmit = async (password) => {
    const post = promptModal.post;
    if (!post) return;

    if (promptModal.action === 'edit') {
      const { valid } = await api.verifyPostPassword({ postId: post.id, password });
      if (!valid) throw new Error('비밀번호가 일치하지 않습니다.');
      setKnownPasswords((prev) => ({ ...prev, [post.id]: password }));
      setConfirmedPassword(password);
      setEditingPost(post);
    } else if (promptModal.action === 'delete') {
      ++reqSeqRef.current;
      const backup = data;
      setData((d) => ({ ...d, posts: d.posts.filter((p) => String(p.id) !== String(post.id)) }));
      try {
        await api.deletePost({ boardId, postId: post.id, password });
        toast('메모를 삭제했습니다');
      } catch (err) {
        setData(backup);
        throw err;
      }
    } else if (promptModal.action === 'move') {
      const { postId, targetSectionId, newOrder, orderedPostIds } = promptModal.pendingMove;
      await doMovePost(postId, targetSectionId, newOrder, orderedPostIds, password);
      setKnownPasswords((prev) => ({ ...prev, [postId]: password }));
    }
  };

  // 메모 수정 실행
  const handleUpdatePost = async (payload) => {
    const updated = await api.updatePost({ boardId, ...payload });
    ++reqSeqRef.current;
    setData((d) => ({
      ...d,
      posts: d.posts.map((p) => (p.id === updated.id ? updated : p)),
    }));
    toast('메모가 수정되었습니다');
  };

  // ───────────────────────── 댓글 액션 ─────────────────────────
  const handleAddComment = async (post, author, content) => {
    try {
      const comment = await api.createComment({ boardId, postId: post.id, author, content });
      ++reqSeqRef.current;
      setData((d) => ({ ...d, comments: [...(d.comments || []), comment] }));
      toast('댓글을 등록했습니다');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleDeleteComment = async (comment) => {
    if (!confirm('이 댓글을 삭제할까요?')) return;
    ++reqSeqRef.current;
    const backup = data;
    setData((d) => ({ ...d, comments: (d.comments || []).filter((c) => c.id !== comment.id) }));
    toast('댓글을 삭제했습니다');
    try {
      await api.deleteComment({ boardId, commentId: comment.id, password: admin.password });
    } catch (err) {
      setData(backup);
      handleAuthError(err);
    }
  };

  // ───────────────────────── 렌더 ─────────────────────────
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
        {sections.map((s, idx) => (
          <Section
            key={s.id}
            section={s}
            sectionIndex={idx}
            totalSections={sections.length}
            sections={sections}
            posts={postsBySection[String(s.id)] || []}
            commentsByPost={commentsByPost}
            likedPosts={likedPosts}
            isAdmin={admin.isAdmin}
            onAddPost={setComposerSection}
            onUpdateTitle={handleUpdateSectionTitle}
            onMoveSection={handleMoveSection}
            onDeleteSection={deleteSection}
            onToggleLike={handleToggleLike}
            onEditRequest={handleEditRequest}
            onDeleteRequest={handleDeleteRequest}
            onMovePost={handleMovePost}
            onDropPostOnPost={handleDropPostOnPost}
            onDropPostOnSection={handleDropPostOnSection}
            onDropSection={handleDropSection}
            onAddComment={handleAddComment}
            onDeleteComment={handleDeleteComment}
            onImageClick={setLightbox}
            onRequireAdmin={(msg) => {
              setShowLogin(true);
              if (msg) toast(msg, 'info');
            }}
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

      {/* 메모 등록 모달 */}
      <PostComposer
        key={composerSection?.id}
        open={!!composerSection}
        section={composerSection}
        onClose={() => setComposerSection(null)}
        onSubmit={createPost}
      />

      {/* 메모 수정 모달 */}
      <PostEditModal
        key={editingPost?.id}
        open={!!editingPost}
        post={editingPost}
        sections={sections}
        password={confirmedPassword}
        onClose={() => { setEditingPost(null); setConfirmedPassword(''); }}
        onSubmit={handleUpdatePost}
      />

      {/* 작성자 비밀번호 확인 모달 */}
      <PasswordPromptModal
        open={promptModal.open}
        onClose={() => setPromptModal({ open: false, post: null, action: 'edit', pendingMove: null })}
        title={
          promptModal.action === 'edit'
            ? '✏️ 메모 수정 비밀번호'
            : promptModal.action === 'delete'
            ? '🗑️ 메모 삭제 비밀번호'
            : '↔️ 메모 이동 비밀번호'
        }
        actionLabel={
          promptModal.action === 'edit'
            ? '수정하기'
            : promptModal.action === 'delete'
            ? '삭제하기'
            : '이동하기'
        }
        hint={
          promptModal.action === 'edit'
            ? '이 메모를 등록할 때 설정한 비밀번호를 입력해 주세요.'
            : promptModal.action === 'delete'
            ? '이 메모를 등록할 때 설정한 비밀번호를 입력하면 바로 삭제됩니다.'
            : '이 메모를 이동하려면 작성할 때 설정한 비밀번호를 입력해 주세요.'
        }
        onSubmit={handlePromptSubmit}
      />

      {/* 관리자 로그인 모달 */}
      <AdminLoginModal
        open={showLogin}
        onClose={() => setShowLogin(false)}
        onLogin={admin.login}
        hint={board.hasOwnPassword ? '보드 전용 비밀번호 또는 마스터 비밀번호를 입력하세요.' : '마스터 관리자 비밀번호를 입력하세요.'}
      />

      {/* 공유 모달 */}
      <ShareModal
        open={showShare}
        onClose={() => setShowShare(false)}
        url={boardUrl(boardId)}
        title={board.title}
      />

      {/* 패들렛 가져오기 모달 */}
      <CsvImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        boardId={boardId}
        masterPassword={admin.password}
        onDone={() => load(true)}
      />

      {/* 라이트박스 (이미지 확대 보기) */}
      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" referrerPolicy="no-referrer" className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
        </div>
      )}
    </div>
  );
}
