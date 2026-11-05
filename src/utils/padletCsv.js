import Papa from 'papaparse';
import * as XLSX from 'xlsx';

/**
 * 패들렛 컬럼명 매핑 사전
 */
const FIELD_ALIASES = {
  sectionTitle: ['섹션', 'section', '열', 'column', '그룹', 'group', '카테고리'],
  title: ['제목', 'subject', 'title', '주제', '게시물 제목'],
  content: ['본문', '내용', 'body', 'content', 'text', '글'],
  attachmentUrl: ['첨부 링크', '첨부', '첨부 파일', '첨부파일', 'attachment', 'attachment url', 'link', 'url', '링크', '파일'],
  author: ['저자', '작성자', 'author', 'creator', '이름', 'name'],
  createdAt: ['만든 시간', '생성', 'created at', 'created', 'date', 'timestamp', '작성일', '날짜', '게시 일시', '등록일'],
};

/** 패들렛에서 빈 칸에 들어가는 '데이터 없음' 등의 무의미한 텍스트 필터링 */
function clean(val) {
  const s = String(val ?? '').trim();
  if (!s || s === '데이터 없음' || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') {
    return '';
  }
  return s;
}

/** 패들렛 본문 내 HTML 태그 정리 */
export function htmlToText(html) {
  const s = clean(html);
  if (!s) return '';
  if (!/<[a-z][\s\S]*>/i.test(s)) return s;
  const doc = new DOMParser().parseFromString(
    s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n'),
    'text/html',
  );
  return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

function matchHeaders(headers) {
  const norm = headers.map((h) => String(h || '').trim().toLowerCase());
  const map = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    let idx = norm.findIndex((h) => aliases.includes(h));
    if (idx < 0) {
      idx = norm.findIndex((h, i) => !Object.values(map).includes(i) && aliases.some((a) => h === a || h.includes(a)));
    }
    if (idx >= 0) map[field] = idx;
  }
  return map;
}

/** 파일명에서 패들렛 보드 제목 추론 (예: "Padlet - 2024 과학영재원.xlsx" -> "2024 과학영재원") */
function titleFromFileName(name = '') {
  return name
    .replace(/\.(xlsx|xls|csv)$/i, '')
    .replace(/^Padlet\s*[-_–—]?\s*/i, '')
    .trim();
}

/** 파일을 2D 배열 및 메타데이터로 변환 */
async function fileToData(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // 1) 엑셀 파일 판별
  const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  const isExcel = isZip || /\.(xlsx|xls)$/i.test(file.name);

  if (isExcel) {
    try {
      const workbook = XLSX.read(buffer, { type: 'array' });
      // 게시물 시트 찾기 (이름이 '게시물', 'Posts', 또는 첫 번째 시트)
      const postSheetName = workbook.SheetNames.find((n) => /게시물|post/i.test(n)) || workbook.SheetNames[0];
      const sheet = workbook.Sheets[postSheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      // 요약 시트에서 보드 제목과 원본 링크 추출
      let boardTitle = '';
      let boardUrl = '';
      const summarySheetName = workbook.SheetNames.find((n) => /요약|summary/i.test(n));
      if (summarySheetName) {
        const sumSheet = workbook.Sheets[summarySheetName];
        const sumRows = XLSX.utils.sheet_to_json(sumSheet, { header: 1, defval: '' });
        sumRows.forEach((r) => {
          const k = String(r[0] || '').trim();
          const v = String(r[1] || '').trim();
          if (k === '제목' || /title|subject/i.test(k)) boardTitle = v;
          if (k === '링크' || /url|link/i.test(k)) boardUrl = v;
        });
      }

      return { rows: rows || [], meta: { boardTitle, boardUrl } };
    } catch {
      // 엑셀 파싱 실패 시 폴백
    }
  }

  // 2) 텍스트 CSV 파싱
  const decoder = new TextDecoder('utf-8');
  let text = decoder.decode(buffer).replace(/^\uFEFF/, '');

  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      skipEmptyLines: false,
      complete: ({ data }) => {
        const rows = data || [];
        let boardTitle = '';
        let boardUrl = '';
        // CSV 하단의 '제목,xxx', '링크,xxx' 행 스캔
        rows.forEach((r) => {
          if (r && r.length >= 2) {
            const k = String(r[0] || '').trim();
            const v = String(r[1] || '').trim();
            if (k === '제목' || /title|subject/i.test(k)) boardTitle = v;
            if (k === '링크' || /url|link/i.test(k)) boardUrl = v;
          }
        });
        resolve({ rows, meta: { boardTitle, boardUrl } });
      },
      error: (err) => reject(new Error(`CSV 파싱 실패: ${err.message}`)),
    });
  });
}

/**
 * 패들렛 내보내기 파일 파서 (CSV / XLSX 지원)
 * @returns {Promise<{ posts: Array, headers: string[], mapping: object, boardTitle: string, boardUrl: string }>}
 */
export async function parsePadletCsv(file) {
  const { rows: allRows, meta } = await fileToData(file);
  if (!allRows.length) throw new Error('파일이 비어 있습니다.');

  // 헤더 행 찾기 (첫 번째 비어있지 않은 행)
  let headerRowIdx = -1;
  for (let i = 0; i < allRows.length; i++) {
    const r = allRows[i];
    if (r && r.some((c) => String(c).trim())) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) throw new Error('파일에 데이터 행이 없습니다.');

  const headers = allRows[headerRowIdx].map((h) => String(h || '').trim());
  const headerStr = headers.join(',').toLowerCase();

  // ⚠️ 오직 '이모지 반응'만 단독으로 들어있는 파일 감지
  if (headerStr.includes('이모지') && !headerStr.includes('섹션') && !headerStr.includes('본문') && !headerStr.includes('첨부')) {
    throw new Error(
      "선택하신 파일은 패들렛의 '이모지 반응' 백업 파일입니다.\n\n" +
      "게시물 본문과 사진을 가져오려면 패들렛 보드에서:\n" +
      "[공유] → [내보내기] → 'CSV로 내보내기' (또는 '스프레드시트로 내보내기')를 선택해 다운로드한 원본 파일을 올려주세요."
    );
  }

  const mapping = matchHeaders(headers);
  if (mapping.content === undefined && mapping.title === undefined && mapping.attachmentUrl === undefined && mapping.sectionTitle === undefined) {
    throw new Error(
      "패들렛 게시물 형식을 인식할 수 없습니다.\n" +
      "(인식된 컬럼: " + headers.filter(Boolean).join(', ') + ")\n\n" +
      "패들렛 [공유] → [내보내기] 메뉴에서 'CSV로 내보내기' 또는 '스프레드시트로 내보내기'로 저장한 원본 파일을 올려주세요."
    );
  }

  const get = (row, f) => (mapping[f] !== undefined ? clean(row[mapping[f]]) : '');

  // 게시물 행 추출: 패들렛 복합 파일에서 게시물 테이블이 끝나고 댓글/이모지 테이블이 나오면 중단
  const posts = [];
  for (let i = headerRowIdx + 1; i < allRows.length; i++) {
    const row = allRows[i];
    if (!row || !row.length) continue;

    const firstCol = String(row[0] || '').trim();
    // 패들렛 하단 구분자 감지
    if (firstCol === '게시물 번호' || firstCol === '제목' || firstCol === '링크' || firstCol === '작성자') {
      const rowText = row.join(',');
      if (rowText.includes('댓글') || rowText.includes('이모지') || rowText.includes('padlet.com')) {
        break; // 게시물 테이블 종료!
      }
    }

    const title = clean(get(row, 'title'));
    const content = htmlToText(get(row, 'content'));
    const attachmentUrl = clean(get(row, 'attachmentUrl'));
    const author = clean(get(row, 'author')) || '익명';
    const createdAt = clean(get(row, 'createdAt'));
    const sectionTitle = clean(get(row, 'sectionTitle')) || '가져온 게시물';

    if (title || content || attachmentUrl) {
      posts.push({
        title,
        content,
        attachmentUrl,
        author,
        createdAt,
        sectionTitle,
      });
    }
  }

  if (!posts.length) {
    throw new Error('파일에서 가져올 수 있는 게시물 데이터를 찾지 못했습니다.');
  }

  // 보드 제목: 파일 내 메타데이터 제목 -> 파일명 -> 기본값
  const finalBoardTitle = meta.boardTitle || titleFromFileName(file.name) || '가져온 패들렛 보드';

  return {
    posts,
    headers,
    mapping,
    boardTitle: finalBoardTitle,
    boardUrl: meta.boardUrl || '',
  };
}
