import { getRequestConfig } from "next-intl/server";
export default getRequestConfig(async () => {
  const locale = "en";

  console.log(locale);
  const messages = (await import(`../../locales/${locale}.json`)).default;
  return {
    locale,
    messages,
  };
});
