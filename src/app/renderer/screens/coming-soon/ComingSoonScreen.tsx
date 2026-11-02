import type { ScreenProps } from '../../lib/index';
import { EmptyState } from '../../components/index';
import { useReadySignal } from '../../hooks/index';

export function ComingSoonScreen({ route }: ScreenProps) {
  useReadySignal(route.id, false);
  const Icon = route.icon;
  return <EmptyState icon={<Icon />} title="다음 단계에서 제공됩니다" description={route.description} />;
}
