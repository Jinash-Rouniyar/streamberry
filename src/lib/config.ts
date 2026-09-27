/** Must match `basePath` in next.config.mjs. Next does not prefix `fetch`. */
export const BASE_PATH = "/streamberry";

export function apiUrl(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_PATH}${suffix}`;
}
