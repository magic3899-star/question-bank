export const routes = [
  { id: 'home', title: '홈', icon: 'Home', description: '문제은행 현황을 한눈에 확인하세요.' },
  { id: 'bank', title: '문제은행', icon: 'Library', description: '학습목표별로 문제를 찾아보세요.' },
  {
    id: 'import',
    title: '가져오기',
    icon: 'Upload',
    description: '문서의 문제를 분석하고 검수해 저장합니다.',
  },
  {
    id: 'add',
    title: '문제 추가',
    icon: 'FilePlus2',
    description: '본문·예문·선지와 해설을 직접 입력합니다.',
  },
  { id: 'edit', title: '문제 편집', icon: 'FilePlus2', description: '저장된 문제와 해설을 수정합니다.' },
  {
    id: 'generate',
    title: '시험 만들기',
    icon: 'ClipboardList',
    description: '출제 규칙에 맞춰 시험을 만듭니다.',
  },
  {
    id: 'rules',
    title: '출제 규칙',
    icon: 'SlidersHorizontal',
    description: '학습목표별 문제 수와 출제 조건을 관리합니다.',
  },
  {
    id: 'history',
    title: '출제 이력',
    icon: 'History',
    description: '만든 시험과 당시 확정본을 확인합니다.',
  },
  { id: 'settings', title: '설정', icon: 'Settings', description: '프로그램 환경을 관리합니다.' },
] as const;

export const routeIds = routes.map(({ id }) => id);
