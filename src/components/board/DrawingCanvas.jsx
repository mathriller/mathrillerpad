import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { CANVAS_MAX_SIZE } from '../../config';

const COLORS = [
  { name: '검정', value: '#1e293b' },
  { name: '빨강', value: '#ef4444' },
  { name: '파랑', value: '#3b82f6' },
  { name: '초록', value: '#22c55e' },
  { name: '주황', value: '#f97316' },
  { name: '보라', value: '#a855f7' },
];
const ERASER = '#ffffff';
const BG = '#ffffff';
const MAX_UNDO = 20;

/**
 * 직접 그리기 캔버스 (마우스 + 태블릿 펜 + 손가락 터치)
 *
 *  - 내부 해상도는 CANVAS_MAX_SIZE(500) x CANVAS_MAX_SIZE 로 고정 → 저장 용량 최적화
 *    화면에서는 CSS 로 컨테이너 너비에 맞춰 확대/축소되며, 좌표는 비율 보정합니다.
 *  - React onTouchStart / onTouchMove / onTouchEnd 로 필기 처리
 *  - 브라우저 스크롤/줌/롱프레스 메뉴는 CSS touch-action:none + non-passive 리스너로 차단
 *
 *  ref API:
 *    getDataURL() → 'data:image/png;base64,...' (canvas.toDataURL('image/png'))
 *    isEmpty()    → 아무것도 그리지 않았으면 true
 *    clear()
 */
const DrawingCanvas = forwardRef(function DrawingCanvas({ size = CANVAS_MAX_SIZE }, ref) {
  const S = Math.min(size, CANVAS_MAX_SIZE);
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const lastMid = useRef(null);
  const history = useRef([]);
  const [color, setColor] = useState(COLORS[0].value);
  const [lineWidth, setLineWidth] = useState(4);
  const [isEmpty, setIsEmpty] = useState(true);
  const [undoCount, setUndoCount] = useState(0);

  const ctx = () => canvasRef.current.getContext('2d');

  const fillBackground = useCallback(() => {
    const c = ctx();
    c.save();
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = BG;
    c.fillRect(0, 0, S, S);
    c.restore();
  }, [S]);

  // 초기화: 흰 배경 (PNG 투명 배경 방지)
  useEffect(() => {
    fillBackground();
  }, [fillBackground]);

  // iOS Safari 등 touch-action 미지원 환경 대비: non-passive 리스너로 스크롤/더블탭 줌/마우스 에뮬레이션 차단
  useEffect(() => {
    const el = canvasRef.current;
    const prevent = (e) => e.cancelable && e.preventDefault();
    el.addEventListener('touchstart', prevent, { passive: false });
    el.addEventListener('touchmove', prevent, { passive: false });
    el.addEventListener('touchend', prevent, { passive: false });
    return () => {
      el.removeEventListener('touchstart', prevent);
      el.removeEventListener('touchmove', prevent);
      el.removeEventListener('touchend', prevent);
    };
  }, []);

  /** 화면 좌표 → 캔버스 내부(500px) 좌표 변환 */
  const toCanvasPoint = (clientX, clientY) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) * S) / rect.width,
      y: ((clientY - rect.top) * S) / rect.height,
    };
  };

  const pushHistory = () => {
    history.current.push({ img: ctx().getImageData(0, 0, S, S), empty: isEmpty });
    if (history.current.length > MAX_UNDO) history.current.shift();
    setUndoCount(history.current.length);
  };

  const begin = (pt) => {
    pushHistory();
    drawing.current = true;
    last.current = pt;
    lastMid.current = pt;
    // 점 찍기 (탭만 했을 때도 표시)
    const c = ctx();
    c.beginPath();
    c.fillStyle = color;
    c.arc(pt.x, pt.y, lineWidth / 2, 0, Math.PI * 2);
    c.fill();
    setIsEmpty(false);
  };

  const move = (pt) => {
    if (!drawing.current) return;
    const c = ctx();
    // 이전 점과 현재 점의 중점을 이용한 2차 곡선 → 부드러운 손글씨
    const mid = { x: (last.current.x + pt.x) / 2, y: (last.current.y + pt.y) / 2 };
    c.beginPath();
    c.strokeStyle = color;
    c.lineWidth = lineWidth;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.moveTo(lastMid.current.x, lastMid.current.y);
    c.quadraticCurveTo(last.current.x, last.current.y, mid.x, mid.y);
    c.stroke();
    last.current = pt;
    lastMid.current = mid;
  };

  const end = () => {
    if (drawing.current && last.current && lastMid.current) {
      const c = ctx();
      c.beginPath();
      c.strokeStyle = color;
      c.lineWidth = lineWidth;
      c.lineCap = 'round';
      c.moveTo(lastMid.current.x, lastMid.current.y);
      c.lineTo(last.current.x, last.current.y);
      c.stroke();
    }
    drawing.current = false;
    last.current = null;
    lastMid.current = null;
  };

  // ── 마우스 / 펜(마우스 에뮬레이션) ──
  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    begin(toCanvasPoint(e.clientX, e.clientY));
  };
  const onMouseMove = (e) => move(toCanvasPoint(e.clientX, e.clientY));

  // ── 모바일/태블릿 터치 ──
  const onTouchStart = (e) => {
    if (e.touches.length > 1) {
      // 두 손가락 이상(손바닥 닿음 등)은 필기 취소
      end();
      return;
    }
    const t = e.touches[0];
    begin(toCanvasPoint(t.clientX, t.clientY));
  };
  const onTouchMove = (e) => {
    if (e.touches.length > 1) return;
    const t = e.touches[0];
    move(toCanvasPoint(t.clientX, t.clientY));
  };
  const onTouchEnd = () => end();

  const clearAll = () => {
    if (isEmpty) return;
    pushHistory();
    fillBackground();
    setIsEmpty(true);
  };

  const undo = () => {
    const snap = history.current.pop();
    if (!snap) return;
    ctx().putImageData(snap.img, 0, 0);
    setUndoCount(history.current.length);
    setIsEmpty(snap.empty);
  };

  useImperativeHandle(ref, () => ({
    getDataURL: () => canvasRef.current.toDataURL('image/png'),
    isEmpty: () => isEmpty,
    clear: () => {
      fillBackground();
      history.current = [];
      setUndoCount(0);
      setIsEmpty(true);
    },
  }));

  return (
    <div className="space-y-2">
      <div className="relative mx-auto w-full overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-white" style={{ maxWidth: S }}>
        <canvas
          ref={canvasRef}
          width={S}
          height={S}
          className="drawing-canvas block aspect-square w-full cursor-crosshair"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        />
        {isEmpty && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-300">
            ✍️ 여기에 마우스나 펜, 손가락으로 그려보세요
          </span>
        )}
      </div>

      {/* 도구 모음: 두께 슬라이더 / 색상 / 지우개 / 실행취소 / 전체 지우기 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-slate-50 px-3 py-2">
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          두께
          <input type="range" min={1} max={30} value={lineWidth} onChange={(e) => setLineWidth(Number(e.target.value))} className="w-24 accent-indigo-600" />
          <span className="flex h-7 w-7 items-center justify-center">
            <span className="rounded-full" style={{ width: Math.max(2, lineWidth * 0.8), height: Math.max(2, lineWidth * 0.8), background: color === ERASER ? '#cbd5e1' : color }} />
          </span>
        </label>

        <div className="flex items-center gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              title={c.name}
              onClick={() => setColor(c.value)}
              className={`h-7 w-7 rounded-full border-2 transition ${color === c.value ? 'scale-110 border-slate-800 ring-2 ring-white' : 'border-white shadow'}`}
              style={{ background: c.value }}
            />
          ))}
          <button
            type="button"
            title="지우개"
            onClick={() => setColor(ERASER)}
            className={`flex h-7 w-7 items-center justify-center rounded-full border-2 bg-white text-sm ${color === ERASER ? 'scale-110 border-slate-800' : 'border-slate-200'}`}
          >
            🧽
          </button>
        </div>

        <div className="ml-auto flex gap-1.5">
          <button type="button" onClick={undo} disabled={!undoCount} className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-40">
            ↶ 되돌리기
          </button>
          <button type="button" onClick={clearAll} disabled={isEmpty} className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-600 ring-1 ring-rose-200 hover:bg-rose-100 disabled:opacity-40">
            🗑 전체 지우기
          </button>
        </div>
      </div>
    </div>
  );
});

export default DrawingCanvas;
