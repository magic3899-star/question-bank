import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FilePlus2,
  FileText,
  FolderOpen,
  History,
  Home,
  Image as ImageIcon,
  Library,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Upload,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type {
  AppInfo,
  BankStats,
  ObjectiveNode,
  QuestionDetail,
  QuestionSummary,
  Result,
  Settings,
  Theme,
} from '../shared/api';
import { renderQuestionHtml } from '../../modules/render-html/index';
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  SearchInput,
  Skeleton,
  Spinner,
  Tabs,
  Toast,
  Tooltip,
} from './components/index';
import './styles/tokens.css';
import './styles/app.css';

const navigation: { route: string; label: string; icon: LucideIcon; description: string }[] = [
  { route: 'home', label: '홈', icon: Home, description: '문제은행 현황을 한눈에 확인하세요.' },
  { route: 'bank', label: '문제은행', icon: Library, description: '학습목표별로 문제를 찾아보세요.' },
  {
    route: 'import',
    label: '가져오기',
    icon: Upload,
    description: '문서의 문제를 분석하고 검수해 저장합니다.',
  },
  {
    route: 'add',
    label: '문제 추가',
    icon: FilePlus2,
    description: '본문·예문·선지와 해설을 직접 입력합니다.',
  },
  {
    route: 'generate',
    label: '시험 만들기',
    icon: ClipboardList,
    description: '출제 규칙에 맞춰 시험을 만듭니다.',
  },
  {
    route: 'rules',
    label: '출제 규칙',
    icon: SlidersHorizontal,
    description: '학습목표별 문제 수와 출제 조건을 관리합니다.',
  },
  {
    route: 'history',
    label: '출제 이력',
    icon: History,
    description: '만든 시험과 당시 확정본을 확인합니다.',
  },
  { route: 'settings', label: '설정', icon: SettingsIcon, description: '프로그램 환경을 관리합니다.' },
];
function navigate(route: string): void {
  location.hash = `#/${route}`;
}
function parseHash() {
  const [route, query] = location.hash.replace(/^#\/?/u, '').split('?');
  return {
    route: navigation.some((n) => n.route === route) ? route! : 'home',
    query: new URLSearchParams(query),
  };
}
async function unwrap<T>(promise: Promise<Result<T>>): Promise<T> {
  try {
    const result = await promise;
    if (!result.ok) throw new Error(result.message);
    return result.value;
  } catch (cause) {
    throw new Error(
      cause instanceof Error && /[가-힣]/u.test(cause.message)
        ? cause.message
        : '프로그램과 연결하지 못했습니다. 앱을 다시 실행하세요.',
    );
  }
}
function ready(route: string, error = ''): void {
  document.body.dataset.ready = route;
  document.body.dataset.error = error;
}
function useReady(route: string, loading: boolean, error = ''): void {
  useEffect(() => {
    if (loading) delete document.body.dataset.ready;
    else ready(route, error);
  }, [route, loading, error]);
}

function HomePage() {
  const [stats, setStats] = useState<BankStats>();
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setStats(undefined);
    setError('');
    void unwrap(window.qb.bank.stats())
      .then((value) => {
        if (active) setStats(value);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  useReady('home', !stats && !error, error);
  if (error) return <ErrorState message={error} retry={() => setRevision((n) => n + 1)} />;
  if (!stats) return <Spinner />;
  return (
    <div className="home-page">
      <div className="section-heading">
        <div>
          <h2>문제은행 현황</h2>
          <p>저장된 문제를 확인하고 작업을 시작하세요.</p>
        </div>
        <span className="muted">
          전체 <strong>{stats.total.toLocaleString('ko-KR')}</strong>문제
        </span>
      </div>
      {stats.total === 0 ? (
        <Card title="첫 문제를 등록해 보세요">
          <EmptyState
            icon={<BookOpen />}
            title="아직 저장된 문제가 없습니다"
            description="문제를 가져오거나 직접 추가해 보세요"
          >
            <Button onClick={() => navigate('import')}>
              <Upload />
              문제 가져오기
            </Button>
            <Button onClick={() => navigate('add')}>
              <Plus />
              직접 추가
            </Button>
          </EmptyState>
        </Card>
      ) : (
        <div className="subject-cards">
          {stats.bySubject.map((subject) => (
            <button
              className="card subject-card"
              key={subject.subject}
              onClick={() => navigate(`bank?subject=${encodeURIComponent(subject.subject)}`)}
            >
              <div>
                <BookOpen />
                <span>{subject.name}</span>
                <ChevronRight />
              </div>
              <strong className="count">
                {subject.count.toLocaleString('ko-KR')}
                <small>문제</small>
              </strong>
              <p>학습목표별 문제 살펴보기</p>
            </button>
          ))}
        </div>
      )}
      <div className="home-columns">
        <Card title="주의 필요">
          <div className="notice">
            <AlertTriangle aria-hidden="true" />
            <div>
              <strong>학습목표 없는 문제 {stats.warnings.withoutObjective}개</strong>
              <p>출제하려면 학습목표를 지정해야 합니다.</p>
            </div>
          </div>
          <Button
            disabledReason={stats.warnings.withoutObjective ? undefined : '학습목표 없는 문제가 없습니다.'}
            onClick={() => navigate('bank?withoutObjective=1')}
          >
            문제 확인
            <ArrowRight />
          </Button>
        </Card>
        <Card title="최근 시험">
          <EmptyState
            icon={<History />}
            title="아직 만든 시험이 없습니다"
            description="시험 만들기는 다음 단계에서 제공됩니다."
          />
        </Card>
      </div>
      <div className="help-strip">
        <Library />
        <span>문제은행에서 문항과 정답·해설을 확인할 수 있습니다.</span>
        <Button onClick={() => navigate('bank')}>문제은행 열기</Button>
      </div>
    </div>
  );
}
function TreeNodes({
  nodes,
  selected,
  select,
}: {
  nodes: ObjectiveNode[];
  selected: string;
  select: (code: string) => void;
}) {
  return (
    <ul className="tree-nodes">
      {nodes.map((node) => (
        <li key={node.code}>
          {node.children.length ? (
            <details>
              <summary>
                <ChevronRight />
                <span>{node.code}</span>
                <span className="tree-count">{node.count}</span>
              </summary>
              <button
                className={selected === node.code ? 'selected tree-filter' : 'tree-filter'}
                onClick={() => select(node.code)}
              >
                이 단원 전체 보기
              </button>
              <TreeNodes nodes={node.children} selected={selected} select={select} />
            </details>
          ) : (
            <button className={selected === node.code ? 'selected' : ''} onClick={() => select(node.code)}>
              <span>{node.code}</span>
              <span className="tree-count">{node.count}</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
function BankPage({ query }: { query: URLSearchParams }) {
  const [stats, setStats] = useState<BankStats>();
  const [subject, setSubject] = useState(query.get('subject') ?? '');
  const [objective, setObjective] = useState('');
  const [withoutObjective, setWithoutObjective] = useState(query.get('withoutObjective') === '1');
  const [tree, setTree] = useState<Record<string, ObjectiveNode[]>>({});
  const [search, setSearch] = useState('');
  const [text, setText] = useState('');
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<QuestionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<QuestionDetail>();
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [frameReady, setFrameReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const selectedRef = useRef('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setText(search.trim());
      setOffset(0);
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let active = true;
    void unwrap(window.qb.bank.stats())
      .then(async (value) => {
        const trees = await Promise.all(
          value.bySubject.map(
            async (s) => [s.subject, await unwrap(window.qb.bank.objectiveTree(s.subject))] as const,
          ),
        );
        if (active) {
          setStats(value);
          setTree(Object.fromEntries(trees));
        }
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void unwrap(
      window.qb.bank.list({
        subject: subject || undefined,
        objectivePrefix: objective || undefined,
        text: text || undefined,
        withoutObjective,
        offset,
        limit: 50,
      }),
    )
      .then((value) => {
        if (!active) return;
        setItems(value.items);
        setTotal(value.total);
        const id = value.items[0]?.id ?? '';
        selectedRef.current = id;
        setSelected(id);
        if (!id) {
          setDetail(undefined);
          setDetailError('');
        }
        setLoading(false);
      })
      .catch((cause: Error) => {
        if (active) {
          setError(cause.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [subject, objective, text, withoutObjective, offset, revision]);
  useEffect(() => {
    if (!selected) {
      setDetailLoading(false);
      return;
    }
    let active = true;
    setDetailLoading(true);
    setDetail(undefined);
    setDetailError('');
    setFrameReady(false);
    void unwrap(window.qb.bank.get(selected))
      .then((value) => {
        if (active && selectedRef.current === selected) {
          setDetail(value);
          setDetailLoading(false);
        }
      })
      .catch((cause: Error) => {
        if (active) {
          setDetailError(cause.message);
          setDetailLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [selected, revision]);
  useReady(
    'bank',
    loading ||
      (!stats && !error) ||
      detailLoading ||
      (!!selected && !detail && !detailError && !error) ||
      (!!detail && !frameReady),
    error || detailError,
  );
  const filter = (nextSubject: string, code = '') => {
    setSubject(nextSubject);
    setObjective(code);
    setOffset(0);
  };
  const html = React.useMemo(
    () => (detail ? renderQuestionHtml(detail.question, detail.assets) : ''),
    [detail],
  );
  return (
    <div className="bank-page">
      <aside className="filter-panel" aria-label="학습목표 필터">
        <h2>학습목표</h2>
        <button
          className={!subject && !withoutObjective ? 'filter-all selected' : 'filter-all'}
          onClick={() => {
            filter('');
            setWithoutObjective(false);
          }}
        >
          <Library />
          전체 문제<span>{stats?.total ?? '—'}</span>
        </button>
        <label className="check-filter">
          <input
            type="checkbox"
            checked={withoutObjective}
            onChange={(event) => {
              setWithoutObjective(event.target.checked);
              setOffset(0);
            }}
          />
          <span>학습목표 없음</span>
        </label>
        {stats?.bySubject.map((s) => (
          <section className="subject-tree" key={s.subject}>
            <button
              className={subject === s.subject && !objective ? 'selected' : ''}
              onClick={() => filter(s.subject)}
            >
              <BookOpen />
              <strong>{s.name}</strong>
              <span className="tree-count">{s.count}</span>
            </button>
            <TreeNodes
              nodes={tree[s.subject] ?? []}
              selected={objective}
              select={(code) => filter(s.subject, code)}
            />
          </section>
        ))}
      </aside>
      <section className="question-list-panel" aria-label="문제 목록">
        <div className="list-toolbar">
          <SearchInput id="quick-search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <div className="list-summary">
            <strong>{total.toLocaleString('ko-KR')}문제</strong>
            <span>보기 전용</span>
          </div>
          {(subject || objective || withoutObjective) && (
            <div className="active-filter">
              <span>
                {objective || stats?.bySubject.find((s) => s.subject === subject)?.name || '전체 과목'}
                {withoutObjective ? ' · 학습목표 없음' : ''}
              </span>
              <Button
                onClick={() => {
                  filter('');
                  setWithoutObjective(false);
                }}
              >
                필터 해제
              </Button>
            </div>
          )}
        </div>
        <div className="question-list" aria-busy={loading}>
          {loading ? (
            <Skeleton />
          ) : error ? (
            <ErrorState message={error} retry={() => setRevision((n) => n + 1)} />
          ) : !items.length ? (
            <EmptyState
              icon={<SearchIcon />}
              title="검색 결과가 없습니다"
              description="검색어나 학습목표 필터를 바꿔 보세요."
            />
          ) : (
            items.map((item) => (
              <button
                className={`question-row ${selected === item.id ? 'selected' : ''}`}
                key={item.id}
                aria-pressed={selected === item.id}
                onClick={() => {
                  selectedRef.current = item.id;
                  setSelected(item.id);
                }}
              >
                <div className="row-meta">
                  <span>{item.objectiveCode || '학습목표 없음'}</span>
                  {item.grade && <Badge>{item.grade}등급</Badge>}
                  {item.warnings > 0 && (
                    <Tooltip label={`주의 ${item.warnings}건`}>
                      <span className="warning-inline">
                        <AlertTriangle />
                        {item.warnings}
                      </span>
                    </Tooltip>
                  )}
                </div>
                <p>{item.stemPreview}</p>
                <span className="row-icons">
                  {item.hasPassage && (
                    <span>
                      <FileText />
                      지문
                    </span>
                  )}
                  {item.hasImage && (
                    <span>
                      <ImageIcon />
                      이미지
                    </span>
                  )}
                  <span>선지 {item.choiceCount}개</span>
                </span>
              </button>
            ))
          )}
        </div>
        <div className="pagination">
          <Button
            aria-label="이전 페이지"
            disabled={offset === 0 || loading}
            onClick={() => setOffset((n) => Math.max(0, n - 50))}
          >
            <ArrowLeft />
          </Button>
          <span>
            {total ? Math.floor(offset / 50) + 1 : 0} / {Math.ceil(total / 50)}
          </span>
          <Button
            aria-label="다음 페이지"
            disabled={offset + 50 >= total || loading}
            onClick={() => setOffset((n) => n + 50)}
          >
            <ArrowRight />
          </Button>
        </div>
      </section>
      <section className="detail-panel" aria-label="문항 상세">
        <div className="detail-heading">
          <div>
            <h2>문항 미리보기</h2>
            <p>출력과 같은 문항 렌더러</p>
          </div>
          {detail?.question.grade && <Badge>{detail.question.grade}등급</Badge>}
        </div>
        {detailLoading ? (
          <Spinner label="문항을 불러오고 있습니다" />
        ) : detailError ? (
          <ErrorState message={detailError} retry={() => setRevision((n) => n + 1)} />
        ) : detail ? (
          <iframe
            title="문항·정답·해설 미리보기"
            sandbox=""
            srcDoc={html}
            onLoad={() => setFrameReady(true)}
          />
        ) : (
          <EmptyState
            icon={<FileText />}
            title="문제를 선택하세요"
            description="본문과 정답·해설을 확인할 수 있습니다."
          />
        )}
        <div className="detail-footer">
          <span>문항 편집은 다음 단계에서 제공됩니다.</span>
        </div>
      </section>
    </div>
  );
}
const SearchIcon = Library;
function SettingsPage({
  settings,
  info,
  update,
  notify,
}: {
  settings: Settings;
  info: AppInfo;
  update: (theme: Theme) => Promise<void>;
  notify: (text: string) => void;
}) {
  useReady('settings', false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="settings-page">
      <Card title="화면 테마">
        <p>작업 환경에 맞는 밝기를 선택하세요.</p>
        <div aria-busy={busy}>
          <Tabs
            label="화면 테마"
            value={settings.theme}
            items={[
              { id: 'system', label: '시스템' },
              { id: 'light', label: '라이트' },
              { id: 'dark', label: '다크' },
            ]}
            onChange={(theme) => {
              if (busy) return;
              setBusy(true);
              setError('');
              void update(theme)
                .catch((cause: Error) => setError(cause.message))
                .finally(() => setBusy(false));
            }}
          />
        </div>
        {error && (
          <p role="alert" className="danger">
            {error}
          </p>
        )}
      </Card>
      <Card title="데이터 폴더">
        <p>문제와 설정은 프로그램 설치 폴더와 분리해 보관합니다.</p>
        <label className="field">
          데이터 위치
          <input readOnly value={info.dataDir} />
        </label>
        <p className="path-caption">DB: {info.dbPath}</p>
        <Button
          onClick={() => {
            void unwrap(window.qb.app.openDataDir()).catch((cause: Error) => notify(cause.message));
          }}
        >
          <FolderOpen />
          데이터 폴더 열기
        </Button>
      </Card>
      <Card title="추가 설정">
        <EmptyState
          icon={<SettingsIcon />}
          title="다음 단계에서 제공됩니다"
          description="백업·복원, 업데이트와 출력 환경 설정을 준비하고 있습니다."
        />
      </Card>
    </div>
  );
}
function App() {
  const [hash, setHash] = useState(parseHash);
  const [settings, setSettings] = useState<Settings>();
  const [info, setInfo] = useState<AppInfo>();
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [toast, setToast] = useState<{ message: string; undo?: () => void }>();
  const [about, setAbout] = useState(false);
  const closeToast = useCallback(() => setToast(undefined), []);
  useEffect(() => {
    const onHash = () => {
      delete document.body.dataset.ready;
      setHash(parseHash());
    };
    window.addEventListener('hashchange', onHash);
    void Promise.resolve()
      .then(() => Promise.all([unwrap(window.qb.settings.get()), unwrap(window.qb.app.info())]))
      .then(([next, appInfo]) => {
        setSettings(next);
        setInfo(appInfo);
      })
      .catch((cause: Error) => setError(cause.message));
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    if (settings) {
      const capture = document.documentElement.dataset.captureTheme;
      if (capture) document.documentElement.dataset.theme = capture;
      else if (settings.theme === 'system') delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = settings.theme;
    }
  }, [settings, hash]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (hash.route !== 'bank') navigate('bank');
        setTimeout(() => document.getElementById('quick-search')?.focus(), 100);
      }
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        navigate('add');
      }
      if (event.key.toLowerCase() === 'g') {
        event.preventDefault();
        navigate('generate');
      }
      if (
        event.key.toLowerCase() === 'z' &&
        !event.shiftKey &&
        toast?.undo &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        toast.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hash.route, toast]);
  useEffect(() => {
    if (error || info?.startupError) ready(hash.route, error || info?.startupError);
    else if (settings && info && hash.route !== 'home' && hash.route !== 'bank' && hash.route !== 'settings')
      ready(hash.route);
  }, [error, info, settings, hash]);
  const page = navigation.find((n) => n.route === hash.route)!;
  const Icon = page.icon;
  const updateTheme = async (theme: Theme): Promise<void> => {
    const previous = settings!.theme;
    const next = await unwrap(window.qb.settings.update({ theme }));
    setSettings(next);
    setToast({
      message: '화면 테마를 저장했습니다.',
      undo: () => {
        void unwrap(window.qb.settings.update({ theme: previous }))
          .then(setSettings)
          .catch((cause: Error) => setToast({ message: cause.message }));
        setToast(undefined);
      },
    });
  };
  return (
    <div className={`app ${collapsed ? 'collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <BookOpen />
          <span>문제은행</span>
        </div>
        <Button
          className="collapse-button"
          aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          {!collapsed && '메뉴 접기'}
        </Button>
        <nav aria-label="주 메뉴">
          {navigation.map(({ route, label, icon: MenuIcon }, index) => (
            <React.Fragment key={route}>
              {index === 4 && <div className="nav-separator" />}
              <a
                href={`#/${route}`}
                aria-label={label}
                title={collapsed ? label : undefined}
                className={hash.route === route ? 'active' : ''}
                aria-current={hash.route === route ? 'page' : undefined}
              >
                <MenuIcon aria-hidden="true" />
                <span>{label}</span>
                {hash.route === route && !collapsed && <ChevronRight />}
              </a>
            </React.Fragment>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="local-status">
            <span />내 PC에 안전하게 저장
          </span>
          <Button onClick={() => setAbout(true)} aria-label="프로그램 버전 안내">
            {collapsed ? '버전' : `버전 ${info?.version ?? '—'}`}
          </Button>
        </div>
      </aside>
      <div className="workspace">
        <header className="page-header">
          <div>
            <h1>{page.label}</h1>
            <p>{page.description}</p>
          </div>
          <div className="header-actions">
            {hash.route === 'home' && (
              <Button variant="primary" onClick={() => navigate('import')}>
                <Upload />
                문제 가져오기
              </Button>
            )}
            {hash.route === 'bank' && (
              <>
                <span className="keyboard-hint">Ctrl+K 검색</span>
                <Button disabledReason="문제 추가는 다음 단계에서 제공됩니다.">
                  <Plus />
                  문제 추가
                </Button>
              </>
            )}
          </div>
        </header>
        <main key={location.hash}>
          {error || info?.startupError ? (
            <ErrorState message={error || info!.startupError!} />
          ) : !settings || !info ? (
            <Spinner />
          ) : hash.route === 'home' ? (
            <HomePage />
          ) : hash.route === 'bank' ? (
            <BankPage query={hash.query} />
          ) : hash.route === 'settings' ? (
            <SettingsPage
              settings={settings}
              info={info}
              update={updateTheme}
              notify={(message) => setToast({ message })}
            />
          ) : (
            <EmptyState icon={<Icon />} title="다음 단계에서 제공됩니다" description={page.description} />
          )}
          {info?.startupError && (
            <div className="recovery">
              <p>
                원본 DB를 보관한 뒤 백업의 bank.sqlite와 동반 -wal/-shm 파일을 함께 복원하고 앱을 다시
                실행하세요.
              </p>
              <p className="path-caption">{info.dataDir}</p>
              <Button
                onClick={() => {
                  void unwrap(window.qb.app.openDataDir()).catch((cause: Error) =>
                    setToast({ message: cause.message }),
                  );
                }}
              >
                <FolderOpen />
                데이터 폴더 열기
              </Button>
            </div>
          )}
        </main>
      </div>
      {toast && <Toast message={toast.message} undo={toast.undo} close={closeToast} />}{' '}
      {about && (
        <Dialog title="문제은행" close={() => setAbout(false)}>
          <p>버전 {info?.version}</p>
          <p>업데이트 확인은 5D 단계에서 제공됩니다.</p>
        </Dialog>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
