import { useRef, useState } from 'react';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';
import DrawingCanvas from './DrawingCanvas';
import { fileToImagePayload } from '../../utils/image';

const TABS = [
  { id: 'keep', label: '🖼 기존 유지' },
  { id: 'upload', label: '📷 새 이미지' },
  { id: 'drawing', label: '✍️ 새로 그리기' },
  { id: 'remove', label: '❌ 이미지 삭제' },
];

/**
 * 메모 수정 모달
 */
export default function PostEditModal({ open, onClose, post, sections = [], password, onSubmit }) {
  const [author, setAuthor] = useState(() => post?.author || '');
  const [title, setTitle] = useState(() => post?.title || '');
  const [content, setContent] = useState(() => post?.content || '');
  const [sectionId, setSectionId] = useState(() => post?.sectionId || '');
  const [tab, setTab] = useState('keep');
  const [upload, setUpload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canvasRef = useRef(null);
  const fileRef = useRef(null);

  if (!post) return null;

  const onFile = async (file) => {
    if (!file) return;
    setError('');
    try {
      setUpload(await fileToImagePayload(file));
    } catch (err) {
      setError(err.message);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    let imagePayload = null;

    if (tab === 'upload' && upload) {
      imagePayload = upload;
    } else if (tab === 'drawing' && canvasRef.current && !canvasRef.current.isEmpty()) {
      imagePayload = { base64: canvasRef.current.getDataURL(), mimeType: 'image/png', kind: 'drawing' };
    } else if (tab === 'remove') {
      imagePayload = { remove: true };
    }

    setLoading(true);
    try {
      await onSubmit({
        postId: post.id,
        title,
        author,
        content,
        sectionId,
        image: imagePayload,
        password,
      });
      onClose();
    } catch (err) {
      setError(err.message || '수정에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

  return (
    <Modal open={open} onClose={onClose} closable={!loading} size="lg" title="✏️ 메모 수정">
      <form onSubmit={submit} className="space-y-3.5">
        <div className="grid gap-2.5 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-600">섹션</span>
            <select
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              className={inputCls}
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-600">작성자</span>
            <input
              className={inputCls}
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              maxLength={100}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-600">제목 (선택)</span>
            <input
              className={inputCls}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={300}
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-600">내용</span>
          <textarea
            className={`${inputCls} min-h-24`}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </label>

        {/* 이미지 관리 탭 */}
        <div>
          <span className="mb-1.5 block text-xs font-bold text-slate-600">이미지 첨부 관리</span>
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-bold transition ${
                  tab === t.id ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'keep' && post.imageUrl && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
            <img src={post.imageUrl} alt="기존 이미지" className="mx-auto max-h-48 rounded-lg object-contain" />
            <p className="mt-1 text-xs text-slate-400">현재 이미지가 그대로 유지됩니다.</p>
          </div>
        )}

        {tab === 'upload' && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onFile(e.dataTransfer.files?.[0]);
            }}
            className="rounded-xl border-2 border-dashed border-slate-300 p-4 text-center"
          >
            {upload ? (
              <div className="space-y-2">
                <img src={upload.base64} alt="새 미리보기" className="mx-auto max-h-48 rounded-lg object-contain" />
                <button type="button" onClick={() => setUpload(null)} className="text-xs font-bold text-rose-600 hover:underline">
                  다른 이미지 선택
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} className="w-full py-5 text-slate-500 hover:text-indigo-600">
                <span className="block text-3xl">📷</span>
                <span className="text-xs font-bold">새 이미지 파일 선택 또는 끌어다 놓기</span>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
        )}

        <div className={tab === 'drawing' ? '' : 'hidden'}>
          <DrawingCanvas ref={canvasRef} />
        </div>

        {tab === 'remove' && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center text-xs font-semibold text-rose-700">
            저장 시 기존 이미지가 삭제됩니다.
          </div>
        )}

        {error && <p className="text-xs font-bold text-rose-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 shadow-md shadow-indigo-200"
          >
            {loading && <Spinner className="h-3.5 w-3.5 text-white" />}
            {loading ? '저장 중…' : '수정 완료'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
