import { Plus, Upload } from 'lucide-react';
import { Button } from '../components/index';
import { navigate } from './router';
import styles from './PageHeader.module.css';

export function PageHeader({ page }: { page: { id: string; title: string; description: string } }) {
  return (
    <header className={styles['page-header']}>
      <div>
        <h1>{page.title}</h1>
        <p>{page.description}</p>
      </div>
      <div className={styles['header-actions']}>
        {page.id === 'home' && (
          <Button variant="primary" onClick={() => navigate('import')}>
            <Upload />
            문제 가져오기
          </Button>
        )}
        {page.id === 'bank' && (
          <>
            <span className={styles['keyboard-hint']}>Ctrl+K 검색</span>
            <Button onClick={() => navigate('add')}>
              <Plus />
              문제 추가
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
