import { useEffect, useState } from "react"
import { Check, LockKeyhole, LogOut } from "lucide-react"
import { api, useApp, useFetch } from "../lib"
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

type Rules = {
  maxFailedLogins: number
  lockMinutes: number
  sessionHours: number
  passwordMin: number
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
            onClick={() => go("team", { tab: "logins" })}
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
  return (
    <div className="page-stack">
      <PageIntro eyebrow="OWNER ONLY" title="Security" subtitle="Decide how people sign in. What each role can do is set under Team & Roles." />
      <SecurityRules />
    </div>
  )
}
