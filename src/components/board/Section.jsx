import { useState } from 'react';
import PostCard from './PostCard';

/**
 * 선반(Shelf) 한 열
 *  - 섹션 이름 수정 (인라인 폼)
 *  - 섹션 좌우 순서 이동 (← / →)
 *  - 카드 드래그 앤 드롭 수신 영역 (onDrop)
 */
export default function Section({
  section,
  sectionIndex,
  totalSections,
  sections = [],
  posts = [],
  commentsByPost = {},
  likedPosts = new Set(),
  isAdmin,
  onAddPost,
  onUpdateTitle,
  onMoveSection,
  onReorderSections,
  onDeleteSection,
  onToggleLike,
  onEditRequest,
  onDeleteRequest,
  onMovePost,
  onDropPostOnPost,
  onDropPostOnSection,
  onDropSection,
  onAddComment,
  onDeleteComment,
  onImageClick,
  onRequireAdmin,
}) {
  const [editing, setEditing] = useState(false);
  const [titleInput, setTitleInput] = useState(section.title);
  const [isPostDragOver, setIsPostDragOver] = useState(false);
  const [sectionDragOverPos, setSectionDragOverPos] = useState(null); // 'left' | 'right' | null

  const handleTitleSubmit = (e) => {
    e.preventDefault();
    if (titleInput.trim() && titleInput.trim() !== section.title) {
      onUpdateTitle(section, titleInput.trim());
    }
    setEditing(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // 드래그 중인 타입 식별 시도 (브라우저에 따라 types에 포함)
    const isDraggingSection = e.dataTransfer.types.includes('application/json');
    const rect = e.currentTarget.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const pos = e.clientX < midX ? 'left' : 'right';

    if (sectionDragOverPos !== pos) {
      setSectionDragOverPos(pos);
    }
    if (!isPostDragOver) {
      setIsPostDragOver(true);
    }
  };

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsPostDragOver(false);
      setSectionDragOverPos(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsPostDragOver(false);
    const dropPos = sectionDragOverPos || 'right';
    setSectionDragOverPos(null);

    let raw = e.dataTransfer.getData('application/json');
    let dataObj = null;
    try {
      if (raw) dataObj = JSON.parse(raw);
    } catch {}

    // 1) 섹션 드래그 앤 드롭
    if (dataObj?.type === 'section') {
      const draggedSectionId = dataObj.sectionId;
      if (draggedSectionId && String(draggedSectionId) !== String(section.id)) {
        onDropSection?.(draggedSectionId, section.id, dropPos);
      }
      return;
    }

    // 2) 메모 드래그 앤 드롭 (카드 위에 직접 떨어지지 않고 섹션 빈 공간에 떨어진 경우 맨 아래 추가)
    const postId = dataObj?.postId || e.dataTransfer.getData('text/plain');
    if (postId) {
      onDropPostOnSection?.(postId, section.id);
    }
  };

  const handleGripClick = () => {
    if (!isAdmin) {
      onRequireAdmin?.('섹션 순서를 드래그하여 변경하려면 관리자 로그인이 필요합니다.');
    }
  };

  return (
    <section
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative flex max-h-full w-[85vw] shrink-0 flex-col rounded-2xl bg-white/45 shadow-sm ring-1 ring-white/50 backdrop-blur-md transition sm:w-80 ${
        isPostDragOver ? 'ring-2 ring-indigo-500 bg-indigo-50/60 scale-[1.01]' : ''
      } ${sectionDragOverPos === 'left' ? 'border-l-4 border-indigo-600' : ''} ${
        sectionDragOverPos === 'right' ? 'border-r-4 border-indigo-600' : ''
      }`}
    >
      {/* 섹션 헤더 */}
      <header className="flex items-center gap-1.5 px-3 pb-2 pt-3">
        {/* 섹션 드래그 그립 핸들 (관리자 드래그 가능) */}
        <div
          draggable={isAdmin}
          onDragStart={(e) => {
            if (!isAdmin) {
              e.preventDefault();
              onRequireAdmin?.('섹션 순서를 변경하려면 관리자 로그인이 필요합니다.');
              return;
            }
            e.dataTransfer.setData('text/plain', section.id);
            e.dataTransfer.setData('application/json', JSON.stringify({ type: 'section', sectionId: section.id }));
            e.dataTransfer.effectAllowed = 'move';
          }}
          onClick={handleGripClick}
          title={isAdmin ? '드래그하여 섹션 순서 변경' : '섹션 순서 변경 (관리자 전용)'}
          className={`flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold transition shadow-2xs select-none ${
            isAdmin
              ? 'cursor-grab active:cursor-grabbing bg-white/80 hover:bg-white text-slate-700 hover:text-indigo-600'
              : 'cursor-pointer bg-white/40 text-slate-400 hover:text-slate-600'
          }`}
        >
          ⠿
        </div>

        {/* 섹션 좌우 이동 버튼 */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            disabled={sectionIndex === 0}
            onClick={() => onMoveSection(section, 'left')}
            title="섹션을 왼쪽으로 이동"
            className="flex h-6 w-6 items-center justify-center rounded-md bg-white/70 text-xs font-bold text-slate-600 hover:bg-white disabled:opacity-30 disabled:hover:bg-white/70 shadow-2xs transition"
          >
            ←
          </button>
          <button
            type="button"
            disabled={sectionIndex === totalSections - 1}
            onClick={() => onMoveSection(section, 'right')}
            title="섹션을 오른쪽으로 이동"
            className="flex h-6 w-6 items-center justify-center rounded-md bg-white/70 text-xs font-bold text-slate-600 hover:bg-white disabled:opacity-30 disabled:hover:bg-white/70 shadow-2xs transition"
          >
            →
          </button>
        </div>

        {/* 섹션 타이틀 (인라인 편집 지원) */}
        {editing ? (
          <form onSubmit={handleTitleSubmit} className="min-w-0 flex-1 flex items-center gap-1">
            <input
              autoFocus
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={handleTitleSubmit}
              className="w-full rounded-md border border-indigo-400 bg-white px-2 py-0.5 text-sm font-extrabold text-slate-800 outline-none"
            />
          </form>
        ) : (
          <div className="min-w-0 flex-1 flex items-center gap-1.5 group/t">
            <h3
              onDoubleClick={() => isAdmin && setEditing(true)}
              className="min-w-0 truncate text-base font-extrabold text-slate-800 cursor-pointer"
              title={`${section.title} (더블클릭하여 이름 수정)`}
            >
              {section.title}
            </h3>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                title="섹션 이름 수정"
                className="opacity-0 group-hover/t:opacity-100 text-xs text-slate-500 hover:text-indigo-600 transition"
              >
                ✏️
              </button>
            )}
          </div>
        )}

        <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-bold text-slate-600">{posts.length}</span>

        {isAdmin && (
          <button
            onClick={() => onDeleteSection(section)}
            title="섹션 삭제"
            className="rounded-lg bg-rose-600/90 px-2 py-1 text-xs font-bold text-white shadow hover:bg-rose-700 transition"
          >
            삭제
          </button>
        )}
      </header>

      {/* 카드 목록 영역 */}
      <div className="col-scroll flex-1 space-y-3 overflow-y-auto px-3 pb-2 min-h-24">
        {posts.length === 0 && (
          <div className="py-8 text-center text-xs text-slate-500/80 border-2 border-dashed border-white/40 rounded-xl my-2">
            메모를 추가하거나 끌어다 놓으세요
          </div>
        )}
        {posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            sections={sections}
            comments={commentsByPost[p.id] || []}
            isAdmin={isAdmin}
            isLiked={likedPosts.has(p.id)}
            onToggleLike={onToggleLike}
            onEditRequest={onEditRequest}
            onDeleteRequest={onDeleteRequest}
            onMovePost={onMovePost}
            onDropOnPost={onDropPostOnPost}
            onAddComment={onAddComment}
            onDeleteComment={onDeleteComment}
            onImageClick={onImageClick}
          />
        ))}
      </div>

      {/* 하단 메모 추가 버튼 */}
      <div className="p-3 pt-1">
        <button
          onClick={() => onAddPost(section)}
          className="w-full rounded-xl bg-white/85 py-2.5 text-sm font-bold text-indigo-700 shadow-xs hover:bg-white transition"
        >
          ＋ 메모 추가
        </button>
      </div>
    </section>
  );
}
