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

const STEPS = ["Template", "Upload", "Mapping", "Validation", "Preview", "Confirm"];

function bytes(value) {
  const size = Number(value || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function errorMessage(error) {
  return error?.message || "Unable to complete the import request.";
}

function stepIndex({ template, file, job }) {
  if (!template) return 0;
  if (!file && !job) return 1;
  if (!job) return 1;
  if (job.validationStatus === "needs_mapping") return 2;
  if (job.validationStatus === "validation_failed") return 3;
  if (job.validationStatus === "ready") return 4;
  return 5;
}

function WizardStepper({ active }) {
  return (
    <ol className="import-stepper" aria-label="Import progress">
      {STEPS.map((label, index) => (
        <li key={label} className={index === active ? "is-active" : index < active ? "is-complete" : ""}>
          <span>{index < active ? <Check size={14} /> : index + 1}</span>
          <strong>{label}</strong>
        </li>
      ))}
    </ol>
  );
}

function TemplateSelection({ templates, selectedKey, onSelect, onDownload, downloadingKey }) {
  return (
    <section className="import-section" aria-labelledby="import-template-title">
      <div className="import-section__heading">
        <div>
          <p className="import-eyebrow">Step 1</p>
          <h2 id="import-template-title">Choose what you want to import</h2>
          <p>Use a Restrova template or upload an existing CSV/XLSX file. Nothing is written before confirmation.</p>
        </div>
      </div>
      <div className="import-template-grid">
        {templates.map((template) => {
          const selected = template.key === selectedKey;
          return (
            <Card key={template.key} interactive className={`import-template-card ${selected ? "is-selected" : ""}`}>
              <CardHeader status={selected ? <Badge variant="success">Selected</Badge> : null}>
                <div className="import-template-card__title">
                  <FileSpreadsheet size={20} />
                  <CardTitle>{template.displayName}</CardTitle>
                </div>
                <CardDescription>{template.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="import-template-card__meta">
                  {template.requiredColumns?.length || 0} required · {template.optionalColumns?.length || 0} optional
                </p>
                <div className="import-template-card__actions">
                  <Button variant={selected ? "primary" : "outline"} onClick={() => onSelect(template)}>
                    {selected ? "Selected" : "Choose"}
                  </Button>
                  <Button
                    variant="ghost"
                    leadingIcon={<Download size={16} />}
                    loading={downloadingKey === template.key}
                    onClick={() => onDownload(template.key)}
                  >
                    Template
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function FileUpload({ template, file, onFile, onUpload, loading, onBack }) {
  const inputRef = useRef(null);
  return (
    <section className="import-section" aria-labelledby="import-upload-title">
      <div className="import-section__heading">
        <div>
          <p className="import-eyebrow">Step 2</p>
          <h2 id="import-upload-title">Upload {template.displayName}</h2>
          <p>Accepted formats: CSV and XLSX. The server validates the file before creating a preview.</p>
        </div>
        <Button variant="ghost" leadingIcon={<ArrowLeft size={16} />} onClick={onBack}>
          Change template
        </Button>
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
            <strong>{file ? file.name : "Choose a CSV or XLSX file"}</strong>
            <span>{file ? `${bytes(file.size)} · ${file.type || "File"}` : "Click to browse from your computer"}</span>
            <input
              ref={inputRef}
              className="sr-only"
              aria-label="CSV or XLSX file"
              type="file"
              accept=".csv,.xlsx,text/csv,application/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => onFile(event.target.files?.[0] || null)}
            />
          </div>
          <div className="import-actions import-actions--end">
            <Button disabled={!file} loading={loading} leadingIcon={<UploadCloud size={16} />} onClick={onUpload}>
              Validate file
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function MappingEditor({ job, mappings, onChange, onSave, loading }) {
  const targets = job.mapping?.targetFields || [];
  return (
    <section className="import-section" aria-labelledby="import-mapping-title">
      <div className="import-section__heading">
        <div>
          <p className="import-eyebrow">Step 3</p>
          <h2 id="import-mapping-title">Review column mapping</h2>
          <p>
            Map each uploaded column to a Restrova field. Required fields must be mapped before validation can continue.
          </p>
        </div>
        <Badge variant={job.mapping?.ready ? "success" : "warning"}>
          {job.mapping?.ready
            ? "Mapping complete"
            : `${job.mapping?.missingRequiredMappings?.length || 0} required missing`}
        </Badge>
      </div>
      <Card>
        <CardContent className="import-table-wrap">
          <table className="import-table">
            <thead>
              <tr>
                <th>Uploaded column</th>
                <th>Restrova field</th>
                <th>Status</th>
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
                      aria-label={`Map ${mapping.sourceColumn}`}
                      value={mapping.targetField || ""}
                      onChange={(event) => onChange(index, event.target.value || null)}
                    >
                      <option value="">Ignore column</option>
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
                      {mapping.targetField ? "Mapped" : "Unmapped"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
        <div className="import-card-footer">
          <Button loading={loading} leadingIcon={<Save size={16} />} onClick={onSave}>
            Save mapping & validate
          </Button>
        </div>
      </Card>
    </section>
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
            ? "Warnings do not necessarily block confirmation."
            : "Fix these rows and upload again before confirming."}
        </CardDescription>
      </CardHeader>
      <CardContent className="import-table-wrap">
        <table className="import-table">
          <thead>
            <tr>
              <th>Row</th>
              <th>Column</th>
              <th>Value</th>
              <th>Message</th>
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
  const stats = job.statistics || {};
  return (
    <section className="import-section" aria-labelledby="import-validation-title">
      <div className="import-section__heading">
        <div>
          <p className="import-eyebrow">Step 4</p>
          <h2 id="import-validation-title">Validation results</h2>
          <p>Review accepted, rejected, duplicate and warning counts before confirming the import.</p>
        </div>
        <Badge variant={job.validationStatus === "ready" ? "success" : "danger"}>
          {job.validationStatus === "ready" ? "Ready to confirm" : "Action required"}
        </Badge>
      </div>
      <div className="import-stats">
        <StatCard label="Total rows" value={stats.total ?? 0} />
        <StatCard label="Valid" value={stats.accepted ?? 0} tone="success" />
        <StatCard label="Invalid" value={stats.rejected ?? 0} tone={stats.rejected ? "danger" : "neutral"} />
        <StatCard label="Duplicates" value={stats.duplicates ?? 0} tone="warning" />
        <StatCard label="Warnings" value={stats.warnings ?? 0} tone="warning" />
      </div>
      <IssueTable title="Blocking errors" rows={job.rowErrors || []} />
      <IssueTable title="Warnings" rows={job.rowWarnings || []} warning />
      {(job.mapping?.warnings || []).length > 0 && (
        <Card>
          <CardHeader status={<Badge variant="warning">{job.mapping.warnings.length}</Badge>}>
            <CardTitle>Unmapped optional columns</CardTitle>
            <CardDescription>These columns will be ignored unless you map them manually.</CardDescription>
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
  const headers = job.mapping?.sourceHeaders || [];
  return (
    <section className="import-section" aria-labelledby="import-preview-title">
      <div className="import-section__heading">
        <div>
          <p className="import-eyebrow">Step 5</p>
          <h2 id="import-preview-title">Preview</h2>
          <p>Showing up to 20 rows using the original uploaded column names.</p>
        </div>
      </div>
      <Card>
        <CardContent className="import-table-wrap">
          <table className="import-table import-table--preview">
            <thead>
              <tr>
                <th>Row</th>
                <th>Status</th>
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
                      {row.status}
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
  return (
    <section className="import-section" aria-labelledby="import-confirm-title">
      <Card>
        <CardHeader
          status={
            <Badge variant={canConfirm ? "success" : "danger"}>{canConfirm ? "Safe to import" : "Blocked"}</Badge>
          }
        >
          <div>
            <p className="import-eyebrow">Step 6</p>
            <CardTitle>Confirm import</CardTitle>
            <CardDescription>Restrova writes only accepted rows after this explicit confirmation.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="import-confirm-grid">
            <div>
              <dt>Template</dt>
              <dd>{template?.displayName || job.templateKey}</dd>
            </div>
            <div>
              <dt>File</dt>
              <dd>{job.file?.name}</dd>
            </div>
            <div>
              <dt>Total rows</dt>
              <dd>{job.statistics?.total ?? 0}</dd>
            </div>
            <div>
              <dt>Accepted</dt>
              <dd>{job.statistics?.accepted ?? 0}</dd>
            </div>
            <div>
              <dt>Duplicates</dt>
              <dd>{job.statistics?.duplicates ?? 0}</dd>
            </div>
            <div>
              <dt>Import job</dt>
              <dd>#{job.id}</dd>
            </div>
          </dl>
        </CardContent>
        <div className="import-card-footer import-card-footer--split">
          <Button variant="ghost" loading={cancelling} onClick={onCancel}>
            Cancel import
          </Button>
          <Button
            disabled={!canConfirm}
            loading={confirming}
            leadingIcon={<CheckCircle2 size={16} />}
            onClick={onConfirm}
          >
            Confirm import
          </Button>
        </div>
      </Card>
    </section>
  );
}

function Completion({ job, onReset }) {
  const cancelled = job.status === "cancelled";
  return (
    <section className="import-completion">
      {cancelled ? <XCircle size={54} /> : <CheckCircle2 size={54} />}
      <Badge variant={cancelled ? "warning" : "success"}>{cancelled ? "Cancelled" : "Completed"}</Badge>
      <h1>{cancelled ? "Import cancelled" : "Import completed"}</h1>
      <p>
        {cancelled
          ? "No staged data was written. You can start another import whenever you are ready."
          : `${job.statistics?.imported ?? 0} rows were imported successfully.`}
      </p>
      <div className="import-actions">
        <Button leadingIcon={<RefreshCcw size={16} />} onClick={onReset}>
          Import another file
        </Button>
        {!cancelled && (
          <Button variant="outline" onClick={() => window.location.assign("/app/workspace")}>
            View workspace
          </Button>
        )}
      </div>
    </section>
  );
}

export function ImportWizardPage() {
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
    if (!selectedTemplate || !file) return;
    setError("");
    setUploading(true);
    try {
      const result = await previewImportFile({ templateKey: selectedTemplate.key, file });
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
      <main className="import-page" id="main-content">
        <Completion job={job} onReset={resetImport} />
      </main>
    );
  }

  return (
    <main className="import-page" id="main-content">
      <header className="import-page__header">
        <div>
          <Badge variant="info">Safe staged import</Badge>
          <h1>Import restaurant data</h1>
          <p>Validate, map and preview CSV/XLSX data before anything is written to your restaurant.</p>
        </div>
        {job && <Badge>Job #{job.id}</Badge>}
      </header>

      <WizardStepper active={activeStep} />

      {error && (
        <div className="import-alert import-alert--danger" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {loadingTemplates ? (
        <Card>
          <CardContent>
            <p>Loading import templates...</p>
          </CardContent>
        </Card>
      ) : !selectedTemplate && !job ? (
        <TemplateSelection
          templates={templates}
          selectedKey={selectedTemplate?.key}
          onSelect={(template) => {
            setSelectedTemplate(template);
            setError("");
          }}
          onDownload={downloadTemplate}
          downloadingKey={downloadingKey}
        />
      ) : !job ? (
        <FileUpload
          template={selectedTemplate}
          file={file}
          onFile={(nextFile) => {
            setFile(nextFile);
            setError("");
          }}
          onUpload={upload}
          loading={uploading}
          onBack={() => {
            setSelectedTemplate(null);
            setFile(null);
          }}
        />
      ) : (
        <>
          <MappingEditor
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
    </main>
  );
}
