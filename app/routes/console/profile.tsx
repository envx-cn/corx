import { Hono } from "hono";
import type { Env } from "../../lib/types.js";
import { consoleT } from "../../lib/i18n/hono.js";
import type { TFunc } from "../../lib/i18n/locale.js";

const app = new Hono<{ Bindings: Env }>({ strict: false });

app.get("/", async (c) => {
  const t = consoleT(c);
  const user = c.get("consoleUser");
  return c.render(<ProfileContent user={user} t={t} />, { title: t("console.title.profile") });
});

export default app;

// ---------- Page markup (colocated) ----------
function ProfileContent(props: { user: { email: string; via: "access" | "token" }; t: TFunc }) {
  const { t } = props;
  const initial = props.user.email[0]?.toUpperCase() ?? "?";
  return (
    <>
      <h1 class="text-3xl font-semibold tracking-tight mb-4">{t("console.title.profile")}</h1>
      <div class="bg-base-100 border border-base-300 rounded-box p-6 max-w-2xl">
        <div class="flex items-center gap-4">
          <span class="size-12 rounded-full bg-black/10 text-base font-semibold text-base-content/80 inline-flex items-center justify-center">
            {initial}
          </span>
          <div class="min-w-0">
            <div class="font-semibold truncate">{props.user.email}</div>
            <div class="text-sm text-base-content/55">
              {props.user.via === "access" ? t("console.profile.viaAccess") : t("console.profile.viaToken")}
            </div>
          </div>
        </div>
        <dl class="grid sm:grid-cols-2 gap-4 mt-6 text-sm">
          <div>
            <dt class="text-base-content/55">{t("console.profile.email")}</dt>
            <dd class="font-medium break-all">{props.user.email}</dd>
          </div>
          <div>
            <dt class="text-base-content/55">{t("console.profile.authMethod")}</dt>
            <dd class="font-medium capitalize">{props.user.via}</dd>
          </div>
        </dl>
      </div>
      <p
        class="text-xs text-base-content/50 mt-4 max-w-2xl"
        dangerouslySetInnerHTML={{ __html: t("console.profile.hint", { code: "<code>ADMIN_TOKEN</code>" }) }}
      />
    </>
  );
}
