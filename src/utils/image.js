import { UPLOAD_MAX_DIMENSION } from '../config';

/**
 * 업로드 이미지를 최대 변 길이로 축소 후 Base64(DataURL) 로 변환.
 * GIF 는 애니메이션 보존을 위해 원본 그대로 전송합니다.
 * @returns {Promise<{ base64: string, mimeType: string, kind: 'upload' }>}
 */
export async function fileToImagePayload(file, maxDim = UPLOAD_MAX_DIMENSION) {
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 첨부할 수 있습니다.');
  const original = await readAsDataURL(file);
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return { base64: original, mimeType: file.type, kind: 'upload' };
  }
  const img = await loadImage(original);
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const keepAlpha = file.type === 'image/png' || file.type === 'image/webp';
  if (!keepAlpha) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(img, 0, 0, w, h);
  const mimeType = keepAlpha ? 'image/png' : 'image/jpeg';
  const base64 = canvas.toDataURL(mimeType, 0.85);
  // 축소 결과가 오히려 크면 원본 사용
  return base64.length < original.length
    ? { base64, mimeType, kind: 'upload' }
    : { base64: original, mimeType: file.type, kind: 'upload' };
}

export function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
    r.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러올 수 없습니다.'));
    img.src = src;
  });
}
