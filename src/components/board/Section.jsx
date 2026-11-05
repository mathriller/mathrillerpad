import PostCard from './PostCard';

/** 선반(Shelf) 한 열 — 섹션 제목 / 카드 목록 / 하단 메모 추가 버튼 */
export default function Section({ section, posts, isAdmin, onAddPost, onDeleteSection, onDeletePost, onImageClick }) {
  return (
    <section className="flex max-h-full w-[85vw] shrink-0 flex-col rounded-2xl bg-white/45 shadow-sm ring-1 ring-white/50 backdrop-blur-md sm:w-80">
      <header className="flex items-center gap-2 px-3 pb-2 pt-3">
        <h3 className="min-w-0 flex-1 truncate text-base font-extrabold text-slate-800" title={section.title}>
          {section.title}
        </h3>
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold text-slate-500">{posts.length}</span>
        {isAdmin && (
          <button
            onClick={() => onDeleteSection(section)}
            title="섹션 삭제"
            className="rounded-lg bg-rose-600 px-2 py-1 text-xs font-semibold text-white shadow hover:bg-rose-700"
          >
            섹션 삭제
          </button>
        )}
      </header>

      <div className="col-scroll flex-1 space-y-2.5 overflow-y-auto px-3 pb-2">
        {posts.length === 0 && <p className="py-6 text-center text-sm text-slate-500/80">아직 메모가 없어요</p>}
        {posts.map((p) => (
          <PostCard key={p.id} post={p} isAdmin={isAdmin} onDelete={onDeletePost} onImageClick={onImageClick} />
        ))}
      </div>

      <div className="p-3 pt-1">
        <button
          onClick={() => onAddPost(section)}
          className="w-full rounded-xl bg-white/80 py-2.5 text-sm font-bold text-indigo-700 shadow-sm hover:bg-white"
        >
          ＋ 메모 추가
        </button>
      </div>
    </section>
  );
}
