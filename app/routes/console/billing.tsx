import { Hono } from "hono";
import type { Env } from "../../lib/types.js";
import { consoleT } from "../../lib/i18n/hono.js";
import type { TFunc } from "../../lib/i18n/locale.js";

const app = new Hono<{ Bindings: Env }>({ strict: false });

app.get("/", async (c) => {
  const t = consoleT(c);
  return c.render(<BillingContent t={t} />, { title: t("console.title.billing") });
});

export default app;

// ---------- Page markup (colocated) ----------
function BillingContent(props: { t: TFunc }) {
  const { t } = props;
  return (
    <>
      <h1 class="text-3xl font-semibold tracking-tight mb-4">{t("console.title.billing")}</h1>
      <div class="bg-base-100 border border-base-300 rounded-box p-6 max-w-2xl">
        <div class="text-sm text-base-content/60 leading-relaxed">{t("console.billing.body")}</div>
        <div class="mt-5 text-sm">
          <span class="badge badge-success badge-sm mr-2">{t("console.billing.active")}</span>
          {t("console.billing.noBill")}
        </div>
      </div>
    </>
  );
}
