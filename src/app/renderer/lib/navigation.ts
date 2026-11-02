export function navigate(route: string): void {
  location.hash = `#/${route}`;
}
