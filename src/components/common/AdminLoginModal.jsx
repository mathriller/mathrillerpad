import { useState } from 'react';
import Modal from './Modal';
import Spinner from './Spinner';

/**
 * 관리자 로그인 모달
 * @param {(pw: string) => Promise<void>} onLogin  실패 시 throw
 */
export default function AdminLoginModal({ open, onClose, onLogin, hint }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!pw) return;
    setLoading(true);
    setError('');
    try {
      await onLogin(pw);
      setPw('');
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="🔐 관리자 로그인" size="sm">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-500">{hint || '관리자 비밀번호를 입력하면 게시물·섹션 삭제 권한이 활성화됩니다.'}</p>
        <input
          type="password"
          autoFocus
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="비밀번호"
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
        {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
        <button
          type="submit"
          disabled={loading || !pw}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading && <Spinner className="h-4 w-4" />} 로그인
        </button>
      </form>
    </Modal>
  );
}
