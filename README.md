# 📌 MathrillerPad — 구글 시트 기반 사설 패들렛 허브

패들렛(Padlet)을 대체하는 **완전 무료 · 무제한** 멀티 보드 웹 앱입니다.
DB 는 구글 스프레드시트, 이미지 저장소는 구글 드라이브, 서버는 Google Apps Script(GAS)를 사용합니다.

## 📁 파일 구조

```
mathrillerpad/
├── backend/
│   └── google-sheet-db.gs        ← Apps Script 에 붙여넣을 백엔드 전체 코드
├── src/
│   ├── main.jsx / App.jsx        ← 엔트리 & ?board= 라우터
│   ├── config.js                 ← .env 값 / 상수 (캔버스 500px, 배치 크기 등)
│   ├── api/
│   │   ├── index.js              ← GAS ↔ 데모 모드 자동 전환
│   │   ├── gasApi.js             ← GAS 웹 앱 호출 (text/plain POST로 CORS preflight 회피)
│   │   └── mockApi.js            ← localStorage 데모 백엔드
│   ├── hooks/
│   │   ├── useBoardRoute.js      ← ?board=ID 라우팅 / 공유 URL
│   │   └── useAdmin.js           ← 보드별 관리자 세션
│   ├── utils/
│   │   ├── image.js              ← 업로드 이미지 축소 → Base64
│   │   ├── padletCsv.js          ← 패들렛 CSV 파서 (컬럼 자동 인식)
│   │   └── id.js                 ← 타임스탬프 기반 ID
│   └── components/
│       ├── common/               ← Modal, Toast, Spinner, AdminLoginModal
│       ├── hub/                  ← HubPage(보드 목록), CreateBoardModal
│       └── board/                ← BoardPage, Section(선반 열), PostCard,
│                                    PostComposer, DrawingCanvas, CsvImportModal
├── .env.example                  ← 환경 변수 템플릿
└── vite.config.js
```

## 🚀 빠른 시작 (데모 모드)

```bash
npm install
npm run dev
```

`VITE_GAS_URL` 이 비어 있으면 **데모 모드**(브라우저 localStorage)로 동작하므로 바로 UI를 체험할 수 있습니다.

## 🔗 구글 시트 연결 (운영 모드)

1. 새 구글 스프레드시트 생성 → **확장 프로그램 → Apps Script**
2. `backend/google-sheet-db.gs` 전체를 붙여넣고 저장
3. 함수 `setup` 선택 → ▶ 실행 → 권한 승인
   → `Boards`, `Sections`, `Posts` 탭과 드라이브 폴더 `MathrillerPad_Images` 가 생성됩니다.
4. **배포 → 새 배포 → 웹 앱** (실행: *나*, 액세스: *모든 사용자*) → `/exec` URL 복사
5. `.env` 에 입력 후 개발 서버를 재시작합니다.
   ```
   VITE_GAS_URL=https://script.google.com/macros/s/XXXXXXXX/exec
   ```
6. 배포: `npm run build` → `dist/` 폴더를 GitHub Pages / Netlify / Vercel 등 아무 정적 호스팅에 업로드

> ⚠️ `.gs` 코드를 수정한 뒤에는 **배포 관리 → 편집 → 새 버전**으로 다시 배포해야 반영됩니다.

## 🗄️ 시트 DB 구조

| 탭 | 컬럼 |
|---|---|
| **Boards** | id, title, description, adminHash, createdAt, deleted |
| **Sections** | id, boardId, title, order, createdAt, deleted |
| **Posts** | id, boardId, sectionId, title, author, content, imageUrl, imageKind(upload/drawing/migrated), sourceUrl, linkUrl, createdAt, deleted |

- 삭제는 `deleted=TRUE` **소프트 삭제**이므로 시트에서 값을 FALSE 로 바꾸면 복구됩니다.
- 이미지는 셀 한도(5만 자) 때문에 드라이브 파일로 저장하고 URL만 기록합니다.

## 🔐 관리자 비밀번호

| 위치 | 용도 |
|---|---|
| `google-sheet-db.gs` 의 `DEFAULT_ADMIN_PASSWORD` (기본 `admin1234`) | 운영 모드 마스터 비밀번호 |
| Apps Script **스크립트 속성** `ADMIN_PASSWORD` | 설정 시 위 값보다 우선 (코드에 비밀번호를 남기지 않으려면 권장) |
| `.env` 의 `VITE_ADMIN_PASSWORD` | 데모 모드 전용 |
| 보드 생성 시 "보드 전용 비밀번호" | 해당 보드만 관리 가능 (SHA-256 해시로 저장) |

비밀번호 검증과 삭제 권한 확인은 **서버(GAS)** 에서 수행하므로, 프론트엔드 코드를 조작해도 삭제할 수 없습니다.

## 📥 패들렛 CSV 마이그레이션 흐름

```
CSV 업로드 → 브라우저에서 파싱 → 첨부 URL 문자열 그대로 GAS 로 전송 (8건씩)
          → GAS UrlFetchApp.fetchAll() 다운로드 → 이미지면 드라이브에 영구 저장
                                                → 이미지가 아니면 링크로 보존
```
브라우저가 패들렛 서버에 직접 요청하지 않으므로 CORS 에러가 발생하지 않습니다.
