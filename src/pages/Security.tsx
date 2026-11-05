import { useEffect, useState } from "react"
import { Check, LockKeyhole, LogOut, RotateCcw } from "lucide-react"
import { api, useApp, useFetch, type Role } from "../lib"
import {
  Button,
  Card,
  CardHead,
  Confirm,
  ErrorBox,
  Field,
  FormError,
  FormGroup,
  Loading,
  PageIntro,
} from "../ui"

type Permission = {
  key: string
  group: string
  label: string
  help: string
  defaults: Role[]
}
type Matrix = Record<string, string[]>
type PermissionData = { roles: Role[]; catalog: Permission[]; matrix: Matrix }
type Rules = {
  maxFailedLogins: number
  lockMinutes: number
  sessionHours: number
  passwordMin: number
}

const sameMatrix = (a: Matrix, b: Matrix) =>
  Object.keys(a).every(
    (role) => [...a[role]].sort().join() === [...b[role]].sort().join(),
  )

function Permissions() {
  const { toast } = useApp()
  const { data, error, loading, reload } =
    useFetch<PermissionData>("/permissions")
  const [draft, setDraft] = useState<Matrix | null>(null)
  const [saveError, setSaveError] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (data) setDraft(data.matrix)
  }, [data])

  if (error && !data) return <ErrorBox message={error} onRetry={reload} />
  if ((loading && !data) || !data || !draft) return <Loading />

  const toggle = (role: string, key: string, on: boolean) =>
    setDraft({
      ...draft,
      [role]: on ? [...draft[role], key] : draft[role].filter((k) => k !== key),
    })
  const defaults = () =>
    Object.fromEntries(
      data.roles.map((role) => [
        role,
        data.catalog.filter((p) => p.defaults.includes(role)).map((p) => p.key),
      ]),
    )
  const dirty = !sameMatrix(draft, data.matrix)
  const groups = [...new Set(data.catalog.map((p) => p.group))]

  const save = async () => {
    setBusy(true)
    setSaveError("")
    try {
      await api("/permissions", { method: "PUT", body: { matrix: draft } })
      toast("Permissions saved. They apply right away.")
      reload()
    } catch (e: any) {
      setSaveError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHead
        title="Role permissions"
        subtitle="Choose what each role can do. Administrators always have full access, and only they can manage accounts, settings and security."
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDraft(defaults())}
          >
            <RotateCcw size={15} /> Use defaults
          </Button>
        }
      />
      <div className="table-scroll">
        <table className="permission-table">
          <thead>
            <tr>
              <th>Permission</th>
              <th>Administrator</th>
              {data.roles.map((role) => (
                <th key={role}>{role}</th>
              ))}
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group}>
              <tr className="permission-group">
                <th colSpan={data.roles.length + 2} scope="colgroup">
                  {group}
                </th>
              </tr>
              {data.catalog
                .filter((p) => p.group === group)
                .map((p) => (
                  <tr key={p.key}>
                    <td>
                      <b>{p.label}</b>
                      <small className="cell-sub">{p.help}</small>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked
                        disabled
                        aria-label={`${p.label} for Administrator, always on`}
                      />
                    </td>
                    {data.roles.map((role) => (
                      <td key={role}>
                        <input
                          type="checkbox"
                          checked={draft[role].includes(p.key)}
                          onChange={(e) =>
                            toggle(role, p.key, e.target.checked)
                          }
                          aria-label={`${p.label} for ${role}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          ))}
        </table>
      </div>
      <div className="settings-actions">
        <FormError message={saveError} />
        {dirty && (
          <Button variant="ghost" onClick={() => setDraft(data.matrix)}>
            Discard
          </Button>
        )}
        <Button onClick={save} disabled={busy || !dirty}>
          <Check size={16} /> Save permissions
        </Button>
      </div>
    </Card>
  )
}

function SecurityRules() {
  const { toast, reloadSettings, go } = useApp()
  const { data, error, loading, reload } = useFetch<Rules>("/security")
  const [draft, setDraft] = useState<Rules | null>(null)
  const [saveError, setSaveError] = useState("")
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    if (data) setDraft(data)
  }, [data])

  if (error && !data) return <ErrorBox message={error} onRetry={reload} />
  if ((loading && !data) || !data || !draft) return <Loading />

  const field = (key: keyof Rules) => ({
    type: "number",
    step: 1,
    required: true,
    value: draft[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setDraft({
        ...draft,
        [key]: e.target.value === "" ? "" : Number(e.target.value),
      }),
  })
  const dirty = JSON.stringify(draft) !== JSON.stringify(data)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setSaveError("")
    try {
      await api("/security", { method: "PUT", body: draft })
      toast("Security settings saved.")
      reload()
      reloadSettings()
    } catch (err: any) {
      setSaveError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card>
        <CardHead
          title="Sign-in rules"
          subtitle="These apply to every account, including yours"
        />
        <form onSubmit={save}>
          <div className="form-grid">
            <FormGroup
              label="Failed sign-ins before a lock"
              hint="From 3 to 20."
            >
              <Field {...field("maxFailedLogins")} min={3} max={20} />
            </FormGroup>
            <FormGroup label="Lock duration (minutes)" hint="From 1 to 60.">
              <Field {...field("lockMinutes")} min={1} max={60} />
            </FormGroup>
            <FormGroup
              label="Session length (hours)"
              hint="From 1 to 72. New sign-ins only. &quot;Keep me signed in&quot; stays at 30 days."
            >
              <Field {...field("sessionHours")} min={1} max={72} />
            </FormGroup>
            <FormGroup
              label="Minimum password length"
              hint="From 8 to 72. Applies the next time a password is set."
            >
              <Field {...field("passwordMin")} min={8} max={72} />
            </FormGroup>
          </div>
          <div className="settings-actions">
            <FormError message={saveError} />
            <Button type="submit" disabled={busy || !dirty}>
              <Check size={16} /> Save rules
            </Button>
          </div>
        </form>
      </Card>
      <Card>
        <CardHead
          title="Active sessions"
          subtitle="Use this if a device was lost or you think a password was shared"
        />
        <div className="settings-actions security-actions">
          <Button
            variant="secondary"
            onClick={() => go("accounts", { tab: "logins" })}
          >
            <LockKeyhole size={16} /> Review login history
          </Button>
          <Button variant="danger" onClick={() => setConfirming(true)}>
            <LogOut size={16} /> Sign out everyone else
          </Button>
        </div>
      </Card>
      {confirming && (
        <Confirm
          title="Sign out everyone else?"
          message="Every other account is signed out on all devices right away, and any unfinished sale is lost. Passwords don't change."
          confirmLabel="Sign out everyone"
          danger
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            try {
              const r = await api<{ ended: number }>("/security/end-sessions", {
                method: "POST",
              })
              toast(
                r.ended === 1
                  ? "1 session ended."
                  : `${r.ended} sessions ended.`,
              )
            } catch (e: any) {
              toast(e.message, "danger")
            }
            setConfirming(false)
          }}
        />
      )}
    </>
  )
}

export function SecurityPage() {
  const [tab, setTab] = useState<"permissions" | "security">("permissions")
  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="ADMIN ONLY"
        title="Permissions & security"
        subtitle="Decide what each role can do and how people sign in."
      />
      <div className="segmented tabs">
        <button
          type="button"
          className={tab === "permissions" ? "active" : ""}
          onClick={() => setTab("permissions")}
        >
          Permissions
        </button>
        <button
          type="button"
          className={tab === "security" ? "active" : ""}
          onClick={() => setTab("security")}
        >
          Security
        </button>
      </div>
      {tab === "permissions" ? <Permissions /> : <SecurityRules />}
    </div>
  )
}
