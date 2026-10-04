import { useImportText } from "./importCopy.js";
import { decisionCopy } from "./decisionCopy.js";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  RefreshCcw,
  Save,
  ScanSearch,
  UploadCloud,
  XCircle
} from "lucide-react";
import { Badge } from "../components/ui/Badge.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card.jsx";
import {
  cancelImportJob,
  confirmImportJob,
  downloadImportTemplate,
  listImportTemplates,
  previewImportFile,
  updateImportMapping
} from "../lib/imports.js";
import { useLocale } from "../contexts/LocaleContext.jsx";

const STEPS = ["Upload", "Detection", "Mapping", "Validation", "Preview", "Confirm"];

const introCopy = {
  ar: {
    title: "ارفع ملفك ودع Restrova يتعرّف عليه",
    description: "سنحدد نوع البيانات تلقائيًا، ثم نفحص الأعمدة والأخطاء والتكرارات قبل حفظ أي شيء.",
    choose: "اختر ملف CSV أو XLSX",
    browse: "اضغط هنا لاختيار الملف من جهازك",
    action: "تحليل الملف وتقييمه",
    optional: "اختيار النوع يدويًا (اختياري)",
    optionalHelp: "استخدم هذا الخيار فقط إذا لم يستطع النظام تحديد نوع الملف بثقة."
  },
  en: {
    title: "Upload a file and let Restrova identify it",
    description: "We detect the data type, then check columns, errors, and duplicates before anything is saved.",
    choose: "Choose a CSV or XLSX file",
    browse: "Click to browse from your computer",
    action: "Analyze and evaluate file",
    optional: "Choose the type manually (optional)",
    optionalHelp: "Use this only when the system cannot identify the file confidently."
  },
  "zh-CN": {
    title: "上传文件，让 Restrova 自动识别",
    description: "系统会自动识别数据类型，并在保存前检查列、错误和重复记录。",
    choose: "选择 CSV 或 XLSX 文件",
    browse: "点击从电脑中选择文件",
    action: "分析并评估文件",
    optional: "手动选择类型（可选）",
    optionalHelp: "仅当系统无法可靠识别文件时使用。"
  }
};

function bytes(value) {
  const size = Number(value || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function errorMessage(error) {
  return error?.message || "Unable to complete the import request.";
}

function stepIndex({ job }) {
  if (!job) return 0;
  if (job.datasetEvaluation?.mode === "analysis_only") return 1;
  if (job.validationStatus === "needs_mapping") return 2;
  if (job.validationStatus === "validation_failed") return 3;
  if (job.validationStatus === "ready") return 4;
  return 5;
}

function WizardStepper({ active }) {
  const tr = useImportText();
  return (
    <ol className="import-stepper" aria-label={tr("Import progress")}>
      {STEPS.map((label, index) => (
        <li key={label} className={index === active ? "is-active" : index < active ? "is-complete" : ""}>
          <span>{index < active ? <Check size={14} /> : index + 1}</span>
          <strong>{tr(label)}</strong>
        </li>
      ))}
    </ol>
  );
}

function TemplateSelection({ templates, selectedKey, onSelect, onDownload, downloadingKey, text }) {
  const tr = useImportText();
  return (
    <details className="import-manual-choice">
      <summary>
        <span>
          <strong>{text.optional}</strong>
          <small>{text.optionalHelp}</small>
        </span>
      </summary>
      <section className="import-section" aria-labelledby="import-template-title">
        <div className="import-section__heading">
          <div>
            <h2 id="import-template-title">{text.optional}</h2>
            <p>{text.optionalHelp}</p>
          </div>
        </div>
        <div className="import-template-grid">
          {templates.map((template) => {
            const selected = template.key === selectedKey;
            return (
              <Card key={template.key} interactive className={`import-template-card ${selected ? "is-selected" : ""}`}>
                <CardHeader status={selected ? <Badge variant="success">{tr("Selected")}</Badge> : null}>
                  <div className="import-template-card__title">
                    <FileSpreadsheet size={20} />
                    <CardTitle>{tr(template.displayName)}</CardTitle>
                  </div>
                  <CardDescription>{tr(template.description)}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="import-template-card__meta">
                    {template.requiredColumns?.length || 0} {tr("required")} · {template.optionalColumns?.length || 0}{" "}
                    {tr("optional")}
                  </p>
                  <div className="import-template-card__actions">
                    <Button variant={selected ? "primary" : "outline"} onClick={() => onSelect(template)}>
                      {selected ? tr("Selected") : tr("Choose")}
                    </Button>
                    <Button
                      variant="ghost"
                      leadingIcon={<Download size={16} />}
                      loading={downloadingKey === template.key}
                      onClick={() => onDownload(template.key)}
                    >
                      {tr("Template")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </details>
  );
}

function FileUpload({ template, file, onFile, onUpload, loading, onBack, text }) {
  const tr = useImportText();
  const inputRef = useRef(null);
  return (
    <section className="import-section" aria-labelledby="import-upload-title">
      <div className="import-section__heading">
        <div>
          <p className="import-eyebrow">{tr("Smart import")}</p>
          <h2 id="import-upload-title">{text.title}</h2>
          <p>{text.description}</p>
        </div>
        {template && (
          <Button variant="ghost" leadingIcon={<ArrowLeft size={16} />} onClick={onBack}>
            {tr("Automatic detection")}
          </Button>
        )}
      </div>
      <Card>
        <CardContent>
          <div
            className="import-dropzone"
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
            }}
          >
            <UploadCloud size={34} />
            <strong>{file ? file.name : text.choose}</strong>
            <span>{file ? `${bytes(file.size)} · ${file.type || tr("File")}` : text.browse}</span>
            <input
              ref={inputRef}
              className="sr-only"
              aria-label={tr("CSV or XLSX file")}
              type="file"
              accept=".csv,.xlsx,text/csv,application/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => onFile(event.target.files?.[0] || null)}
            />
          </div>
          <div className="import-actions import-actions--end">
            <Button disabled={!file} loading={loading} leadingIcon={<UploadCloud size={16} />} onClick={onUpload}>
              {text.action}
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function DetectionSummary({ job, template }) {
  const tr = useImportText();
  const detection = job.detection || {
    displayName: template?.displayName || job.templateKey,
    confidence: "confirmed",
    matchedFields: []
  };
  const confidenceLabel =
    detection.confidence === "high"
      ? tr("High confidence")
      : detection.confidence === "medium"
        ? tr("Review suggested")
        : tr("Confirmed");
  return (
    <section className="import-detection" aria-labelledby="import-detection-title">
      <div className="import-detection__icon">
        <ScanSearch size={24} />
      </div>
      <div>
        <p className="import-eyebrow">{tr("Step 2 \u00b7 File detected")}</p>
        <h2 id="import-detection-title">{tr(detection.displayName)}</h2>
        <p>
          {tr("Restrova classified this as")} <strong>{tr(detection.displayName)}</strong>
          {tr(" data and evaluated the uploaded rows.")}
        </p>
        {detection.matchedFields?.length > 0 && (
          <div className="import-detection__fields">
            {detection.matchedFields.map((field) => (
              <code key={field}>{field}</code>
            ))}
          </div>
        )}
      </div>
      <Badge variant={detection.confidence === "medium" ? "warning" : "success"}>{confidenceLabel}</Badge>
    </section>
  );
}

function DatasetEvaluation({ evaluation, locale, onReset, onFinish, supportsReport }) {
  const tr = useImportText();
  if (!evaluation) return null;
  const completeness = `${(evaluation.completenessBps / 100).toFixed(1)}%`;
  return (
    <section className="import-section" aria-labelledby="dataset-evaluation-title">
      <div className="import-section__heading">
        <div>
          <p className="import-eyebrow">{tr("Automatic evaluation")}</p>
          <h2 id="dataset-evaluation-title">{tr("Dataset quality summary")}</h2>
          <p>
            {evaluation.importReady
              ? tr("The file is ready to import after you review the results.")
              : tr(
                  "The file was analyzed, but it is an analytical dataset rather than a complete POS transaction log, so it will not be saved as inaccurate operational data."
                )}
          </p>
        </div>
        <Badge variant={evaluation.importReady ? "success" : "warning"}>
          {evaluation.importReady ? tr("Import ready") : tr("Analysis only")}
        </Badge>
      </div>
      <div className="import-evaluation-grid">
        <div>
          <span>{tr("Rows")}</span>
          <strong>{evaluation.rowCount.toLocaleString(locale)}</strong>
        </div>
        <div>
          <span>{tr("Columns")}</span>
          <strong>{evaluation.columnCount}</strong>
        </div>
        <div>
          <span>{tr("Completeness")}</span>
          <strong>{completeness}</strong>
        </div>
        <div>
          <span>{tr("Duplicate rows")}</span>
          <strong>{evaluation.duplicateRows}</strong>
        </div>
      </div>
      {evaluation.numericColumns?.length > 0 && (
        <details className="import-manual-choice import-evaluation-columns">
          <summary>{tr("View detailed statistics (optional)")}</summary>
          <div className="import-table-wrap" tabIndex={0} role="region" aria-label={tr("Preview")}>
            <table className="import-table import-evaluation-table">
              <thead>
                <tr>
                  <th>{tr("Column")}</th>
                  <th>{tr("Minimum")}</th>
                  <th>{tr("Average")}</th>
                  <th>{tr("Maximum")}</th>
                </tr>
              </thead>
              <tbody>
                {evaluation.numericColumns.slice(0, 8).map((metric) => (
                  <tr key={metric.column}>
                    <td>
                      <code>{metric.column}</code>
                    </td>
                    <td>{metric.minimum.toLocaleString(locale)}</td>
                    <td>{metric.average.toLocaleString(locale)}</td>
                    <td>{metric.maximum.toLocaleString(locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {evaluation.mode === "analysis_only" && (
        <div className="import-analysis-complete">
          <div>
            <CheckCircle2 size={22} />
            <span>
              <strong>{tr("File analysis complete")}</strong>
              <small>{tr("Continue to the decision center or analyze another file.")}</small>
            </span>
          </div>
          <div className="import-actions">
            <Button onClick={onFinish}>
              {!supportsReport
                ? tr("Continue to decision center")
                : locale === "ar"
                  ? "تحليل الملف مع المساعد"
                  : locale === "zh-CN"
                    ? "使用助手分析报告"
                    : "Analyze report with assistant"}
            </Button>
            <Button variant="outline" leadingIcon={<RefreshCcw size={16} />} onClick={onReset}>
              {tr("Analyze another file")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function MappingEditor({ job, mappings, onChange, onSave, loading }) {
  const tr = useImportText();
  const targets = job.mapping?.targetFields || [];
  return (
    <section className="import-section" aria-labelledby="import-mapping-title">
      <div className="import-section__heading">
        <div>
          <p className="import-eyebrow">{tr("Step 3")}</p>
          <h2 id="import-mapping-title">{tr("Review column mapping")}</h2>
          <p>
            {tr(
              "Map each uploaded column to a Restrova field. Required fields must be mapped before validation can continue."
            )}
          </p>
        </div>
        <Badge variant={job.mapping?.ready ? "success" : "warning"}>
          {job.mapping?.ready
            ? tr("Mapping complete")
            : `${job.mapping?.missingRequiredMappings?.length || 0} ${tr("required missing")}`}
        </Badge>
      </div>
      <Card>
        <CardContent className="import-table-wrap" tabIndex={0} role="region" aria-label={tr("Import restaurant data")}>
          <table className="import-table">
            <thead>
              <tr>
                <th>{tr("Uploaded column")}</th>
                <th>{tr("Restrova field")}</th>
                <th>{tr("Status")}</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((mapping, index) => (
                <tr key={mapping.sourceColumn}>
                  <td>
                    <code>{mapping.sourceColumn}</code>
                  </td>
                  <td>
                    <select
                      aria-label={`${tr("Map")} ${mapping.sourceColumn}`}
                      value={mapping.targetField || ""}
                      onChange={(event) => onChange(index, event.target.value || null)}
                    >
                      <option value="">{tr("Ignore column")}</option>
                      {targets.map((field) => (
                        <option key={field.name} value={field.name}>
                          {field.name}
                          {field.required ? " *" : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <Badge variant={mapping.targetField ? "success" : "warning"}>
                      {mapping.targetField ? tr("Mapped") : tr("Unmapped")}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
        <div className="import-card-footer">
          <Button loading={loading} leadingIcon={<Save size={16} />} onClick={onSave}>
            {tr("Save mapping & validate")}
          </Button>
        </div>
      </Card>
    </section>
  );
}

function OptionalMappingEditor({ job, locale: _locale, ...props }) {
  const tr = useImportText();
  if (!job.mapping?.ready) return <MappingEditor job={job} {...props} />;
  return (
    <details key={job.id} className="import-manual-choice">
      <summary>
        <span>
          <strong>{tr("Columns matched automatically")}</strong>
          <small>{tr("View or edit mapping (optional)")}</small>
        </span>
      </summary>
      <MappingEditor job={job} {...props} />
    </details>
  );
}

function StatCard({ label, value, tone = "neutral" }) {
  return (
    <div className={`import-stat import-stat--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function IssueTable({ title, rows, warning = false }) {
  const tr = useImportText();
  const issues = rows.flatMap((row) =>
    (warning ? row.warnings || [] : row.errors || []).map((issue) => ({ ...issue, rowNumber: row.rowNumber }))
  );
  if (!issues.length) return null;
  return (
    <Card>
      <CardHeader status={<Badge variant={warning ? "warning" : "danger"}>{issues.length}</Badge>}>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {warning
            ? tr("Warnings do not necessarily block confirmation.")
            : tr("Fix these rows and upload again before confirming.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="import-table-wrap" tabIndex={0} role="region" aria-label={tr("Import restaurant data")}>
        <table className="import-table">
          <thead>
            <tr>
              <th>{tr("Row")}</th>
              <th>{tr("Column")}</th>
              <th>{tr("Value")}</th>
              <th>{tr("Message")}</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue, index) => (
              <tr key={`${issue.rowNumber}-${issue.field}-${index}`}>
                <td>{issue.rowNumber}</td>
                <td>{issue.sourceColumn || issue.field || "—"}</td>
                <td>
                  <code>{issue.value === null || issue.value === undefined ? "—" : String(issue.value)}</code>
                </td>
                <td>{issue.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function ValidationSummary({ job }) {
  const tr = useImportText();
  const stats = job.statistics || {};
  return (
    <section className="import-section" aria-labelledby="import-validation-title">
      <div className="import-section__heading">
        <div>
          <p className="import-eyebrow">{tr("Step 4")}</p>
          <h2 id="import-validation-title">{tr("Validation results")}</h2>
          <p>{tr("Review accepted, rejected, duplicate and warning counts before confirming the import.")}</p>
        </div>
        <Badge variant={job.validationStatus === "ready" ? "success" : "danger"}>
          {job.validationStatus === "ready" ? tr("Ready to confirm") : tr("Action required")}
        </Badge>
      </div>
      <div className="import-stats">
        <StatCard label={tr("Total rows")} value={stats.total ?? 0} />
        <StatCard label={tr("Valid")} value={stats.accepted ?? 0} tone="success" />
        <StatCard label={tr("Invalid")} value={stats.rejected ?? 0} tone={stats.rejected ? "danger" : "neutral"} />
        <StatCard label={tr("Duplicates")} value={stats.duplicates ?? 0} tone="warning" />
        <StatCard label={tr("Warnings")} value={stats.warnings ?? 0} tone="warning" />
      </div>
      <IssueTable title={tr("Blocking errors")} rows={job.rowErrors || []} />
      <IssueTable title={tr("Warnings")} rows={job.rowWarnings || []} warning />
      {(job.mapping?.warnings || []).length > 0 && (
        <Card>
          <CardHeader status={<Badge variant="warning">{job.mapping.warnings.length}</Badge>}>
            <CardTitle>{tr("Unmapped optional columns")}</CardTitle>
            <CardDescription>{tr("These columns will be ignored unless you map them manually.")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="import-warning-list">
              {job.mapping.warnings.map((warning) => (
                <li key={warning.sourceColumn}>{warning.message}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function PreviewTable({ job }) {
  const tr = useImportText();
  const headers = job.mapping?.sourceHeaders || [];
  return (
    <section className="import-section" aria-labelledby="import-preview-title">
      <div className="import-section__heading">
        <div>
          <p className="import-eyebrow">{tr("Step 5")}</p>
          <h2 id="import-preview-title">{tr("Preview")}</h2>
          <p>{tr("Showing up to 20 rows using the original uploaded column names.")}</p>
        </div>
      </div>
      <Card>
        <CardContent className="import-table-wrap" tabIndex={0} role="region" aria-label={tr("Import restaurant data")}>
          <table className="import-table import-table--preview">
            <thead>
              <tr>
                <th>{tr("Row")}</th>
                <th>{tr("Status")}</th>
                {headers.map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(job.previewRows || []).map((row) => (
                <tr key={row.rowNumber}>
                  <td>{row.rowNumber}</td>
                  <td>
                    <Badge
                      variant={
                        row.status === "accepted" ? "success" : row.status === "duplicate" ? "warning" : "danger"
                      }
                    >
                      {tr(row.status)}
                    </Badge>
                  </td>
                  {headers.map((header) => (
                    <td key={header}>{String(row.raw?.[header] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </section>
  );
}

function ConfirmPanel({ job, template, onConfirm, onCancel, confirming, cancelling, canConfirm }) {
  const tr = useImportText();
  return (
    <section className="import-section" aria-labelledby="import-confirm-title">
      <Card>
        <CardHeader
          status={
            <Badge variant={canConfirm ? "success" : "danger"}>
              {canConfirm ? tr("Safe to import") : tr("Blocked")}
            </Badge>
          }
        >
          <div>
            <p className="import-eyebrow">{tr("Step 6")}</p>
            <CardTitle>{tr("Confirm import")}</CardTitle>
            <CardDescription>
              {tr("Restrova writes only accepted rows after this explicit confirmation.")}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="import-confirm-grid">
            <div>
              <dt>{tr("Template")}</dt>
              <dd>{tr(template?.displayName || job.templateKey)}</dd>
            </div>
            <div>
              <dt>{tr("File")}</dt>
              <dd>{job.file?.name}</dd>
            </div>
            <div>
              <dt>{tr("Total rows")}</dt>
              <dd>{job.statistics?.total ?? 0}</dd>
            </div>
            <div>
              <dt>{tr("Accepted")}</dt>
              <dd>{job.statistics?.accepted ?? 0}</dd>
            </div>
            <div>
              <dt>{tr("Duplicates")}</dt>
              <dd>{job.statistics?.duplicates ?? 0}</dd>
            </div>
            <div>
              <dt>{tr("Import job")}</dt>
              <dd>#{job.id}</dd>
            </div>
          </dl>
        </CardContent>
        <div className="import-card-footer import-card-footer--split">
          <Button variant="ghost" loading={cancelling} onClick={onCancel}>
            {tr("Cancel import")}
          </Button>
          <Button
            disabled={!canConfirm}
            loading={confirming}
            leadingIcon={<CheckCircle2 size={16} />}
            onClick={onConfirm}
          >
            {tr("Confirm import")}
          </Button>
        </div>
      </Card>
    </section>
  );
}

function Completion({ job, onReset }) {
  const tr = useImportText();
  const { locale } = useLocale(),
    c = decisionCopy[locale === "zh-CN" ? "zh" : locale] || decisionCopy.en;
  const cancelled = job.status === "cancelled";
  return (
    <section className="import-completion">
      {cancelled ? <XCircle size={54} /> : <CheckCircle2 size={54} />}
      <Badge variant={cancelled ? "warning" : "success"}>{cancelled ? tr("Cancelled") : tr("Completed")}</Badge>
      <h1>{cancelled ? tr("Import cancelled") : tr("Import completed")}</h1>
      <p>
        {cancelled
          ? tr("No staged data was written. You can start another import whenever you are ready.")
          : `${job.statistics?.imported ?? 0} ${tr("rows were imported successfully.")}`}
      </p>
      {!cancelled && (
        <>
          <p>{c.connected}</p>
          {job.firstInsight && (
            <div className="simple-panel import-first-insight">
              <h2>
                {locale === "ar"
                  ? "هذا اللي لقيناه في المبيعات الجديدة"
                  : locale === "zh-CN"
                    ? "新导入销售记录的摘要"
                    : "From your newly imported sales"}
              </h2>
              <p>
                <bdi>
                  {job.firstInsight.from} — {job.firstInsight.to}
                </bdi>
              </p>
              <dl>
                <dt>{locale === "ar" ? "صافي المبيعات" : locale === "zh-CN" ? "净销售额" : "Net sales"}</dt>
                <dd>
                  {new Intl.NumberFormat(locale, { style: "currency", currency: job.firstInsight.currencyCode }).format(
                    job.firstInsight.revenueMinor /
                      10 **
                        new Intl.NumberFormat("en", {
                          style: "currency",
                          currency: job.firstInsight.currencyCode
                        }).resolvedOptions().maximumFractionDigits
                  )}
                </dd>
                <dt>
                  {locale === "ar"
                    ? "الطلبات في السجلات الجديدة"
                    : locale === "zh-CN"
                      ? "新记录中的订单"
                      : "Orders in new records"}
                </dt>
                <dd>{job.firstInsight.orders}</dd>
                <dt>
                  {locale === "ar"
                    ? "الأكثر مبيعًا بالكمية"
                    : locale === "zh-CN"
                      ? "销量最高的菜品"
                      : "Top dish by quantity"}
                </dt>
                <dd>{job.firstInsight.bestDish}</dd>
              </dl>
            </div>
          )}
          <p>
            {c.revision}: {job.dataRevision?.revision ?? "—"}
          </p>
          {job.alertEvaluation?.status === "failed" && (
            <p role="alert">
              {c.error} <a href="/app/alerts">{c.alerts}</a>
            </p>
          )}
          <nav className="decision-links">
            <a href="/app/assistant">
              {locale === "ar" ? "عرض تحليل AI" : locale === "zh-CN" ? "查看 AI 分析" : "See AI analysis"}
            </a>
            <a href="/app/data">
              {locale === "ar" ? "عرض بيانات مطعمك" : locale === "zh-CN" ? "查看餐厅数据" : "View restaurant data"}
            </a>
          </nav>
        </>
      )}
      <div className="import-actions">
        <Button leadingIcon={<RefreshCcw size={16} />} onClick={onReset}>
          {tr("Import another file")}
        </Button>
        {!cancelled && (
          <Button variant="outline" onClick={() => window.location.assign("/app/dashboard")}>
            {locale === "ar" ? "الرئيسية" : locale === "zh-CN" ? "首页" : "Home"}
          </Button>
        )}
      </div>
    </section>
  );
}

export function ImportWizardPage() {
  const tr = useImportText();
  const { locale } = useLocale();
  const text = introCopy[locale] || introCopy.en;
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [file, setFile] = useState(null);
  const [job, setJob] = useState(null);
  const [confirmationToken, setConfirmationToken] = useState(null);
  const [mappings, setMappings] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savingMapping, setSavingMapping] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [downloadingKey, setDownloadingKey] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoadingTemplates(true);
    listImportTemplates()
      .then((result) => {
        if (!alive) return;
        setTemplates(Array.isArray(result) ? result : []);
      })
      .catch((requestError) => alive && setError(errorMessage(requestError)))
      .finally(() => alive && setLoadingTemplates(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setMappings(job?.mapping?.columns ? job.mapping.columns.map((column) => ({ ...column })) : []);
  }, [job]);

  const activeStep = stepIndex({ template: selectedTemplate, file, job });
  const canConfirm = Boolean(job?.validationStatus === "ready" && job?.statistics?.rejected === 0 && confirmationToken);
  const selected = useMemo(
    () => selectedTemplate || templates.find((template) => template.key === job?.templateKey) || null,
    [job?.templateKey, selectedTemplate, templates]
  );

  function resetImport() {
    setSelectedTemplate(null);
    setFile(null);
    setJob(null);
    setMappings([]);
    setConfirmationToken(null);
    setError("");
  }

  async function downloadTemplate(key) {
    setError("");
    setDownloadingKey(key);
    try {
      await downloadImportTemplate(key);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setDownloadingKey(null);
    }
  }

  async function upload() {
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const result = await previewImportFile({ templateKey: selectedTemplate?.key, file });
      setJob(result);
      setConfirmationToken(result.confirmationToken || null);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setUploading(false);
    }
  }

  function changeMapping(index, targetField) {
    setMappings((current) =>
      current.map((mapping, mappingIndex) =>
        mappingIndex === index ? { ...mapping, targetField, confidence: "manual" } : mapping
      )
    );
  }

  async function saveMapping() {
    if (!job) return;
    setError("");
    setSavingMapping(true);
    try {
      const result = await updateImportMapping(job.id, mappings);
      setJob(result);
      setConfirmationToken(result.confirmationToken || null);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSavingMapping(false);
    }
  }

  async function confirm() {
    if (!job || !confirmationToken) return;
    setError("");
    setConfirming(true);
    try {
      const result = await confirmImportJob(job.id, confirmationToken);
      setJob(result);
      setConfirmationToken(null);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setConfirming(false);
    }
  }

  async function cancel() {
    if (!job) return;
    setError("");
    setCancelling(true);
    try {
      const result = await cancelImportJob(job.id);
      setJob(result);
      setConfirmationToken(null);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setCancelling(false);
    }
  }

  if (job?.status === "confirmed" || job?.status === "cancelled") {
    return (
      <section className="import-page">
        <Completion job={job} onReset={resetImport} />
      </section>
    );
  }

  return (
    <section className="import-page">
      <header className="import-page__header">
        <div>
          <Badge variant="info">{tr("Safe staged import")}</Badge>
          <h1>{tr("Import restaurant data")}</h1>
          <p>{tr("Validate, map and preview CSV/XLSX data before anything is written to your restaurant.")}</p>
        </div>
        {job && (
          <Badge>
            {tr("Job")} #{job.id}
          </Badge>
        )}
      </header>

      <WizardStepper active={activeStep} />

      {error && (
        <div className="import-alert import-alert--danger" role="alert">
          <AlertTriangle size={18} />
          <span>{tr(error)}</span>
        </div>
      )}

      {loadingTemplates ? (
        <Card>
          <CardContent>
            <p>{tr("Loading import templates...")}</p>
          </CardContent>
        </Card>
      ) : !job ? (
        <>
          <FileUpload
            template={selectedTemplate}
            file={file}
            text={text}
            onFile={(nextFile) => {
              setFile(nextFile);
              setError("");
            }}
            onUpload={upload}
            loading={uploading}
            onBack={() => setSelectedTemplate(null)}
          />
          <TemplateSelection
            templates={templates}
            selectedKey={selectedTemplate?.key}
            text={text}
            onSelect={(template) => {
              setSelectedTemplate(template);
              setError("");
            }}
            onDownload={downloadTemplate}
            downloadingKey={downloadingKey}
          />
        </>
      ) : (
        <>
          <DetectionSummary job={job} template={selected} />
          <DatasetEvaluation
            evaluation={job.datasetEvaluation}
            locale={locale}
            onReset={resetImport}
            supportsReport={["item_name", "quantity", "gross_sales", "period_start", "period_end", "record_type"].every(
              (key) => job.mapping?.sourceHeaders?.includes(key)
            )}
            onFinish={() =>
              window.location.assign(
                ["item_name", "quantity", "gross_sales", "period_start", "period_end", "record_type"].every((key) =>
                  job.mapping?.sourceHeaders?.includes(key)
                )
                  ? `/app/assistant?importJobId=${job.id}`
                  : "/app/workspace"
              )
            }
          />
          {job.datasetEvaluation?.mode !== "analysis_only" && (
            <>
              <OptionalMappingEditor
                locale={locale}
                job={job}
                mappings={mappings}
                onChange={changeMapping}
                onSave={saveMapping}
                loading={savingMapping}
              />
              {job.validationStatus !== "needs_mapping" && <ValidationSummary job={job} />}
              {job.validationStatus !== "needs_mapping" && <PreviewTable job={job} />}
              <ConfirmPanel
                job={job}
                template={selected}
                onConfirm={confirm}
                onCancel={cancel}
                confirming={confirming}
                cancelling={cancelling}
                canConfirm={canConfirm}
              />
            </>
          )}
        </>
      )}
    </section>
  );
}
