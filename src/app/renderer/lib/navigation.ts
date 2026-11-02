let guarded = false;
export function isNavigationGuarded(): boolean {
  return guarded;
}
export function setNavigationGuard(value: boolean): void {
  guarded = value;
}
export function navigate(route: string): void {
  if (guarded) {
    window.dispatchEvent(new CustomEvent<string>('qb-navigation-request', { detail: route }));
    return;
  }
  location.hash = `#/${route}`;
}
