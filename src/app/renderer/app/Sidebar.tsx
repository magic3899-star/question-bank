import { Fragment } from 'react';
import { BookOpen, PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { Button, Tooltip } from '../components/index';
import { routes } from './routes';
import styles from './Sidebar.module.css';

export function Sidebar({
  route,
  collapsed,
  toggle,
  version,
  about,
}: {
  route: string;
  collapsed: boolean;
  toggle: () => void;
  version?: string;
  about: () => void;
}) {
  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
      <div className={styles.brand}>
        <BookOpen />
        <span>문제은행</span>
      </div>
      <nav aria-label="주 메뉴">
        {routes.map(({ id, title, icon: Icon }) => (
          <Fragment key={id}>
            {id === 'generate' && <div className={styles['nav-separator']} />}
            <a
              href={`#/${id}`}
              aria-label={title}
              title={collapsed ? title : undefined}
              className={route === id ? styles.active : ''}
              aria-current={route === id ? 'page' : undefined}
            >
              <Icon aria-hidden="true" />
              <span>{title}</span>
            </a>
          </Fragment>
        ))}
      </nav>
      <div className={styles['sidebar-bottom']}>
        <span className={styles['local-status']}>
          <span />내 PC에 안전하게 저장
        </span>
        <Tooltip label={collapsed ? '메뉴 펼치기' : '메뉴 접기'}>
          <Button
            className={styles['collapse-button']}
            aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
            onClick={toggle}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            {!collapsed && '메뉴 접기'}
          </Button>
        </Tooltip>
        <Button onClick={about} aria-label="프로그램 버전 안내">
          {collapsed ? '버전' : `버전 ${version ?? '—'}`}
        </Button>
      </div>
    </aside>
  );
}
