import { useState } from "react";
import { AlertTriangle, Check, Search, Sparkles } from "lucide-react";
import { localeMeta } from "../app/i18n.js";
import { useLocale } from "../contexts/LocaleContext.jsx";
import { Badge } from "../components/ui/Badge.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/Card.jsx";
import { ConfirmationDialog } from "../components/ui/ConfirmationDialog.jsx";
import { EmptyState } from "../components/ui/EmptyState.jsx";
import { ErrorState } from "../components/ui/ErrorState.jsx";
import { FormField } from "../components/ui/FormField.jsx";
import { Input } from "../components/ui/Input.jsx";
import { LoadingSkeleton } from "../components/ui/LoadingSkeleton.jsx";
import { StatusBadge } from "../components/ui/StatusBadge.jsx";

const primitiveSwatches = [
  ["navy-900", "var(--navy-900)", "var(--color-text-inverse)"],
  ["slate-100", "var(--slate-100)", "var(--color-text-primary)"],
  ["emerald-600", "var(--emerald-600)", "var(--color-text-inverse)"],
  ["amber-600", "var(--amber-600)", "var(--color-text-inverse)"],
  ["red-600", "var(--red-600)", "var(--color-text-inverse)"],
  ["blue-600", "var(--blue-600)", "var(--color-text-inverse)"]
];

const semanticSwatches = [
  ["background", "var(--color-background)", "var(--color-text-primary)"],
  ["surface", "var(--color-surface)", "var(--color-text-primary)"],
  ["primary", "var(--color-primary)", "var(--color-text-inverse)"],
  ["success soft", "var(--color-success-soft)", "var(--color-success)"],
  ["warning soft", "var(--color-warning-soft)", "var(--color-warning)"],
  ["danger soft", "var(--color-danger-soft)", "var(--color-danger)"]
];

const statuses = [
  "neutral", "info", "success", "warning", "danger",
  "complete", "partial", "missing", "stale", "failed",
  "proposed", "accepted", "rejected", "in_progress", "completed", "cancelled",
  "low", "medium", "high", "critical"
];

export function DesignSystemPage() {
  const locale = useLocale();
  const [dialogLoading, setDialogLoading] = useState(false);

  const confirmSlowly = async () => {
    setDialogLoading(true);
    await Promise.resolve();
    setDialogLoading(false);
  };

  return (
    <main className="design-system-page" id="main-content">
      <header>
        <Badge variant="info">{locale.t("common.demo")}</Badge>
        <h1 className="text-page-title">{locale.t("designSystem.title")}</h1>
        <p className="text-body">{locale.t("designSystem.description")}</p>
        <FormField label={locale.t("designSystem.localeSwitcher")} id="design-locale">
          {({ id }) => (
            <select id={id} value={locale.locale} onChange={(event) => locale.setLocale(event.target.value)}>
              {Object.entries(localeMeta).map(([value, meta]) => (
                <option key={value} value={value}>{meta.label}</option>
              ))}
            </select>
          )}
        </FormField>
      </header>

      <section>
        <h2 className="text-section-title">{locale.t("designSystem.colors")}</h2>
        <div className="design-system-grid">
          {[...primitiveSwatches, ...semanticSwatches].map(([name, swatch, text]) => (
            <div key={name} className="color-swatch" style={{ "--swatch": swatch, "--swatch-text": text }}>
              <strong>{name}</strong>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-section-title">{locale.t("designSystem.typography")}</h2>
        <p className="text-page-title">Page title / عنوان الصفحة / 页面标题</p>
        <p className="text-section-title">Section title / عنوان القسم / 分区标题</p>
        <p className="text-body">Body text keeps Arabic comfortable: خدمة المطاعم تحتاج قرارات واضحة وسريعة.</p>
        <p className="text-numeric">{locale.formatCurrency(123456.78)} · {locale.formatCompactNumber(128000)}</p>
      </section>

      <section>
        <h2 className="text-section-title">{locale.t("designSystem.spacing")}</h2>
        <div className="design-system-row">
          {["1", "2", "3", "4", "6", "8", "10", "12"].map((space) => (
            <span key={space} className="ui-skeleton" style={{ inlineSize: `var(--space-${space})`, blockSize: "2rem" }} aria-hidden="true" />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-section-title">{locale.t("designSystem.buttons")}</h2>
        <div className="design-system-row">
          {["primary", "secondary", "outline", "ghost", "danger"].map((variant) => (
            <Button key={variant} variant={variant} leadingIcon={<Sparkles size={16} />}>{variant}</Button>
          ))}
          <Button size="small">small</Button>
          <Button size="large">large</Button>
          <Button disabled>disabled</Button>
          <Button loading loadingLabel={locale.t("common.loading")}>loading</Button>
        </div>
      </section>

      <section>
        <h2 className="text-section-title">{locale.t("designSystem.inputs")}</h2>
        <div className="design-system-grid">
          <FormField label="Search" description="Useful for filters." id="search-field">
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="search" leadingIcon={<Search size={16} />} placeholder={locale.t("common.search")} />}
          </FormField>
          <FormField label="Email" error="Use a valid email address." required id="email-field">
            {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} invalid={invalid} type="email" />}
          </FormField>
          <FormField label="Disabled" optional id="disabled-field">
            {({ id }) => <Input id={id} disabled value="Read only" onChange={() => {}} />}
          </FormField>
        </div>
      </section>

      <section>
        <h2 className="text-section-title">{locale.t("designSystem.cards")}</h2>
        <div className="design-system-grid">
          <Card>
            <CardHeader status={<StatusBadge status="complete" />}>
              <CardTitle>{locale.t("designSystem.sampleTitle")}</CardTitle>
              <CardDescription>{locale.t("designSystem.sampleDescription")}</CardDescription>
            </CardHeader>
            <CardContent>Content area</CardContent>
            <CardFooter><Button variant="outline">{locale.t("common.continue")}</Button></CardFooter>
          </Card>
          <Card variant="muted" interactive>
            <CardContent>Muted interactive card</CardContent>
          </Card>
        </div>
      </section>

      <section>
        <h2 className="text-section-title">{locale.t("designSystem.badges")}</h2>
        <div className="design-system-row">
          {["neutral", "info", "success", "warning", "danger"].map((variant) => <Badge key={variant} variant={variant}>{variant}</Badge>)}
        </div>
        <div className="design-system-row">
          {statuses.map((status) => <StatusBadge key={status} status={status} />)}
        </div>
      </section>

      <section>
        <h2 className="text-section-title">{locale.t("designSystem.states")}</h2>
        <div className="design-system-grid">
          <LoadingSkeleton variant="card" label={locale.t("common.loading")} />
          <LoadingSkeleton variant="circle" width="3rem" />
          <LoadingSkeleton lines={3} />
          <EmptyState primaryAction={<Button>{locale.t("common.continue")}</Button>} />
          <ErrorState type="network" onRetry={() => {}} />
        </div>
      </section>

      <section>
        <h2 className="text-section-title">{locale.t("designSystem.dialog")}</h2>
        <ConfirmationDialog
          trigger={<Button leadingIcon={<AlertTriangle size={16} />}>{locale.t("designSystem.openDialog")}</Button>}
          title={locale.t("designSystem.dialog")}
          description="This demonstrates focus management, Escape close, and safe confirmation."
          danger
          loading={dialogLoading}
          onConfirm={confirmSlowly}
          confirmLabel={locale.t("common.confirm")}
        >
          <StatusBadge status="warning" />
        </ConfirmationDialog>
      </section>

      <section>
        <h2 className="text-section-title">{locale.t("designSystem.formatters")}</h2>
        <div className="design-system-row">
          <Badge>{locale.formatCurrency(561)}</Badge>
          <Badge>{locale.formatPercent(0.481)}</Badge>
          <Badge>{locale.formatDateTime("2026-07-16T18:43:00Z")}</Badge>
          <Badge><Check size={12} /> {locale.t("designSystem.rtlExample")}</Badge>
          <Badge>{locale.t("designSystem.ltrExample")}</Badge>
        </div>
      </section>
    </main>
  );
}
