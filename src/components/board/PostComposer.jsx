import { useRef, useState } from 'react';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';
import DrawingCanvas from './DrawingCanvas';
import { fileToImagePayload } from '../../utils/image';

const AUTHOR_KEY = 'mathrillerpad-author';
const TABS = [
  { id: 'none', label: '📝 텍스트만' },
  { id: 'upload', label: '🖼 이미지 업로드' },
  { id: 'drawing', label: '✍️ 직접 그리기' },
];

/**
 * 메모 등록 모달
 *  업로드든 그리기든 백엔드로는 동일한 구조로 전송됩니다:
 *    image: { base64: 'data:image/...;base64,...', mimeType: 'image/png', kind: 'upload' | 'drawing' }
 */
export default function PostComposer({ open, onClose, section, onSubmit }) {
  const [author, setAuthor] = useState(() => localStorage.getItem(AUTHOR_KEY) || '');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tab, setTab] = useState('none');
  const [upload, setUpload] = useState(null); // { base64, mimeType, kind }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const canvasRef = useRef(null);
  const fileRef = useRef(null);

  const reset = () => {
    setTitle('');
    setContent('');
    setTab('none');
    setUpload(null);
    setError('');
    canvasRef.current?.clear();
  };

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
    let image = null;
    if (tab === 'upload' && upload) image = upload;
    if (tab === 'drawing' && canvasRef.current && !canvasRef.current.isEmpty()) {
      // 캔버스 → Base64 PNG (최대 500x500)
      image = { base64: canvasRef.current.getDataURL(), mimeType: 'image/png', kind: 'drawing' };
    }
    if (!content.trim() && !title.trim() && !image) {
      setError('내용을 입력하거나 이미지를 첨부/그려주세요.');
      return;
    }
    setLoading(true);
    try {
      localStorage.setItem(AUTHOR_KEY, author.trim());
      await onSubmit({ title, author, content, image });
      reset();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200';

  return (
    <Modal open={open} onClose={onClose} closable={!loading} size="lg" title={`메모 추가 · ${section?.title ?? ''}`}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <input className={input} value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="작성자 이름" maxLength={100} />
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목 (선택)" maxLength={300} />
        </div>
        <textarea className={`${input} min-h-24`} value={content} onChange={(e) => setContent(e.target.value)} placeholder="내용을 입력하세요" />

        {/* 미디어 선택 탭 */}
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold sm:text-sm ${tab === t.id ? 'bg-white text-indigo-700 shadow' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

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
                <img src={upload.base64} alt="미리보기" className="mx-auto max-h-64 rounded-lg object-contain" />
                <button type="button" onClick={() => setUpload(null)} className="text-sm font-semibold text-rose-600 hover:underline">이미지 제거</button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} className="w-full py-6 text-slate-500 hover:text-indigo-600">
                <span className="block text-3xl">📷</span>
                <span className="text-sm font-semibold">클릭하거나 이미지를 끌어다 놓으세요</span>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
        )}

        {/* 그리기 탭은 언마운트하지 않고 숨김 처리 → 탭 전환해도 그림 유지 */}
        <div className={tab === 'drawing' ? '' : 'hidden'}>
          <DrawingCanvas ref={canvasRef} />
        </div>

        {error && <p className="text-sm font-medium text-rose-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={loading} className="rounded-lg px-4 py-2 font-semibold text-slate-500 hover:bg-slate-100">취소</button>
          <button type="submit" disabled={loading} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
            {loading && <Spinner className="h-4 w-4" />} {loading ? '업로드 중…' : '등록하기'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
