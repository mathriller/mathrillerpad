const KIND_BADGE = {
  drawing: { label: '✍️ 손그림', cls: 'bg-violet-100 text-violet-700' },
  migrated: { label: '📦 패들렛 이전', cls: 'bg-amber-100 text-amber-700' },
};

/** 본문 내 URL 자동 링크 */
function Linkified({ text }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((p, i) =>
    /^https?:\/\//.test(p) ? (
      <a key={i} href={p} target="_blank" rel="noreferrer" className="break-all text-indigo-600 underline">
        {p}
      </a>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function timeAgo(ts) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return new Date(ts).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** 메모 카드 — 관리자 모드에서만 우측 상단 삭제(X) 버튼 노출 */
export default function PostCard({ post, isAdmin, onDelete, onImageClick }) {
  const badge = KIND_BADGE[post.imageKind];
  return (
    <article className="group animate-pop relative overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5 transition hover:shadow-md">
      {isAdmin && (
        <button
          onClick={() => onDelete(post)}
          title="메모 삭제"
          className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-rose-600 text-sm font-bold text-white shadow-md hover:bg-rose-700"
        >
          ✕
        </button>
      )}

      {post.imageUrl && (
        <button type="button" onClick={() => onImageClick(post.imageUrl)} className="block w-full bg-slate-50">
          <img src={post.imageUrl} alt={post.title || '첨부 이미지'} loading="lazy" referrerPolicy="no-referrer" className="max-h-80 w-full object-contain" />
        </button>
      )}

      <div className="space-y-1.5 p-3">
        {post.title && <h4 className="pr-6 font-bold leading-snug text-slate-800">{post.title}</h4>}
        {post.content && (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
            <Linkified text={post.content} />
          </p>
        )}
        {post.linkUrl && (
          <a href={post.linkUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-indigo-600 hover:bg-indigo-50">
            🔗 <span className="truncate">{post.linkUrl}</span>
          </a>
        )}
        <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-400">
          <span className="font-semibold text-slate-500">{post.author || '익명'}</span>
          <span>·</span>
          <span>{timeAgo(post.createdAt)}</span>
          {badge && <span className={`ml-auto rounded-full px-1.5 py-0.5 font-semibold ${badge.cls}`}>{badge.label}</span>}
        </div>
      </div>
    </article>
  );
}
