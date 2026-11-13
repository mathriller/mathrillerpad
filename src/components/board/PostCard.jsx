import { useState } from 'react';
import Spinner from '../common/Spinner';

const KIND_BADGE = {
  drawing: { label: '✍️ 손그림', cls: 'bg-violet-100 text-violet-700' },
  migrated: { label: '📦 패들렛 이전', cls: 'bg-amber-100 text-amber-700' },
};

const AUTHOR_KEY = 'mathrillerpad-author';

/** 본문 내 URL 자동 링크 */
function Linkified({ text }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((p, i) =>
    /^https?:\/\//.test(p) ? (
      <a key={i} href={p} target="_blank" rel="noreferrer" className="break-all text-indigo-600 underline hover:text-indigo-800">
        {p}
      </a>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return new Date(ts).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * 메모 카드 컴포넌트
 *  - ❤️ 하트 좋아요
 *  - 💬 댓글 펼치기 & 등록
 *  - ✏️ 수정 & 🗑️ 삭제 (작성자 암호 또는 관리자)
 *  - ↔️ 섹션 이동 메뉴 & 드래그 앤 드롭
 */
export default function PostCard({
  post,
  sections = [],
  comments = [],
  isAdmin,
  isLiked,
  onToggleLike,
  onEditRequest,
  onDeleteRequest,
  onMovePost,
  onDropOnPost,
  onAddComment,
  onDeleteComment,
  onImageClick,
}) {
  const badge = KIND_BADGE[post.imageKind];
  const [showComments, setShowComments] = useState(false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [dragOverPosition, setDragOverPosition] = useState(null); // 'top' | 'bottom' | null

  // 댓글 입력 상태
  const [commentAuthor, setCommentAuthor] = useState(() => localStorage.getItem(AUTHOR_KEY) || '');
  const [commentContent, setCommentContent] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const postComments = comments || [];

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!commentContent.trim()) return;
    setCommentSubmitting(true);
    try {
      if (commentAuthor.trim()) {
        localStorage.setItem(AUTHOR_KEY, commentAuthor.trim());
      }
      await onAddComment(post, commentAuthor.trim(), commentContent.trim());
      setCommentContent('');
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleDragStart = (e) => {
    e.dataTransfer.setData('text/plain', post.id);
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'post', postId: post.id, sectionId: post.sectionId }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const pos = e.clientY < midY ? 'top' : 'bottom';
    if (dragOverPosition !== pos) {
      setDragOverPosition(pos);
    }
  };

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverPosition(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = dragOverPosition || 'bottom';
    setDragOverPosition(null);
    let draggedPostId = e.dataTransfer.getData('text/plain');
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (raw) {
        const json = JSON.parse(raw);
        if (json.type === 'section') return;
        if (json.postId) draggedPostId = json.postId;
      }
    } catch {}
    if (draggedPostId && String(draggedPostId) !== String(post.id)) {
      onDropOnPost?.(draggedPostId, post, pos);
    }
  };

  return (
    <article
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`group animate-pop relative overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-black/5 transition hover:shadow-md cursor-grab active:cursor-grabbing ${
        dragOverPosition === 'top' ? 'ring-2 ring-indigo-500 translate-y-0.5' : ''
      } ${dragOverPosition === 'bottom' ? 'ring-2 ring-indigo-500 -translate-y-0.5' : ''}`}
    >
      {/* 위/아래 드롭 위치 안내선 */}
      {dragOverPosition === 'top' && (
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-30 h-1.5 bg-indigo-600 shadow-md animate-pulse" />
      )}
      {dragOverPosition === 'bottom' && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-30 h-1.5 bg-indigo-600 shadow-md animate-pulse" />
      )}
      {/* 카드 상단 제어 바 (수정 / 삭제 / 섹션 이동) */}
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1 opacity-90 sm:opacity-0 group-hover:opacity-100 transition">
        {/* 섹션 이동 메뉴 버튼 */}
        {sections.length > 1 && (
          <div className="relative">
            <button
              onClick={() => setShowMoveMenu(!showMoveMenu)}
              title="다른 섹션으로 이동"
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-xs text-slate-600 shadow hover:bg-white hover:text-indigo-600 transition"
            >
              ↔️
            </button>
            {showMoveMenu && (
              <div
                className="absolute right-0 top-8 z-30 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-2 py-1 text-[11px] font-bold text-slate-400">섹션 선택</div>
                {sections.map((s) => (
                  <button
                    key={s.id}
                    disabled={s.id === post.sectionId}
                    onClick={() => {
                      onMovePost(post, s.id);
                      setShowMoveMenu(false);
                    }}
                    className={`w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold truncate transition ${
                      s.id === post.sectionId ? 'bg-indigo-50 text-indigo-600 font-bold' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {s.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 수정 버튼: 관리자이거나 암호가 설정되어 있으면 항상 노출, 누구나 수정 시도 가능 */}
        <button
          onClick={() => onEditRequest(post)}
          title={post.hasPassword ? '메모 수정 (비밀번호 필요)' : (isAdmin ? '메모 수정' : '메모 수정 (관리자 전용)')}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-xs text-slate-600 shadow hover:bg-white hover:text-indigo-600 transition"
        >
          ✏️
        </button>

        {/* 삭제 버튼: 관리자이거나 암호가 설정되어 있는 경우 */}
        {(isAdmin || post.hasPassword) && (
          <button
            onClick={() => onDeleteRequest(post)}
            title="메모 삭제"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-600 text-xs font-bold text-white shadow hover:bg-rose-700 transition"
          >
            ✕
          </button>
        )}
      </div>

      {/* 첨부 이미지 */}
      {post.imageUrl && (
        <button type="button" onClick={() => onImageClick(post.imageUrl)} className="block w-full bg-slate-50 cursor-zoom-in">
          <img
            src={post.imageUrl}
            alt={post.title || '첨부 이미지'}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="max-h-80 w-full object-contain"
          />
        </button>
      )}

      {/* 본문 콘텐츠 */}
      <div className="space-y-1.5 p-3.5">
        {post.title && <h4 className="pr-12 font-bold leading-snug text-slate-800">{post.title}</h4>}
        {post.content && (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
            <Linkified text={post.content} />
          </p>
        )}
        {post.linkUrl && (
          <a
            href={post.linkUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 truncate rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-indigo-600 hover:bg-indigo-50"
          >
            🔗 <span className="truncate">{post.linkUrl}</span>
          </a>
        )}

        {/* 작성자 & 시간 & 뱃지 */}
        <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-400">
          <span className="font-semibold text-slate-600">{post.author || '익명'}</span>
          {post.hasPassword && <span title="비밀번호 설정됨">🔒</span>}
          <span>·</span>
          <span>{timeAgo(post.createdAt)}</span>
          {badge && <span className={`ml-auto rounded-full px-1.5 py-0.5 font-semibold ${badge.cls}`}>{badge.label}</span>}
        </div>

        {/* 하단 인터랙션 바: ❤️ 좋아요 + 💬 댓글 버튼 */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 text-xs">
          <button
            type="button"
            onClick={() => onToggleLike(post)}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-bold transition ${
              isLiked
                ? 'bg-rose-50 text-rose-600'
                : 'text-slate-500 hover:bg-slate-100 hover:text-rose-500'
            }`}
          >
            <span>{isLiked ? '❤️' : '🤍'}</span>
            <span>{post.likes || 0}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowComments(!showComments)}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold transition ${
              showComments || postComments.length > 0
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-slate-500 hover:bg-slate-100 hover:text-indigo-600'
            }`}
          >
            <span>💬</span>
            <span>댓글 {postComments.length}</span>
          </button>
        </div>

        {/* 댓글 아코디언 영역 */}
        {showComments && (
          <div className="mt-2.5 space-y-2 rounded-xl bg-slate-50 p-2.5 border border-slate-200/80">
            {/* 기존 댓글 목록 */}
            <div className="max-h-44 space-y-1.5 overflow-y-auto pr-0.5">
              {postComments.length === 0 ? (
                <p className="py-2 text-center text-xs text-slate-400">첫 번째 댓글을 남겨보세요!</p>
              ) : (
                postComments.map((c) => (
                  <div key={c.id} className="group/c rounded-lg bg-white p-2 text-xs shadow-2xs border border-slate-100">
                    <div className="flex items-center justify-between font-semibold text-slate-700">
                      <span>{c.author || '익명'}</span>
                      <div className="flex items-center gap-1 text-[10px] text-slate-400">
                        <span>{timeAgo(c.createdAt)}</span>
                        {isAdmin && (
                          <button
                            onClick={() => onDeleteComment(c)}
                            title="댓글 삭제"
                            className="text-slate-300 hover:text-rose-600 font-bold px-1"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap text-slate-600 break-words">{c.content}</p>
                  </div>
                ))
              )}
            </div>

            {/* 댓글 작성 폼 */}
            <form onSubmit={handleCommentSubmit} className="space-y-1.5 pt-1 border-t border-slate-200">
              <input
                value={commentAuthor}
                onChange={(e) => setCommentAuthor(e.target.value)}
                placeholder="내 이름"
                maxLength={50}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-indigo-500"
              />
              <div className="flex gap-1.5">
                <input
                  value={commentContent}
                  onChange={(e) => setCommentContent(e.target.value)}
                  placeholder="댓글을 입력하세요..."
                  maxLength={500}
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={commentSubmitting || !commentContent.trim()}
                  className="flex items-center gap-1 shrink-0 rounded-lg bg-indigo-600 px-3 py-1 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-40"
                >
                  {commentSubmitting && <Spinner className="h-3 w-3 text-white" />} 등록
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </article>
  );
}
