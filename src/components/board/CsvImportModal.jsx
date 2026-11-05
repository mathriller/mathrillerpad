import { useRef, useState } from 'react';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';
import { api } from '../../api';
import { IMPORT_BATCH_SIZE, IS_MOCK } from '../../config';
import { parsePadletCsv } from '../../utils/padletCsv';

/**
 * 패들렛 데이터 가져오기 모달
 *  - boardId 가 없을 때(보드 관리 허브에서 호출): 보드 이름을 자동 추출해 새 보드를 생성한 뒤 게시물을 import
 *  - boardId 가 있을 때(개별 보드에서 호출): 해당 보드에 바로 import
 */
export default function CsvImportModal({ open, onClose, boardId, masterPassword, onDone }) {
  const [stage, setStage] = useState('select'); // select | preview | running | done
  const [parsed, setParsed] = useState(null);
  const [targetTitle, setTargetTitle] = useState('');
  const [createdBoard, setCreatedBoard] = useState(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ done: 0, total: 0, image: 0, link: 0, text: 0, failed: 0 });
  const cancelRef = useRef(false);
  const fileRef = useRef(null);

  const reset = () => {
    setStage('select');
    setParsed(null);
    setTargetTitle('');
    setCreatedBoard(null);
    setError('');
    setProgress({ done: 0, total: 0, image: 0, link: 0, text: 0, failed: 0 });
  };

  const close = () => {
    if (stage === 'running') return;
    if (stage === 'done') onDone?.(createdBoard);
    reset();
    onClose();
  };

  const onFile = async (file) => {
    if (!file) return;
    setError('');
    try {
      const result = await parsePadletCsv(file);
      if (!result.posts.length) throw new Error('가져올 게시물이 없습니다.');
      setParsed({ ...result, fileName: file.name });
      setTargetTitle(result.boardTitle || '가져온 패들렛 보드');
      setStage('preview');
    } catch (err) {
      setError(err.message);
    }
  };

  const run = async () => {
    const posts = parsed.posts;
    cancelRef.current = false;
    setStage('running');
    setError('');

    let activeBoardId = boardId;
    let newBoard = null;

    try {
      // 1) boardId 가 없으면(허브에서 가져온 경우) 새 보드 먼저 자동 생성!
      if (!activeBoardId) {
        const title = targetTitle.trim() || parsed.boardTitle || '가져온 패들렛 보드';
        const desc = parsed.boardUrl ? `패들렛 원본: ${parsed.boardUrl}` : '패들렛에서 가져온 보드';
        newBoard = await api.createBoard({
          title,
          description: desc,
          password: masterPassword,
          masterPassword,
        });
        activeBoardId = newBoard.id;
        setCreatedBoard(newBoard);
      }
    } catch (err) {
      setError(`보드 생성 실패: ${err.message}`);
      setStage('preview');
      return;
    }

    // 2) 게시물 배치 전송 (이미지 다운로드 및 섹션/메모 저장)
    const acc = { done: 0, total: posts.length, image: 0, link: 0, text: 0, failed: 0 };
    setProgress({ ...acc });
    for (let i = 0; i < posts.length; i += IMPORT_BATCH_SIZE) {
      if (cancelRef.current) break;
      const batch = posts.slice(i, i + IMPORT_BATCH_SIZE);
      try {
        const res = await api.importPosts({ boardId: activeBoardId, posts: batch });
        res.results.forEach((r) => { acc[r.status] = (acc[r.status] || 0) + 1; });
      } catch (err) {
        acc.failed += batch.length;
        setError(`일부 배치 전송 실패: ${err.message}`);
      }
      acc.done += batch.length;
      setProgress({ ...acc });
    }
    setStage('done');
  };

  const withAttachment = parsed?.posts.filter((p) => p.attachmentUrl).length ?? 0;
  const sectionNames = parsed ? [...new Set(parsed.posts.map((p) => p.sectionTitle || '가져온 게시물'))] : [];
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Modal open={open} onClose={close} closable={stage !== 'running'} size="lg" title="📥 패들렛 가져오기 (엑셀 / CSV)">
      {stage === 'select' && (
        <div className="space-y-4">
          <ol className="list-decimal space-y-1.5 pl-5 text-xs sm:text-sm text-slate-600 leading-relaxed">
            <li>기존 패들렛 보드에서 <b>공유 → 내보내기 → '스프레드시트로 내보내기(엑셀)' 또는 'CSV로 내보내기'</b> 파일을 받으세요.</li>
            <li>파일을 올리면 <b>보드 이름과 섹션들을 자동으로 인식</b>하여 새 보드를 생성하고 모든 글과 사진을 복원합니다.</li>
            <li>첨부 사진은 구글 서버가 직접 다운로드하여 <b>내 구글 드라이브에 영구 보관</b>하므로, 이후 패들렛을 탈퇴하거나 삭제해도 사진이 평생 안전합니다.</li>
          </ol>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onFile(e.dataTransfer.files?.[0]);
            }}
            className="flex w-full flex-col items-center rounded-2xl border-2 border-dashed border-slate-300 py-10 text-slate-500 hover:border-indigo-500 hover:bg-indigo-50/30 hover:text-indigo-600 transition"
          >
            <span className="text-4xl">📄</span>
            <span className="mt-2.5 font-bold text-sm sm:text-base">엑셀(.xlsx) 또는 CSV 파일 선택 / 끌어다 놓기</span>
            <span className="mt-1 text-xs text-slate-400">패들렛에서 내보낸 백업 파일을 그대로 올려주세요</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            hidden
            onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }}
          />
        </div>
      )}

      {stage === 'preview' && parsed && (
        <div className="space-y-4">
          {/* 보드 이름 자동 추출 및 수정 입력창 */}
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
            <label className="block text-xs font-bold text-indigo-900 mb-1.5">
              ✨ {boardId ? '가져올 패들렛 제목' : '생성될 새 보드 이름 (자동 추출됨, 수정 가능)'}
            </label>
            <input
              type="text"
              value={targetTitle}
              onChange={(e) => setTargetTitle(e.target.value)}
              disabled={!!boardId}
              className="w-full rounded-xl border border-indigo-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100"
              placeholder="보드 이름을 입력하세요"
            />
            {parsed.boardUrl && (
              <p className="mt-2 truncate text-xs text-indigo-600 font-medium">
                🔗 패들렛 원본 링크: {parsed.boardUrl}
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="게시물" value={parsed.posts.length} />
            <Stat label="첨부 이미지 URL" value={withAttachment} />
            <Stat label="분리된 섹션" value={sectionNames.length} />
          </div>

          <div className="rounded-xl bg-slate-50 p-3.5 text-xs text-slate-600 border border-slate-200">
            <p className="font-bold text-slate-700">📄 {parsed.fileName}</p>
            <p className="mt-1 font-semibold text-indigo-700">
              구분된 섹션: <span className="font-normal text-slate-700">{sectionNames.join(', ')}</span>
            </p>
          </div>

          <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
            {parsed.posts.slice(0, 5).map((p, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-2.5 text-xs shadow-xs">
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-800 font-semibold">{p.sectionTitle}</span>
                  <span>{p.title || '(제목 없음)'}</span>
                  <span className="ml-auto font-normal text-slate-400">{p.author || '익명'}</span>
                </div>
                {p.content && <p className="mt-1 line-clamp-2 text-slate-600 whitespace-pre-wrap">{p.content}</p>}
                {p.attachmentUrl && <p className="mt-1 truncate text-indigo-500 font-mono text-[11px]">📎 {p.attachmentUrl}</p>}
              </div>
            ))}
            {parsed.posts.length > 5 && <p className="text-center text-xs text-slate-400 py-1">… 외 {parsed.posts.length - 5}건</p>}
          </div>

          {IS_MOCK && (
            <p className="rounded-xl bg-amber-50 p-2.5 text-xs text-amber-700 font-medium">
              데모 모드에서는 이미지를 서버로 복사하지 않고 원본 링크를 참조합니다. 영구 보존은 구글 시트가 연결된 상태에서 동작합니다.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={reset} className="rounded-xl px-4 py-2 font-semibold text-slate-500 hover:bg-slate-100">다른 파일</button>
            <button onClick={run} className="rounded-xl bg-indigo-600 px-5 py-2.5 font-bold text-white shadow-md shadow-indigo-200 hover:bg-indigo-700 transition">
              {boardId ? `${parsed.posts.length}건 가져오기` : `새 보드 생성 및 ${parsed.posts.length}건 가져오기`}
            </button>
          </div>
        </div>
      )}

      {(stage === 'running' || stage === 'done') && (
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 flex justify-between text-sm font-bold text-slate-700">
              <span className="flex items-center gap-2">
                {stage === 'running' && <Spinner className="h-4 w-4 text-indigo-600" />}
                {stage === 'running' ? '사진을 구글 드라이브에 영구 저장하는 중…' : '가져오기 완료 🎉'}
              </span>
              <span>{progress.done} / {progress.total}</span>
            </div>
            <div className="h-3.5 overflow-hidden rounded-full bg-slate-100 p-0.5">
              <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <Stat label="이미지 보존" value={progress.image} />
            <Stat label="링크 보존" value={progress.link} />
            <Stat label="텍스트" value={progress.text} />
            <Stat label="실패" value={progress.failed} danger={progress.failed > 0} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            {stage === 'running' ? (
              <button onClick={() => { cancelRef.current = true; }} className="rounded-xl px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50">
                중단 (현재 배치 후)
              </button>
            ) : (
              <button onClick={close} className="rounded-xl bg-indigo-600 px-6 py-2.5 font-bold text-white shadow hover:bg-indigo-700">
                {createdBoard ? '생성된 보드로 이동' : '확인'}
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 whitespace-pre-wrap rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs sm:text-sm font-medium leading-relaxed text-rose-700">
          {error}
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value, danger }) {
  return (
    <div className={`rounded-xl p-2.5 ${danger ? 'bg-rose-50 text-rose-700' : 'bg-indigo-50 text-indigo-700'}`}>
      <div className="text-xl font-black">{value}</div>
      <div className="text-[11px] font-semibold opacity-80">{label}</div>
    </div>
  );
}
