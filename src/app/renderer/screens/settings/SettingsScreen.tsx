import { useState } from 'react';
import { FolderOpen } from 'lucide-react';
import type { AppInfo, Settings, Theme } from '../../../shared/index';
import { Button, Card, Tabs } from '../../components/index';
import { BackupCard } from './BackupCard';
import { UpdateCard } from './UpdateCard';
import { useReadySignal } from '../../hooks/index';
import { unwrap } from '../../lib/index';
import styles from './SettingsScreen.module.css';
export function SettingsScreen({
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
  useReadySignal('settings', false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className={styles['settings-page']}>
      <Card title="화면 테마">
        <p>작업 환경에 맞는 밝기를 선택하세요.</p>
        <div aria-busy={busy}>
          <Tabs
            label="화면 테마"
            value={settings.theme}
            items={[
              { id: 'light', label: '밝게' },
              { id: 'dark', label: '어둡게' },
              { id: 'system', label: 'Windows 설정 따르기' },
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
          <p role="alert" className={styles['danger']}>
            {error}
          </p>
        )}
      </Card>
      <Card title="데이터 폴더">
        <p>문제와 설정은 프로그램 설치 폴더와 분리해 보관합니다.</p>
        <label className={styles['field']}>
          데이터 위치
          <input readOnly value={info.dataDir} />
        </label>
        <p className={styles['path-caption']}>DB: {info.dbPath}</p>
        <Button
          onClick={() => {
            void unwrap(window.qb.app.openDataDir()).catch((cause: Error) => notify(cause.message));
          }}
        >
          <FolderOpen />
          데이터 폴더 열기
        </Button>
      </Card>
      <BackupCard notify={notify} />
      <UpdateCard info={info} notify={notify} />
    </div>
  );
}
