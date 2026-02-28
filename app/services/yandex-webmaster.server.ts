/**
 * Yandex Webmaster API
 *
 * Provides index status + search traffic data from Yandex.
 * Requires an OAuth token from Yandex Webmaster.
 * https://yandex.com/dev/webmaster/doc/dg/reference/hosts.html
 */

const BASE_URL = "https://api.webmaster.yandex.net/v4";

export interface YandexHostInfo {
  hostId: string;
  asciiHostUrl: string;
  verified: boolean;
}

export async function getHosts(
  oauthToken: string
): Promise<YandexHostInfo[]> {
  const response = await fetch(`${BASE_URL}/user/hosts`, {
    headers: { Authorization: `OAuth ${oauthToken}` },
  });

  if (!response.ok) {
    throw new Error(`Yandex Webmaster API error: ${response.status}`);
  }

  const data: any = await response.json();
  return (data.hosts || []).map((h: any) => ({
    hostId: h.host_id,
    asciiHostUrl: h.ascii_host_url,
    verified: h.verified,
  }));
}

export async function findHostId(
  oauthToken: string,
  shopDomain: string
): Promise<string | null> {
  const hosts = await getHosts(oauthToken);
  const match = hosts.find(
    (h) =>
      h.asciiHostUrl.includes(shopDomain) ||
      shopDomain.includes(h.asciiHostUrl.replace(/^https?:\/\//, ""))
  );
  return match?.hostId || null;
}

export interface YandexIndexStatus {
  indexedPages: number;
  excludedPages: number;
  searchablePages: number;
}

export async function getIndexStatus(
  oauthToken: string,
  userId: string,
  hostId: string
): Promise<YandexIndexStatus> {
  const response = await fetch(
    `${BASE_URL}/user/${userId}/hosts/${hostId}/summary`,
    {
      headers: { Authorization: `OAuth ${oauthToken}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Yandex index status error: ${response.status}`);
  }

  const data: any = await response.json();

  return {
    indexedPages: data.searchable_pages_count || 0,
    excludedPages: data.excluded_pages_count || 0,
    searchablePages: data.searchable_pages_count || 0,
  };
}

export interface YandexTrafficData {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  avgPosition: number;
}

export async function getSearchTraffic(
  oauthToken: string,
  userId: string,
  hostId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<YandexTrafficData[]> {
  const now = new Date();
  const from =
    dateFrom ||
    new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
  const to = dateTo || now.toISOString().split("T")[0];

  const response = await fetch(
    `${BASE_URL}/user/${userId}/hosts/${hostId}/search-queries/all/history?query_indicator=TOTAL_SHOWS&query_indicator=TOTAL_CLICKS&query_indicator=AVG_SHOW_POSITION&date_from=${from}&date_to=${to}`,
    {
      headers: { Authorization: `OAuth ${oauthToken}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Yandex traffic API error: ${response.status}`);
  }

  const data: any = await response.json();
  const indicators = data.indicators || {};

  const shows = indicators.TOTAL_SHOWS || [];
  const clicks = indicators.TOTAL_CLICKS || [];
  const positions = indicators.AVG_SHOW_POSITION || [];

  const results: YandexTrafficData[] = [];
  for (let i = 0; i < shows.length; i++) {
    const showVal = shows[i]?.value || 0;
    const clickVal = clicks[i]?.value || 0;
    results.push({
      date: shows[i]?.date || "",
      clicks: clickVal,
      impressions: showVal,
      ctr: showVal > 0 ? Math.round((clickVal / showVal) * 10000) / 100 : 0,
      avgPosition: positions[i]?.value || 0,
    });
  }

  return results;
}

export interface YandexTopQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export async function getTopQueries(
  oauthToken: string,
  userId: string,
  hostId: string
): Promise<YandexTopQuery[]> {
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const to = now.toISOString().split("T")[0];

  const response = await fetch(
    `${BASE_URL}/user/${userId}/hosts/${hostId}/search-queries/popular?order_by=TOTAL_CLICKS&date_from=${from}&date_to=${to}&query_indicator=TOTAL_SHOWS&query_indicator=TOTAL_CLICKS&query_indicator=AVG_CLICK_POSITION`,
    {
      headers: { Authorization: `OAuth ${oauthToken}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Yandex top queries error: ${response.status}`);
  }

  const data: any = await response.json();
  return (data.queries || []).slice(0, 30).map((q: any) => ({
    query: q.query_text || "",
    clicks: q.indicators?.TOTAL_CLICKS || 0,
    impressions: q.indicators?.TOTAL_SHOWS || 0,
    ctr:
      q.indicators?.TOTAL_SHOWS > 0
        ? Math.round(
            (q.indicators.TOTAL_CLICKS / q.indicators.TOTAL_SHOWS) * 10000
          ) / 100
        : 0,
    position: q.indicators?.AVG_CLICK_POSITION || 0,
  }));
}
