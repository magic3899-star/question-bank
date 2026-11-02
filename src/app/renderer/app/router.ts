import { routeIds } from '../../shared/index';

export { navigate } from '../lib/index';

export function parseHash(hash = location.hash) {
  const [route, query] = hash.replace(/^#\/?/u, '').split('?');
  return {
    route: routeIds.find((id) => id === route) ?? 'home',
    query: new URLSearchParams(query),
  };
}
