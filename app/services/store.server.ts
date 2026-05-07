import db from "../db.server";

export async function ensureStore(shopDomain: string) {
  return db.store.upsert({
    where: { shopDomain },
    create: { shopDomain, accessToken: "" },
    update: {},
  });
}
