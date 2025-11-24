export function getHostLocale(host: string): string {
  if (host.endsWith(".cn")) return "cn";
  if (host.endsWith(".com.hk")) return "en";
  return "en";
}
