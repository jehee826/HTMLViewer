# HTMLViewer

HTML 파일을 등록하고, 모아보고, 카드를 클릭해 별도 창으로 여는 Windows 데스크톱 앱입니다. Electron + React로 동작하며 백엔드·계정·네트워크 연결이 필요하지 않습니다.

## 사용 방법

1. **HTML 등록**으로 `.html` 또는 `.htm` 파일을 선택합니다.
2. 등록된 카드를 클릭해 별도 창에서 실행합니다. 실행 창을 닫아도 보관함은 유지됩니다.
3. 제목 검색, 제목 수정, 카테고리 추가·수정·삭제로 정리할 수 있습니다.

CSS·JavaScript·이미지가 내부에 포함된 **단일 HTML 파일**을 지원합니다. 옆 폴더의 CSS·JS·이미지, CDN, 외부 API, 외부 페이지, 팝업, iframe, 다운로드와 장치 접근은 지원하지 않습니다. 내부 스크립트와 data/blob 이미지 등은 실행됩니다. 원본 파일의 바이트와 인코딩은 복사 과정에서 변경하지 않습니다.

## Windows 실행 파일

`npm run dist` 실행 후 `release` 폴더에 생성됩니다.

- `HTMLViewer-0.1.0-x64-setup.exe`: 설치 파일, 사용자별 설치 및 설치 경로 선택.
- `HTMLViewer-0.1.0-x64-portable.exe`: 설치 없이 실행하는 단일 파일.

코드 서명 인증서를 적용하지 않은 빌드입니다. 배포·다운로드 경로와 Windows 정책에 따라 알 수 없는 게시자 또는 SmartScreen 경고가 표시될 수 있습니다.

## 데이터 저장

Electron `userData` 경로를 사용합니다. Windows 기본 위치는 `%APPDATA%\HTMLViewer`이며 앱의 **저장 폴더 열기**로 확인할 수 있습니다.

```text
HTMLViewer/
├── library.json
├── files/
│   └── <UUID>/index.html
└── Partitions/
    └── study-<UUID>/   # HTML별 웹 저장 공간
```

`library.json`에는 스키마 버전, 카테고리 목록, HTML의 ID·제목·카테고리 ID·원본 파일명·등록일이 저장됩니다. 파일을 복사하므로 원본을 이동·삭제해도 등록한 자료는 유지됩니다.

각 HTML은 고유한 origin과 영구 세션을 사용하므로 `localStorage` 등이 서로 분리되고 재시작 후에도 유지됩니다. HTML 삭제 시 복사본과 웹 저장 데이터를 삭제합니다. 카테고리만 삭제하면 해당 HTML은 미분류로 이동합니다. 앱 제거 시에도 보관함은 유지됩니다. 다른 PC로 옮길 때는 앱을 완전히 종료하고 `userData` 폴더 전체를 백업·복사하세요. 포터블 실행 파일도 자료는 EXE 옆이 아닌 같은 `userData` 경로에 저장합니다.

메타데이터는 임시 파일을 기록·동기화한 뒤 교체합니다. 손상된 `library.json`은 자동 초기화하거나 덮어쓰지 않고 시작 오류를 표시합니다. 저장 폴더는 수동으로 변경하지 않는 것이 좋습니다.

## 개발

Windows x64, Node.js 24 LTS, npm을 기준으로 합니다.

```cmd
npm ci
npm run dev
```

```cmd
npm test
npm run test:smoke
npm run dist
```

`npm run dev`는 개발 서버와 Electron을 함께 시작합니다. `npm start`는 관리 화면을 빌드한 후 Electron을 실행합니다. 패키지 스모크 테스트는 아래처럼 실행할 수 있습니다.

```cmd
set "HTMLVIEWER_SMOKE_EXE=%CD%\release\win-unpacked\HTMLViewer.exe"
node scripts\smoke.cjs
set "HTMLVIEWER_SMOKE_EXE="
```

스모크 테스트는 운영 데이터와 다른 임시 저장 폴더를 사용합니다. 테스트에서만 `HTMLVIEWER_TEST_MODE=1`과 `HTMLVIEWER_TEST_DATA`가 설정됩니다.

## 구조 및 실행 격리

- `electron/main.cjs`: 창 생성, 관리 화면에 한정한 IPC, 파일 선택, HTML별 실행 세션.
- `electron/preload.cjs`: 관리 화면에 필요한 고정 API만 노출.
- `electron/library.cjs`: 파일 복사·삭제, 입력 검증, JSON 저장, 쓰기 요청 직렬화.
- `electron/security.cjs`: HTML 요청 경로 검증과 콘텐츠 보안 정책.
- `src/`: React 보관함 화면.
- `test/`, `scripts/smoke.cjs`: 데이터 보존·실행 격리 및 실제 앱 흐름 검증.

실행 창에는 preload와 Node.js API가 없습니다. `sandbox`, `contextIsolation`, 웹 보안을 활성화하며 등록된 ID의 `index.html`만 사용자 정의 `study://` 프로토콜로 제공합니다. 네트워크·임의 로컬 파일 요청과 다른 HTML의 origin 접근을 차단합니다. 사용자 HTML의 인라인 스크립트와 `eval`은 호환성을 위해 실행 창 내부에서 허용합니다. 관리 화면에는 별도의 엄격한 콘텐츠 보안 정책을 적용합니다.

Electron은 완전한 가상 머신이 아닙니다. 보안 업데이트를 유지하고 신뢰할 수 있는 HTML을 등록하세요.
