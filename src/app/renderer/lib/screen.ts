import type { LucideIcon } from 'lucide-react';
import type { AppInfo, Settings, Theme } from '../../shared/index';

export interface ScreenProps {
  query: URLSearchParams;
  settings: Settings;
  info: AppInfo;
  update: (theme: Theme) => Promise<void>;
  notify: (message: string) => void;
  route: { id: string; title: string; description: string; icon: LucideIcon };
}
