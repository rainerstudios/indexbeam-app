import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>IndexBeam: IndexNow & AI SEO</h1>
        <p className={styles.text}>
          Get your products indexed instantly and track your AI search visibility across ChatGPT, Perplexity, and Gemini.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Instant Indexing</strong>. Automatically submit new and updated products to Bing and Yandex via IndexNow — no configuration needed.
          </li>
          <li>
            <strong>AI Visibility Tracking</strong>. See if AI platforms like ChatGPT and Perplexity recommend your brand when people search for your products.
          </li>
          <li>
            <strong>SEO & Schema Audit</strong>. Track your search rankings, audit structured data on your product pages, and get actionable recommendations.
          </li>
        </ul>
      </div>
    </div>
  );
}
