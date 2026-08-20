export type FetchResult = {
  status: number;
  contentType: string;
  body: string;
};

export type UrlFetcher = (url: string) => Promise<FetchResult>;

export async function defaultUrlFetcher(url: string): Promise<FetchResult> {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "summer-sum-kb/0.1" },
    signal: AbortSignal.timeout(10_000),
  });
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    body: await response.text(),
  };
}
