import { useCallback, useEffect, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import type { Settings, Theme } from '../../shared/index';
import { Button, Dialog, ErrorState, Spinner, Toast } from '../components/index';
import { useApi, useReadySignal } from '../hooks/index';
import { unwrap, isNavigationGuarded, setNavigationGuard, navigate } from '../lib/index';
import { routes } from './routes';
import { parseHash } from './router';
import { Sidebar } from './Sidebar';
import { PageHeader } from './PageHeader';
import { UpdateBanner } from './UpdateBanner';
import { useTheme } from './theme';
import { useShortcuts } from './shortcuts';
import styles from './App.module.css';

export function App() {
  const [hash, setHash] = useState(() => parseHash());
  const settingsApi = useApi(() => window.qb.settings.get(), []);
  const infoApi = useApi(() => window.qb.app.info(), []);
  const [savedSettings, setSettings] = useState<Settings>();
  const settings = savedSettings ?? settingsApi.value;
  const info = infoApi.value;
  const error = settingsApi.error || infoApi.error || info?.startupError || '';
  const [collapsed, setCollapsed] = useState(false);
  const [toast, setToast] = useState<{ message: string; undo?: () => void }>();
  const [pendingNavigation, setPendingNavigation] = useState<string>();
  const [about, setAbout] = useState(false);
  const closeToast = useCallback(() => setToast(undefined), []);
  useEffect(() => {
    const onHash = () => {
      if (isNavigationGuarded() && !document.documentElement.dataset.captureTheme) {
        const next = location.hash.replace(/^#\/?/u, '');
        history.replaceState(null, '', `#/${hash.route}?${hash.query}`);
        setPendingNavigation(next);
        return;
      }
      delete document.body.dataset.ready;
      setHash(parseHash());
    };
    const request = (event: Event) => setPendingNavigation((event as CustomEvent<string>).detail);
    window.addEventListener('hashchange', onHash);
    window.addEventListener('qb-navigation-request', request);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('qb-navigation-request', request);
    };
  }, [hash]);
  useTheme(settings?.theme, `${hash.route}?${hash.query}`);
  useShortcuts(hash.route, toast?.undo);
  useReadySignal(hash.route, false, error, !!error);
  const page = routes.find(({ id }) => id === hash.route)!;
  const Screen = page.component;
  const updateTheme = async (theme: Theme): Promise<void> => {
    const previous = settings!.theme;
    setSettings(await unwrap(window.qb.settings.update({ theme })));
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
    <div className={styles.app}>
      <Sidebar
        route={hash.route}
        collapsed={collapsed}
        toggle={() => setCollapsed((value) => !value)}
        version={info?.version}
        about={() => setAbout(true)}
      />
      <div className={styles.workspace}>
        <UpdateBanner />
        <PageHeader page={page} />
        <main key={`${hash.route}?${hash.query}`}>
          {error ? (
            <ErrorState
              message={error}
              retry={
                info?.startupError
                  ? undefined
                  : () => {
                      settingsApi.retry();
                      infoApi.retry();
                    }
              }
            />
          ) : !settings || !info ? (
            <Spinner />
          ) : (
            <Screen
              route={page}
              query={hash.query}
              settings={settings}
              info={info}
              update={updateTheme}
              notify={(message) => setToast({ message })}
            />
          )}
          {info?.startupError && (
            <div className={styles.recovery}>
              <p>
                원본 DB를 보관한 뒤 백업의 bank.sqlite와 동반 -wal/-shm 파일을 함께 복원하고 앱을 다시
                실행하세요.
              </p>
              <p className={styles['path-caption']}>{info.dataDir}</p>
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
      {pendingNavigation && (
        <Dialog title="저장하지 않은 변경이 있습니다" close={() => setPendingNavigation(undefined)}>
          <p>다른 화면으로 이동하면 입력한 변경을 잃습니다.</p>
          <Button
            variant="danger"
            onClick={() => {
              setNavigationGuard(false);
              navigate(pendingNavigation);
              setPendingNavigation(undefined);
            }}
          >
            변경을 버리고 이동
          </Button>
          <Button onClick={() => setPendingNavigation(undefined)}>계속 편집</Button>
        </Dialog>
      )}
      {about && (
        <Dialog title="문제은행" close={() => setAbout(false)}>
          <p>버전 {info?.version}</p>
          <p>업데이트 확인은 5D 단계에서 제공됩니다.</p>
        </Dialog>
      )}
    </div>
  );
}
