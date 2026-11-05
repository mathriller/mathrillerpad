import { useBoardRoute } from './hooks/useBoardRoute';
import HubPage from './components/hub/HubPage';
import BoardPage from './components/board/BoardPage';

/** 최상위 라우터: ?board 파라미터 유무로 허브 / 개별 보드 전환 */
export default function App() {
  const { boardId, navigate } = useBoardRoute();
  return boardId ? (
    <BoardPage key={boardId} boardId={boardId} navigate={navigate} />
  ) : (
    <HubPage navigate={navigate} />
  );
}
