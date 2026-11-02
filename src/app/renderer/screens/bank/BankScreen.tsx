import { useState } from 'react';
import type { QuestionDetail } from '../../../shared/index';
import { useReadySignal } from '../../hooks/index';
import { useBankData } from './useBankData';
import { ObjectiveTree } from './ObjectiveTree';
import { QuestionList } from './QuestionList';
import { BankActions } from './BankActions';
import { QuestionPreview } from '../../components/index';
import styles from './BankScreen.module.css';

export function BankScreen({ query }: { query: URLSearchParams }) {
  const bank = useBankData(query);
  const [painted, setPainted] = useState<QuestionDetail>();
  const error = bank.error || bank.detailError;
  useReadySignal(
    'bank',
    !error &&
      (bank.loading ||
        bank.overviewLoading ||
        bank.detailLoading ||
        (!!bank.selected && (!bank.detail || painted !== bank.detail))),
    error,
  );
  return (
    <div className={styles['bank-page']}>
      <ObjectiveTree {...bank} />
      <QuestionList {...bank} />
      <QuestionPreview
        actions={<BankActions detail={bank.detail} refresh={bank.retry} />}
        detail={bank.detail}
        loading={bank.detailLoading}
        error={bank.detailError}
        retry={bank.retryDetail}
        onReady={setPainted}
      />
    </div>
  );
}
