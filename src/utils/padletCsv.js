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
  emoji: ['이모지', 'emoji', '반응', 'reaction'],
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

/** 파일명에서 패들렛 보드 제목 추론 */
function titleFromFileName(name = '') {
  return name
    .replace(/\.(xlsx|xls|csv)$/i, '')
    .replace(/^Padlet\s*[-_–—]?\s*/i, '')
    .trim();
}

/** 이모지/하트 텍스트(예: "❤️ (3)")에서 숫자 추출 */
function parseLikes(emojiText) {
  const s = String(emojiText || '');
  const m = s.match(/\((\d+)\)/);
  if (m) return parseInt(m[1], 10);
  if (s.includes('❤️') || s.includes('❤')) return 1;
  return 0;
}

/** 파일을 2D 배열 및 메타데이터, 댓글 배열로 변환 */
async function fileToData(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // 1) 엑셀 파일 판별
  const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  const isExcel = isZip || /\.(xlsx|xls)$/i.test(file.name);

  if (isExcel) {
    try {
      const workbook = XLSX.read(buffer, { type: 'array' });
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

      // 댓글 시트에서 댓글 데이터 추출
      const rawComments = [];
      const commentSheetName = workbook.SheetNames.find((n) => /댓글|comment/i.test(n));
      if (commentSheetName) {
        const comSheet = workbook.Sheets[commentSheetName];
        const comRows = XLSX.utils.sheet_to_json(comSheet, { header: 1, defval: '' });
        // 첫 행은 헤더 ['게시물 번호', '이름', '댓글']
        for (let i = 1; i < comRows.length; i++) {
          const r = comRows[i];
          if (r && r.length >= 3) {
            const postNum = parseInt(r[0], 10);
            const author = clean(r[1]) || '익명';
            const content = clean(r[2]);
            if (!isNaN(postNum) && content) {
              rawComments.push({ postNum, author, content });
            }
          }
        }
      }

      return { rows: rows || [], meta: { boardTitle, boardUrl }, rawComments };
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
        const rawComments = [];

        let currentSection = 'posts'; // 'posts' | 'comments' | 'reactions' | 'summary'

        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          if (!r || !r.length) continue;
          const firstCol = String(r[0] || '').trim();

          if (firstCol === '게시물 번호' && r.join(',').includes('댓글')) {
            currentSection = 'comments';
            continue;
          }
          if (firstCol === '게시물 번호' && r.join(',').includes('이모지')) {
            currentSection = 'reactions';
            continue;
          }
          if (firstCol === '제목' && r.length >= 2) {
            boardTitle = String(r[1] || '').trim();
            continue;
          }
          if (firstCol === '링크' && r.length >= 2) {
            boardUrl = String(r[1] || '').trim();
            continue;
          }

          if (currentSection === 'comments' && r.length >= 3) {
            const postNum = parseInt(firstCol, 10);
            const author = clean(r[1]) || '익명';
            const content = clean(r[2]);
            if (!isNaN(postNum) && content) {
              rawComments.push({ postNum, author, content });
            }
          }
        }

        resolve({ rows, meta: { boardTitle, boardUrl }, rawComments });
      },
      error: (err) => reject(new Error(`CSV 파싱 실패: ${err.message}`)),
    });
  });
}

/**
 * 패들렛 내보내기 파일 파서 (CSV / XLSX 지원)
 * @returns {Promise<{ posts: Array, comments: Array, headers: string[], mapping: object, boardTitle: string, boardUrl: string }>}
 */
export async function parsePadletCsv(file) {
  const { rows: allRows, meta, rawComments = [] } = await fileToData(file);
  if (!allRows.length) throw new Error('파일이 비어 있습니다.');

  // 헤더 행 찾기
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

  if (headerStr.includes('이모지') && !headerStr.includes('섹션') && !headerStr.includes('본문') && !headerStr.includes('첨부')) {
    throw new Error(
      "선택하신 파일은 패들렛의 '이모지 반응' 백업 파일입니다.\n\n" +
      "게시물 본문과 사진을 가져오려면 패들렛 보드에서:\n" +
      "[공유] → [내보내기] → '스프레드시트로 내보내기' 또는 'CSV로 내보내기'를 선택해 다운로드한 원본 파일을 올려주세요."
    );
  }

  const mapping = matchHeaders(headers);
  if (mapping.content === undefined && mapping.title === undefined && mapping.attachmentUrl === undefined && mapping.sectionTitle === undefined) {
    throw new Error(
      "패들렛 게시물 형식을 인식할 수 없습니다.\n" +
      "(인식된 컬럼: " + headers.filter(Boolean).join(', ') + ")\n\n" +
      "패들렛 [공유] → [내보내기] 메뉴에서 '스프레드시트로 내보내기' 또는 'CSV로 내보내기'로 저장한 원본 파일을 올려주세요."
    );
  }

  const get = (row, f) => (mapping[f] !== undefined ? clean(row[mapping[f]]) : '');

  const posts = [];
  const postNumToIndexMap = {}; // '게시물 번호' -> posts 배열 인덱스

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
    const likes = parseLikes(get(row, 'emoji'));

    const postNum = parseInt(firstCol, 10);

    if (title || content || attachmentUrl) {
      const idx = posts.length;
      if (!isNaN(postNum)) {
        postNumToIndexMap[postNum] = idx;
      }
      posts.push({
        title,
        content,
        attachmentUrl,
        author,
        createdAt,
        sectionTitle,
        likes,
      });
    }
  }

  if (!posts.length) {
    throw new Error('파일에서 가져올 수 있는 게시물 데이터를 찾지 못했습니다.');
  }

  // 댓글 데이터 정제 및 postIndex 연결
  const comments = [];
  rawComments.forEach((c) => {
    const postIdx = postNumToIndexMap[c.postNum];
    if (postIdx !== undefined) {
      comments.push({
        postIndex: postIdx,
        author: c.author,
        content: c.content,
      });
    }
  });

  const finalBoardTitle = meta.boardTitle || titleFromFileName(file.name) || '가져온 패들렛 보드';

  return {
    posts,
    comments,
    headers,
    mapping,
    boardTitle: finalBoardTitle,
    boardUrl: meta.boardUrl || '',
  };
}
