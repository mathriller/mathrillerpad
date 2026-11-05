import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Modal from './Modal';
import { useToast } from './Toast';

/**
 * 보드 공유 모달 — 주소 복사 / QR 코드 / QR 이미지 저장 / 전체화면(프로젝터) 표시
 */
export default function ShareModal({ open, onClose, url, title }) {
  const toast = useToast();
  const [qr, setQr] = useState('');
  const [full, setFull] = useState(false);

  useEffect(() => {
    if (!open || !url) return;
    QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(''));
  }, [open, url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('주소가 복사되었습니다 📋');
    } catch {
      prompt('아래 주소를 복사하세요', url);
    }
  };

  const download = () => {
    const a = document.createElement('a');
    a.href = qr;
    a.download = `QR_${(title || 'board').replace(/[\\/:*?"<>|\s]+/g, '_')}.png`;
    a.click();
  };

  if (full) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-white p-6" onClick={() => setFull(false)}>
        <h2 className="text-center text-3xl font-extrabold text-slate-800 sm:text-5xl">{title}</h2>
        {qr && <img src={qr} alt="QR 코드" className="aspect-square w-[min(80vw,70vh)]" />}
        <p className="break-all text-center font-mono text-sm text-slate-500 sm:text-lg">{url}</p>
        <p className="text-xs text-slate-400">화면을 누르면 닫힙니다</p>
      </div>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="📲 보드 공유하기" size="sm">
      <div className="space-y-4 text-center">
        <p className="text-sm text-slate-500">학생들이 휴대폰 카메라로 QR 코드를 찍거나 주소로 접속하면 바로 참여할 수 있어요.</p>
        {qr ? (
          <img src={qr} alt="QR 코드" className="mx-auto aspect-square w-56 rounded-xl ring-1 ring-slate-200" />
        ) : (
          <div className="mx-auto h-56 w-56 animate-pulse rounded-xl bg-slate-100" />
        )}
        <div className="flex gap-2">
          <input readOnly value={url} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-2 py-2 font-mono text-xs" />
          <button onClick={copy} className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700">복사</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setFull(true)} disabled={!qr} className="rounded-lg bg-slate-800 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-40">🖥 크게 띄우기</button>
          <button onClick={download} disabled={!qr} className="rounded-lg bg-slate-100 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-40">⬇ QR 저장</button>
        </div>
      </div>
    </Modal>
  );
}
