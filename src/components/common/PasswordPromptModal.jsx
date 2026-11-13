import { useState } from 'react';
import Modal from './Modal';
import Spinner from './Spinner';

/**
 * 게시물 작성자 비밀번호 확인 모달 (수정 / 삭제 시)
 */
export default function PasswordPromptModal({ open, onClose, onSubmit, title = '🔒 비밀번호 확인', actionLabel = '확인', hint }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      await onSubmit(password);
      setPassword('');
      onClose();
    } catch (err) {
      setError(err.message || '비밀번호가 올바르지 않습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
          {hint || '메모 등록 시 설정한 비밀번호를 입력해 주세요.'}
        </p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호 입력"
          className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
        {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={loading || !password}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 shadow-sm"
          >
            {loading && <Spinner className="h-3.5 w-3.5 text-white" />} {actionLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
