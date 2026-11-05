import { useState } from 'react';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';
import { api } from '../../api';

/** 새 보드 만들기 — 생성 시 타임스탬프 기반 고유 ID 가 서버에서 부여됩니다. */
export default function CreateBoardModal({ open, onClose, onCreated, masterPassword }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError('');
    try {
      const board = await api.createBoard({ title, description, adminPassword, password: masterPassword, masterPassword });
      setTitle('');
      setDescription('');
      setAdminPassword('');
      onCreated(board);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const input = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200';

  return (
    <Modal open={open} onClose={onClose} title="✨ 새 보드 만들기" closable={!loading}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-600">보드 제목 *</span>
          <input className={input} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예) 3학년 2반 수학 탐구 보드" maxLength={200} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-600">설명</span>
          <textarea className={`${input} min-h-20`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="보드 소개 (선택)" maxLength={2000} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-600">보드 전용 관리자 비밀번호 (선택)</span>
          <input type="password" className={input} value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="비워두면 마스터 비밀번호로만 관리" />
          <span className="mt-1 block text-xs text-slate-400">마스터 비밀번호는 모든 보드에서 항상 유효합니다. 이 비밀번호는 서버에 해시로 저장됩니다.</span>
        </label>
        {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
        <button type="submit" disabled={loading || !title.trim()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
          {loading && <Spinner className="h-4 w-4" />} 보드 만들기
        </button>
      </form>
    </Modal>
  );
}
