import { google } from "googleapis";

function getServiceAccountAuth(serviceAccountJson: string) {
  const credentials = JSON.parse(serviceAccountJson);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/webmasters.readonly",
      "https://www.googleapis.com/auth/webmasters",
    ],
  });
}

function getOAuthAuth(accessToken: string) {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  return oauth2;
}

interface InspectionResult {
  indexed: boolean;
  lastCrawl: Date | null;
  verdict: string;
  coverageState: string;
}

export async function inspectUrl(
  credentialOrToken: string,
  siteUrl: string,
  inspectionUrl: string,
  isOAuth: boolean = false
): Promise<InspectionResult> {
  const auth = isOAuth
    ? getOAuthAuth(credentialOrToken)
    : getServiceAccountAuth(credentialOrToken);
  const searchconsole = google.searchconsole({ version: "v1", auth });

  const response = await searchconsole.urlInspection.index.inspect({
    requestBody: {
      inspectionUrl,
      siteUrl,
    },
  });

  const result = response.data.inspectionResult?.indexStatusResult;

  return {
    indexed: result?.verdict === "PASS",
    lastCrawl: result?.lastCrawlTime ? new Date(result.lastCrawlTime) : null,
    verdict: result?.verdict || "UNKNOWN",
    coverageState: result?.coverageState || "UNKNOWN",
  };
}

export async function getSearchAnalytics(
  credentialOrToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: string[] = ["query"],
  isOAuth: boolean = false
): Promise<
  {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }[]
> {
  const auth = isOAuth
    ? getOAuthAuth(credentialOrToken)
    : getServiceAccountAuth(credentialOrToken);
  const searchconsole = google.searchconsole({ version: "v1", auth });

  const response = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: { startDate, endDate, dimensions, rowLimit: 100 },
  });

  return (response.data.rows || []).map((row: any) => ({
    query: row.keys?.[0] || "",
    clicks: row.clicks || 0,
    impressions: row.impressions || 0,
    ctr: row.ctr || 0,
    position: row.position || 0,
  }));
}
