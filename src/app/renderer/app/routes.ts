import type { ComponentType } from 'react';
import {
  Home,
  Library,
  Upload,
  FilePlus2,
  ClipboardList,
  SlidersHorizontal,
  History,
  Settings,
} from 'lucide-react';
import { routes as definitions } from '../../shared/index';
import type { ScreenProps } from '../lib/index';

const icons = { Home, Library, Upload, FilePlus2, ClipboardList, SlidersHorizontal, History, Settings };
const screens = import.meta.glob<{ Screen: ComponentType<ScreenProps> }>('../screens/*/index.ts', {
  eager: true,
});
export const routes = definitions.map(({ icon, ...definition }) => ({
  ...definition,
  icon: icons[icon],
  component: (screens[
    `../screens/${definition.id === 'add' || definition.id === 'edit' ? 'editor' : definition.id}/index.ts`
  ] ?? screens['../screens/coming-soon/index.ts'])!.Screen,
}));
