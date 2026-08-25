import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, KeyRound, Save, ShieldCheck, UserPlus, Users } from "lucide-react";
import { Badge } from "../components/ui/Badge.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card.jsx";
import { FormField } from "../components/ui/FormField.jsx";
import { Input } from "../components/ui/Input.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useLocale } from "../contexts/LocaleContext.jsx";
import { inviteUser, listBranches, listUsers, updateUserRole } from "../lib/management.js";

const emptyInvite = { name: "", email: "", role: "viewer", branchId: "" };

function roleLabel(t, role) {
  return t(`team.roles.${role}`);
}

export function TeamPage() {
  const auth = useAuth();
  const { t } = useLocale();
  const [branches, setBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [invite, setInvite] = useState(emptyInvite);
  const [drafts, setDrafts] = useState({});
  const [temporaryCredential, setTemporaryCredential] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const owner = auth.user?.role === "owner";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextBranches, nextUsers] = await Promise.all([listBranches(), listUsers()]);
      setBranches(nextBranches);
      setUsers(nextUsers);
      setDrafts(
        Object.fromEntries(
          nextUsers.map((user) => [
            user.id,
            { role: user.role, branchId: user.branch_id ? String(user.branch_id) : "" }
          ])
        )
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (owner) load();
  }, [load, owner]);

  const ownerCount = useMemo(() => users.filter((user) => user.role === "owner").length, [users]);

  async function submitInvite(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setTemporaryCredential(null);
    if (invite.role === "branch_manager" && !invite.branchId) {
      setError(t("team.branchRequired"));
      return;
    }
    setSaving(true);
    try {
      const result = await inviteUser({
        name: invite.name || undefined,
        email: invite.email,
        role: invite.role,
        branchId: invite.role === "branch_manager" ? Number(invite.branchId) : undefined
      });
      setInvite(emptyInvite);
      await load();
      if (result.temporaryPassword) {
        setTemporaryCredential({ email: result.email, password: result.temporaryPassword });
      } else {
        setNotice(t("team.existingAccountAdded"));
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  function updateDraft(userId, field, value) {
    setDrafts((current) => ({
      ...current,
      [userId]: {
        ...current[userId],
        [field]: value,
        ...(field === "role" && value !== "branch_manager" ? { branchId: "" } : {})
      }
    }));
  }

  async function saveRole(user) {
    const draft = drafts[user.id];
    if (!draft) return;
    if (draft.role === "branch_manager" && !draft.branchId) {
      setError(t("team.branchRequired"));
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await updateUserRole(user.id, {
        role: draft.role,
        branchId: draft.role === "branch_manager" ? Number(draft.branchId) : undefined
      });
      await load();
      setNotice(t("team.roleUpdated"));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function copyPassword() {
    if (!temporaryCredential?.password) return;
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(temporaryCredential.password);
    setCopied(true);
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
          <Badge variant="info">{t("team.badge")}</Badge>
          <h1>{t("team.title")}</h1>
          <p>{t("team.description")}</p>
        </div>
        <Badge>
          {users.length} {t("team.count")}
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

      {temporaryCredential && (
        <Card className="credential-card">
          <CardHeader status={<Badge variant="warning">{t("team.shownOnce")}</Badge>}>
            <CardTitle>{t("team.temporaryPassword")}</CardTitle>
            <CardDescription>{t("team.temporaryPasswordHelp")}</CardDescription>
          </CardHeader>
          <CardContent className="credential-card__content">
            <KeyRound size={22} />
            <div>
              <small>{temporaryCredential.email}</small>
              <code>{temporaryCredential.password}</code>
            </div>
            <Button
              variant="outline"
              leadingIcon={copied ? <Check size={16} /> : <Copy size={16} />}
              onClick={copyPassword}
            >
              {copied ? t("team.copied") : t("team.copy")}
            </Button>
          </CardContent>
        </Card>
      )}

      <section className="management-layout management-layout--team">
        <Card>
          <CardHeader>
            <CardTitle>{t("team.invite")}</CardTitle>
            <CardDescription>{t("team.inviteDescription")}</CardDescription>
          </CardHeader>
          <form onSubmit={submitInvite}>
            <CardContent className="management-form-stack">
              <FormField label={t("team.name")} optional>
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    value={invite.name}
                    onChange={(e) => setInvite({ ...invite, name: e.target.value })}
                  />
                )}
              </FormField>
              <FormField label={t("team.email")} required>
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    type="email"
                    value={invite.email}
                    onChange={(e) => setInvite({ ...invite, email: e.target.value })}
                    required
                  />
                )}
              </FormField>
              <FormField label={t("team.role")} required>
                {({ id, describedBy }) => (
                  <select
                    className="management-select"
                    id={id}
                    aria-describedby={describedBy}
                    value={invite.role}
                    onChange={(e) =>
                      setInvite({
                        ...invite,
                        role: e.target.value,
                        branchId: e.target.value === "branch_manager" ? invite.branchId : ""
                      })
                    }
                  >
                    <option value="viewer">{roleLabel(t, "viewer")}</option>
                    <option value="branch_manager">{roleLabel(t, "branch_manager")}</option>
                  </select>
                )}
              </FormField>
              <FormField
                label={t("team.branch")}
                required={invite.role === "branch_manager"}
                optional={invite.role !== "branch_manager"}
              >
                {({ id, describedBy }) => (
                  <select
                    className="management-select"
                    id={id}
                    aria-describedby={describedBy}
                    value={invite.branchId}
                    disabled={invite.role !== "branch_manager"}
                    onChange={(e) => setInvite({ ...invite, branchId: e.target.value })}
                  >
                    <option value="">{t("team.selectBranch")}</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.code} — {branch.name}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
            </CardContent>
            <footer className="ui-card__footer management-actions">
              <Button type="submit" loading={saving} leadingIcon={<UserPlus size={16} />}>
                {t("team.sendInvite")}
              </Button>
            </footer>
          </form>
        </Card>

        <Card>
          <CardHeader
            status={
              <Badge variant="success">
                <ShieldCheck size={13} /> {ownerCount} {t("team.owners")}
              </Badge>
            }
          >
            <CardTitle>{t("team.access")}</CardTitle>
            <CardDescription>{t("team.accessDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="team-list">
            {loading && <p>{t("common.loading")}</p>}
            {!loading && users.length === 0 && <p>{t("team.empty")}</p>}
            {users.map((user) => {
              const draft = drafts[user.id] || {
                role: user.role,
                branchId: user.branch_id ? String(user.branch_id) : ""
              };
              const self = Number(user.id) === Number(auth.user?.id);
              const unchanged =
                draft.role === user.role && String(draft.branchId || "") === String(user.branch_id || "");
              return (
                <article className="team-member" key={user.id}>
                  <div className="team-member__identity">
                    <span className="team-member__avatar">
                      <Users size={17} />
                    </span>
                    <div>
                      <strong>{user.name || user.email}</strong>
                      <small>{user.email}</small>
                    </div>
                  </div>
                  <select
                    aria-label={`${t("team.role")} ${user.email}`}
                    className="management-select"
                    value={draft.role}
                    disabled={self}
                    onChange={(e) => updateDraft(user.id, "role", e.target.value)}
                  >
                    <option value="owner">{roleLabel(t, "owner")}</option>
                    <option value="branch_manager">{roleLabel(t, "branch_manager")}</option>
                    <option value="viewer">{roleLabel(t, "viewer")}</option>
                  </select>
                  <select
                    aria-label={`${t("team.branch")} ${user.email}`}
                    className="management-select"
                    value={draft.branchId}
                    disabled={self || draft.role !== "branch_manager"}
                    onChange={(e) => updateDraft(user.id, "branchId", e.target.value)}
                  >
                    <option value="">
                      {draft.role === "branch_manager" ? t("team.selectBranch") : t("team.allBranches")}
                    </option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.code} — {branch.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="small"
                    variant="outline"
                    leadingIcon={<Save size={14} />}
                    disabled={self || unchanged || saving}
                    onClick={() => saveRole(user)}
                  >
                    {self ? t("team.you") : t("common.save")}
                  </Button>
                </article>
              );
            })}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
