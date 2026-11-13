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
  onDeleteSection,
  onToggleLike,
  onEditRequest,
  onDeleteRequest,
  onMovePost,
  onAddComment,
  onDeleteComment,
  onDropPost,
  onImageClick,
}) {
  const [editing, setEditing] = useState(false);
  const [titleInput, setTitleInput] = useState(section.title);
  const [isDragOver, setIsDragOver] = useState(false);

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
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const postId = e.dataTransfer.getData('text/plain');
    if (postId) {
      onDropPost(postId, section.id);
    }
  };

  return (
    <section
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex max-h-full w-[85vw] shrink-0 flex-col rounded-2xl bg-white/45 shadow-sm ring-1 ring-white/50 backdrop-blur-md transition sm:w-80 ${
        isDragOver ? 'ring-2 ring-indigo-500 bg-indigo-50/60 scale-[1.01]' : ''
      }`}
    >
      {/* 섹션 헤더 */}
      <header className="flex items-center gap-1.5 px-3 pb-2 pt-3">
        {/* 섹션 좌우 이동 버튼 (관리자 또는 누구나) */}
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
            메모를 추가하거나 다른 섹션에서 끌어다 놓으세요
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
