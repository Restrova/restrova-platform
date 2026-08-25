import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Clock3, MapPin, Pencil, Plus, Save, X } from "lucide-react";
import { Badge } from "../components/ui/Badge.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card.jsx";
import { FormField } from "../components/ui/FormField.jsx";
import { Input } from "../components/ui/Input.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useLocale } from "../contexts/LocaleContext.jsx";
import { createBranch, listBranches, updateBranch } from "../lib/management.js";

const emptyBranch = {
  name: "",
  code: "",
  city: "Guangzhou",
  address: "",
  phone: "",
  posSystem: "",
  operatingDayStart: "10:00",
  operatingDayEnd: "02:00"
};

function editableBranch(branch) {
  return {
    name: branch.name || "",
    code: branch.code || "",
    city: branch.city || "",
    address: branch.address || "",
    phone: branch.phone || "",
    posSystem: branch.pos_system || "",
    operatingDayStart: branch.operating_day_start || "10:00",
    operatingDayEnd: branch.operating_day_end || "02:00"
  };
}

function BranchFields({ value, onChange }) {
  const { t } = useLocale();
  const set = (field) => (event) => onChange({ ...value, [field]: event.target.value });

  return (
    <div className="management-form-grid">
      <FormField label={t("branches.name")} required>
        {({ id, describedBy }) => (
          <Input id={id} aria-describedby={describedBy} value={value.name} onChange={set("name")} required />
        )}
      </FormField>
      <FormField label={t("branches.code")} required>
        {({ id, describedBy }) => (
          <Input id={id} aria-describedby={describedBy} value={value.code} onChange={set("code")} required />
        )}
      </FormField>
      <FormField label={t("branches.city")} required>
        {({ id, describedBy }) => (
          <Input id={id} aria-describedby={describedBy} value={value.city} onChange={set("city")} required />
        )}
      </FormField>
      <FormField label={t("branches.address")} optional>
        {({ id, describedBy }) => (
          <Input id={id} aria-describedby={describedBy} value={value.address} onChange={set("address")} />
        )}
      </FormField>
      <FormField label={t("branches.phone")} optional>
        {({ id, describedBy }) => (
          <Input id={id} aria-describedby={describedBy} value={value.phone} onChange={set("phone")} />
        )}
      </FormField>
      <FormField label={t("branches.posSystem")} optional>
        {({ id, describedBy }) => (
          <Input id={id} aria-describedby={describedBy} value={value.posSystem} onChange={set("posSystem")} />
        )}
      </FormField>
      <FormField label={t("branches.dayStart")} required>
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            type="time"
            value={value.operatingDayStart}
            onChange={set("operatingDayStart")}
            required
          />
        )}
      </FormField>
      <FormField label={t("branches.dayEnd")} required>
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            type="time"
            value={value.operatingDayEnd}
            onChange={set("operatingDayEnd")}
            required
          />
        )}
      </FormField>
    </div>
  );
}

export function BranchesPage() {
  const auth = useAuth();
  const { t } = useLocale();
  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState(emptyBranch);
  const [editingId, setEditingId] = useState(null);
  const [editing, setEditing] = useState(emptyBranch);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const owner = auth.user?.role === "owner";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setBranches(await listBranches());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const branchCodes = useMemo(() => new Set(branches.map((branch) => branch.code.toLowerCase())), [branches]);

  async function submitCreate(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (branchCodes.has(form.code.trim().toLowerCase())) {
      setError(t("branches.duplicateCode"));
      return;
    }
    setSaving(true);
    try {
      await createBranch(form);
      setForm(emptyBranch);
      await load();
      await auth.restore();
      setNotice(t("branches.created"));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    try {
      await updateBranch(editingId, editing);
      setEditingId(null);
      await load();
      await auth.restore();
      setNotice(t("branches.updated"));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  if (!owner) {
    return (
      <main className="management-page" id="main-content">
        <Card>
          <CardHeader>
            <CardTitle>{t("errors.permissionTitle")}</CardTitle>
            <CardDescription>{t("errors.permissionDescription")}</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="management-page" id="main-content">
      <header className="management-page__header">
        <div>
          <Badge variant="info">{t("branches.badge")}</Badge>
          <h1>{t("branches.title")}</h1>
          <p>{t("branches.description")}</p>
        </div>
        <Badge variant="neutral">
          {branches.length} {t("branches.count")}
        </Badge>
      </header>

      {error && (
        <div className="management-alert management-alert--danger" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="management-alert management-alert--success" role="status">
          {notice}
        </div>
      )}

      <section className="management-layout">
        <Card>
          <CardHeader>
            <CardTitle>{t("branches.current")}</CardTitle>
            <CardDescription>{t("branches.currentDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="management-list">
            {loading && <p>{t("common.loading")}</p>}
            {!loading && branches.length === 0 && <p>{t("branches.empty")}</p>}
            {branches.map((branch) => (
              <article className="management-list-item" key={branch.id}>
                <div className="management-list-item__icon">
                  <Building2 size={20} />
                </div>
                <div className="management-list-item__body">
                  <div className="management-list-item__title">
                    <strong>{branch.name}</strong>
                    <Badge>{branch.code}</Badge>
                  </div>
                  <span>
                    <MapPin size={14} /> {branch.city}
                  </span>
                  <span>
                    <Clock3 size={14} /> {branch.operating_day_start}–{branch.operating_day_end}
                  </span>
                </div>
                <Button
                  size="small"
                  variant="ghost"
                  leadingIcon={<Pencil size={15} />}
                  onClick={() => {
                    setEditingId(branch.id);
                    setEditing(editableBranch(branch));
                    setError("");
                    setNotice("");
                  }}
                >
                  {t("common.edit")}
                </Button>
              </article>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("branches.add")}</CardTitle>
            <CardDescription>{t("branches.addDescription")}</CardDescription>
          </CardHeader>
          <form onSubmit={submitCreate}>
            <CardContent>
              <BranchFields value={form} onChange={setForm} />
            </CardContent>
            <footer className="ui-card__footer management-actions">
              <Button type="submit" loading={saving} leadingIcon={<Plus size={16} />}>
                {t("branches.create")}
              </Button>
            </footer>
          </form>
        </Card>
      </section>

      {editingId && (
        <Card className="management-edit-card">
          <CardHeader>
            <CardTitle>{t("branches.editTitle")}</CardTitle>
            <Button variant="ghost" size="small" aria-label={t("common.close")} onClick={() => setEditingId(null)}>
              <X size={16} />
            </Button>
          </CardHeader>
          <form onSubmit={submitEdit}>
            <CardContent>
              <BranchFields value={editing} onChange={setEditing} />
            </CardContent>
            <footer className="ui-card__footer management-actions">
              <Button variant="outline" onClick={() => setEditingId(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={saving} leadingIcon={<Save size={16} />}>
                {t("common.save")}
              </Button>
            </footer>
          </form>
        </Card>
      )}
    </main>
  );
}
