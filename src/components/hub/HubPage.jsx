import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { IS_MOCK } from '../../config';
import { useAdmin } from '../../hooks/useAdmin';
import { boardUrl } from '../../hooks/useBoardRoute';
import ShareModal from '../common/ShareModal';
import Spinner from '../common/Spinner';
import { useToast } from '../common/Toast';
import CreateBoardModal from './CreateBoardModal';
import CsvImportModal from '../board/CsvImportModal';

const GRADIENTS = [
  'from-indigo-500 to-purple-500',
  'from-sky-500 to-cyan-400',
  'from-emerald-500 to-teal-400',
  'from-orange-500 to-amber-400',
  'from-rose-500 to-pink-400',
  'from-fuchsia-500 to-violet-500',
];
export const gradientFor = (id = '') => GRADIENTS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % GRADIENTS.length];

/** 메인 허브 화면 — 교사/관리자만 마스터 비밀번호로 접근 가능한 관리 대시보드 */
export default function HubPage({ navigate }) {
  const toast = useToast();
  const admin = useAdmin(null); // 허브 스코프(마스터 관리자)
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [shareBoard, setShareBoard] = useState(null);

  // 로그인 폼 상태
  const [pwInput, setPwInput] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  const load = useCallback(async () => {
    if (!admin.isMasterAdmin) return;
    setLoading(true);
    setError('');
    try {
      setBoards(await api.listBoards());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [admin.isMasterAdmin]);

  useEffect(() => {
    document.title = 'MathrillerPad · 관리자 센터';
    if (admin.isMasterAdmin) {
      load();
    }
  }, [admin.isMasterAdmin, load]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!pwInput.trim()) return;
    setLoginLoading(true);
    setLoginError('');
    try {
      await admin.login(pwInput.trim());
      setPwInput('');
      toast('관리자로 인증되었습니다 👑');
    } catch (err) {
      setLoginError(err.message || '비밀번호가 올바르지 않습니다.');
    } finally {
      setLoginLoading(false);
    }
  };

  const removeBoard = async (b) => {
    if (!confirm(`"${b.title}" 보드를 정말 삭제할까요?\n(시트 DB에는 소프트 삭제되어 보존됩니다)`)) return;
    try {
      await api.deleteBoard({ boardId: b.id, password: admin.password });
      toast('보드를 삭제했습니다');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const filtered = boards.filter((b) => `${b.title} ${b.description}`.toLowerCase().includes(query.toLowerCase()));

  // ───────────────────────── 비관리자: 잠금 화면 (관리자 인증 게이트) ─────────────────────────
  if (!admin.isMasterAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-4 text-slate-100">
        <div className="w-full max-w-md rounded-3xl bg-white/10 p-7 shadow-2xl backdrop-blur-xl ring-1 ring-white/15 sm:p-9">
          <div className="text-center">
            <span className="inline-block text-5xl">🔐</span>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">MathrillerPad</h1>
            <p className="mt-1 text-xs font-semibold text-indigo-300 uppercase tracking-widest">Teacher & Admin Portal</p>
            <p className="mt-4 text-sm leading-relaxed text-slate-300">
              이 페이지는 <b>교사 및 관리자 전용 대시보드</b>입니다.<br />
              보드 목록 확인 및 새 보드 개설을 위해 관리자 비밀번호를 입력해 주세요.
            </p>
          </div>

          <form onSubmit={handleLogin} className="mt-7 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">관리자 마스터 비밀번호</label>
              <input
                type="password"
                autoFocus
                value={pwInput}
                onChange={(e) => setPwInput(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition focus:border-indigo-400 focus:bg-black/50 focus:ring-2 focus:ring-indigo-400/30"
              />
            </div>

            {loginError && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/15 p-3 text-center text-xs font-medium text-rose-300">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading || !pwInput.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 py-3.5 font-bold text-white shadow-lg shadow-indigo-500/30 transition hover:brightness-110 disabled:opacity-50"
            >
              {loginLoading ? <Spinner className="h-5 w-5 text-white" /> : '관리자 대시보드 입장'}
            </button>
          </form>

          <div className="mt-6 border-t border-white/10 pt-4 text-center">
            <p className="text-xs text-slate-400">
              💡 학생들은 선생님이 공유해 주신 <b>보드 전용 링크나 QR 코드</b>를 통해 비밀번호 없이 바로 참여할 수 있습니다.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ───────────────────────── 관리자 인증 성공: 허브 대시보드 ─────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/60 to-purple-50/60">
      <header className="sticky top-0 z-30 border-b border-white/80 bg-white/85 backdrop-blur-md shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <span className="text-2xl">📌</span>
          <div className="mr-auto">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold leading-tight text-slate-800">MathrillerPad</h1>
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-700">관리자 센터</span>
            </div>
            <p className="text-xs text-slate-500">구글 시트 기반 사설 패들렛 허브</p>
          </div>
          <button
            onClick={admin.logout}
            className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-rose-50 hover:text-rose-600 transition"
          >
            <span>👑 관리자 로그아웃</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {IS_MOCK && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <b>데모 모드</b>로 실행 중입니다. 데이터가 이 브라우저(localStorage)에만 저장됩니다.
          </div>
        )}

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="mr-auto">
            <h2 className="text-2xl font-black text-slate-800">보드 관리</h2>
            <p className="text-sm text-slate-500">새 보드를 만들거나, 패들렛 백업 파일을 불러와 바로 보드를 생성하세요.</p>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="🔍 보드 검색"
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 sm:w-60"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2.5 font-bold text-white shadow-md shadow-purple-200 hover:brightness-110 transition"
            >
              <span>📥 패들렛 가져오기</span>
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 font-bold text-white shadow-md shadow-indigo-200 hover:bg-indigo-700 transition"
            >
              <span>＋ 새 보드 만들기</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-24 text-indigo-500"><Spinner className="h-9 w-9" /></div>
        ) : error ? (
          <div className="rounded-2xl bg-rose-50 p-7 text-center text-rose-700 border border-rose-200">
            <p className="font-bold">보드 목록을 불러오지 못했습니다.</p>
            <p className="mt-1 text-sm">{error}</p>
            <button onClick={load} className="mt-4 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-rose-700">다시 시도</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-white/50 py-16 px-4 text-center">
            <span className="text-5xl">🗂️</span>
            <span className="mt-3 font-bold text-lg text-slate-700">
              {query ? '검색 결과가 없습니다' : '아직 생성된 보드가 없습니다'}
            </span>
            <p className="mt-1 text-xs text-slate-500 max-w-md">
              기존 패들렛에서 내보낸 엑셀/CSV 파일이 있다면 [패들렛 가져오기]로 즉시 보드를 복원하거나, 새 빈 보드를 직접 만들어 보세요.
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5 justify-center">
              <button
                onClick={() => setShowImport(true)}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2.5 font-bold text-sm text-white shadow-md shadow-purple-200 hover:brightness-110 transition"
              >
                <span>📥 패들렛 파일로 즉시 시작</span>
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 font-bold text-sm text-white shadow-md shadow-indigo-200 hover:bg-indigo-700 transition"
              >
                <span>＋ 빈 보드 만들기</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((b) => (
              <div key={b.id} className="group relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-1 hover:shadow-xl">
                <button onClick={() => navigate(b.id)} className="block w-full text-left">
                  <div className={`h-24 bg-gradient-to-br ${gradientFor(b.id)} p-4 flex flex-col justify-between`}>
                    <span className="self-start rounded-full bg-white/25 px-2 py-0.5 font-mono text-[10px] font-semibold text-white backdrop-blur-sm">{b.id}</span>
                  </div>
                  <div className="p-4">
                    <h3 className="line-clamp-1 text-lg font-bold text-slate-800">{b.title}</h3>
                    <p className="mt-1 line-clamp-2 min-h-10 text-sm text-slate-500">{b.description || '설명 없음'}</p>
                    <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-3 text-xs text-slate-400">
                      <span>🗂 섹션 {b.sectionCount ?? 0}</span>
                      <span>📝 메모 {b.postCount ?? 0}</span>
                      <span className="ml-auto">{new Date(b.createdAt).toLocaleDateString('ko-KR')}</span>
                    </div>
                  </div>
                </button>
                <div className="absolute right-2 top-2 flex gap-1.5">
                  <button
                    onClick={() => setShareBoard(b)}
                    title="QR 코드 및 주소 복사"
                    className="flex items-center gap-1 rounded-lg bg-white/95 px-2.5 py-1 text-xs font-bold text-indigo-700 shadow hover:bg-white hover:scale-105 transition"
                  >
                    📲 QR
                  </button>
                  <button
                    onClick={() => removeBoard(b)}
                    title="보드 삭제"
                    className="rounded-lg bg-rose-600/90 px-2 py-1 text-xs font-bold text-white shadow hover:bg-rose-700 hover:scale-105 transition"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <CreateBoardModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        masterPassword={admin.password}
        onCreated={(b) => {
          setShowCreate(false);
          toast('새 보드가 만들어졌습니다 🎉');
          navigate(b.id);
        }}
      />
      <CsvImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        masterPassword={admin.password}
        onDone={(newBoard) => {
          setShowImport(false);
          toast('패들렛 보드를 성공적으로 가져왔습니다 🎉');
          if (newBoard?.id) {
            navigate(newBoard.id);
          } else {
            load();
          }
        }}
      />
      <ShareModal
        open={!!shareBoard}
        onClose={() => setShareBoard(null)}
        url={shareBoard ? boardUrl(shareBoard.id) : ''}
        title={shareBoard?.title}
      />
    </div>
  );
}
