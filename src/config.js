/**
 * 앱 전역 설정 — 값은 .env 파일에서 변경하세요.
 */
export const GAS_URL = (import.meta.env.VITE_GAS_URL || '').trim();

/** GAS URL 이 없으면 브라우저 localStorage 를 사용하는 데모 모드 */
export const IS_MOCK = !GAS_URL;

/**
 * 🔑 데모(Mock) 모드 관리자 비밀번호. (기본값: admin1234)
 * 실제 운영 모드에서는 백엔드(google-sheet-db.gs)의 DEFAULT_ADMIN_PASSWORD
 * 또는 스크립트 속성 ADMIN_PASSWORD 로 검증하므로 이 값은 사용되지 않습니다.
 */
export const MOCK_ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'admin1234';

/** 보드 자동 새로고침 주기(ms) */
export const POLL_INTERVAL = Number(import.meta.env.VITE_POLL_INTERVAL) || 10000;

/** 직접 그리기 캔버스 최대 저장 해상도 */
export const CANVAS_MAX_SIZE = 500;

/** 업로드 이미지 리사이즈 최대 변 길이(px) — 드라이브 용량 절약 */
export const UPLOAD_MAX_DIMENSION = 1280;

/** CSV 마이그레이션 시 한 번에 서버로 보낼 게시물 수 (GAS 6분 실행 제한 대비) */
export const IMPORT_BATCH_SIZE = 8;
