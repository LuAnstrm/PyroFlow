import { useState } from "react"
import { Check, CircleCheck, CircleX, Download, KeyRound, Pencil, Plus, Power, Search, ShieldCheck, UserCheck, Users, Wifi } from "lucide-react"
import { api, downloadCsv, fmtDateTime, timeAgo, useApp, useFetch, type PageParams, type Paged, type Role } from "../lib"
import { Avatar, Badge, Button, Card, Confirm, Empty, ErrorBox, Field, FormError, FormGroup, Loading, Metric, Modal, PageIntro, Pagination, ROLE_TONE, Select } from "../ui"

type Account = { id: number; name: string; username: string; role: Role; status: "Active" | "Inactive"; createdAt: string; lastLoginAt: string | null; online: number; loginCount: number }
type LoginLog = { id: number; username: string; success: number; reason: string | null; ip: string | null; device: string | null; loginAt: string; logoutAt: string | null; name: string | null; role: Role | null; active: number }
const ROLE_LABEL: Record<Role, string> = { Administrator: "Administrator", Owner: "Owner", Manager: "Manager", Staff: "Staff (cashier)" }

function AccountForm({ account, isSelf, onClose, onSaved }: { account: Account | null; isSelf: boolean; onClose: () => void; onSaved: () => void }) {
  const { settings } = useApp()
  const passwordMin = Number(settings.security_password_min) || 8
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const body = Object.fromEntries(new FormData(e.currentTarget))
    setBusy(true)
    setError("")
    try {
      if (account) await api(`/users/${account.id}`, { method: "PUT", body: { ...body, role: isSelf ? account.role : body.role } })
      else await api("/users", { method: "POST", body })
      onSaved()
    } catch (err: any) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <Modal eyebrow={account ? "EDIT ACCOUNT" : "NEW ACCOUNT"} title={account ? account.name : "Add account"} onClose={onClose}>
      <form onSubmit={submit} autoComplete="off">
        <div className="form-grid">
          <FormGroup label="Full name" wide>
            <Field name="name" defaultValue={account?.name} maxLength={120} required autoFocus />
          </FormGroup>
          <FormGroup label="Username">
            <Field name="username" defaultValue={account?.username} maxLength={60} required autoComplete="off" />
          </FormGroup>
          <FormGroup label="Role" hint={isSelf ? "You can't change your own role." : undefined}>
            <Select name="role" defaultValue={account?.role ?? "Staff"} disabled={isSelf}>
              <option value="Staff">Staff (cashier)</option>
              <option value="Manager">Manager</option>
              <option value="Owner">Owner</option>
              <option value="Administrator">Administrator</option>
            </Select>
          </FormGroup>
          {!account && (
            <FormGroup label="Temporary password" hint={`At least ${passwordMin} characters. Share it with the person privately.`} wide>
              <Field name="password" type="password" minLength={passwordMin} maxLength={72} required autoComplete="new-password" />
            </FormGroup>
          )}
        </div>
        <FormError message={error} />
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            <Check size={17} /> {account ? "Save changes" : "Create account"}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function ResetPassword({ account, onClose, onSaved }: { account: Account; onClose: () => void; onSaved: () => void }) {
  const { settings } = useApp()
  const passwordMin = Number(settings.security_password_min) || 8
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api(`/users/${account.id}/password`, { method: "POST", body: { password } })
      onSaved()
    } catch (err: any) {
      setError(err.message)
    }
  }
  return (
    <Modal eyebrow="RESET PASSWORD" title={account.name} onClose={onClose} width={440}>
      <form onSubmit={submit} autoComplete="off">
        <FormGroup label="New password" hint={`At least ${passwordMin} characters. They'll be signed out and must use the new one.`}>
          <Field type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={passwordMin} maxLength={72} required autoFocus autoComplete="new-password" />
        </FormGroup>
        <FormError message={error} />
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Reset password</Button>
        </div>
      </form>
    </Modal>
  )
}

function LoginHistory({ users }: { users: Account[] }) {
  const { toast } = useApp()
  const [userId, setUserId] = useState("")
  const [result, setResult] = useState("")
  const [page, setPage] = useState(1)
  const filter = `${userId ? `&user=${userId}` : ""}${result ? `&result=${result}` : ""}`
  const { data, error, loading, reload } = useFetch<Paged<LoginLog>>(`/login-logs?page=${page}&size=12${filter}`)
  const exportCsv = async () => {
    try {
      const r = await api<Paged<LoginLog>>(`/login-logs?size=5000${filter}`)
      downloadCsv("login-history.csv", [["Signed in", "Signed out", "Name", "Username", "Role", "Result", "Device", "IP"], ...r.rows.map((l) => [fmtDateTime(l.loginAt), l.logoutAt ? fmtDateTime(l.logoutAt) : "", l.name, l.username, l.role, l.success ? "Success" : l.reason, l.device, l.ip])])
    } catch (e: any) {
      toast(e.message, "danger")
    }
  }
  return (
    <Card>
      <div className="table-toolbar">
        <div>
          <Select
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value)
              setPage(1)
            }}
            aria-label="Filter by account"
          >
            <option value="">All accounts</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
          <Select
            value={result}
            onChange={(e) => {
              setResult(e.target.value)
              setPage(1)
            }}
            aria-label="Filter by result"
          >
            <option value="">All attempts</option>
            <option value="success">Successful</option>
            <option value="failed">Failed</option>
          </Select>
        </div>
        <Button variant="secondary" onClick={exportCsv}>
          <Download size={16} /> Export CSV
        </Button>
      </div>
      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Loading />
      ) : data?.rows.length === 0 ? (
        <Empty title="No login records match" />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Signed in</th>
                <th>Account</th>
                <th>Role</th>
                <th>Result</th>
                <th>Signed out</th>
                <th>Device / IP address</th>
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((l) => (
                <tr key={l.id}>
                  <td title={timeAgo(l.loginAt)}>{fmtDateTime(l.loginAt)}</td>
                  <td>
                    <b>{l.name ?? l.username}</b>
                    <small className="cell-sub">@{l.username}</small>
                  </td>
                  <td>{l.role ? <Badge tone={ROLE_TONE[l.role]}>{l.role}</Badge> : "—"}</td>
                  <td>
                    {l.success ? (
                      <span className="result ok">
                        <CircleCheck size={15} /> Success
                      </span>
                    ) : (
                      <span className="result bad">
                        <CircleX size={15} /> {l.reason ?? "Failed"}
                      </span>
                    )}
                  </td>
                  <td>{!l.success ? "—" : l.logoutAt ? fmtDateTime(l.logoutAt) : l.active ? <Badge tone="success">Still signed in</Badge> : "Session expired"}</td>
                  <td>
                    {l.device ?? "—"}
                    <small className="cell-sub">{l.ip}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={page} size={data.size} total={data.total} onPage={setPage} label="records" />}
    </Card>
  )
}

export function Accounts({ params }: { params: PageParams }) {
  const { user, setUser, toast } = useApp()
  const { data: users, error, loading, reload } = useFetch<Account[]>("/users")
  const [tab, setTab] = useState(params.tab === "logins" ? "logins" : "accounts")
  const [search, setSearch] = useState("")
  const [role, setRole] = useState("")
  const [form, setForm] = useState<Account | null | undefined>(undefined)
  const [resetting, setResetting] = useState<Account | null>(null)
  const [toggling, setToggling] = useState<Account | null>(null)

  if (loading && !users) return <Loading />
  if (error && !users) return <ErrorBox message={error} onRetry={reload} />
  const all = users ?? []
  const q = search.trim().toLowerCase()
  const shown = all.filter((u) => (!q || u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)) && (!role || u.role === role))

  return (
    <div className="page-stack">
      <PageIntro eyebrow="ADMIN ONLY" title="Accounts & logins" subtitle="See who uses the POS, review past logins, and add new accounts.">
        <Button onClick={() => setForm(null)}>
          <Plus size={17} /> Add account
        </Button>
      </PageIntro>
      <div className="metrics-grid">
        <Metric icon={Users} label="All accounts" value={String(all.length)} note={`${all.filter((u) => u.role === "Manager").length} managers, ${all.filter((u) => u.role === "Staff").length} cashiers`} tone="blue" />
        <Metric icon={UserCheck} label="Active" value={String(all.filter((u) => u.status === "Active").length)} note="Can sign in" tone="green" />
        <Metric icon={Wifi} label="Using the POS now" value={String(all.filter((u) => u.online).length)} note="Active in the last 5 minutes" />
        <Metric icon={ShieldCheck} label="Inactive" value={String(all.filter((u) => u.status === "Inactive").length)} note="Blocked from signing in" tone="red" />
      </div>
      <div className="segmented tabs">
        <button type="button" className={tab === "accounts" ? "active" : ""} onClick={() => setTab("accounts")}>
          Accounts
        </button>
        <button type="button" className={tab === "logins" ? "active" : ""} onClick={() => setTab("logins")}>
          Login history
        </button>
      </div>
      {tab === "logins" ? (
        <LoginHistory users={all} />
      ) : (
        <Card>
          <div className="table-toolbar">
            <Field icon={Search} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or username…" />
            <Select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by role">
              <option value="">All roles</option>
              <option>Administrator</option>
              <option>Owner</option>
              <option>Manager</option>
              <option>Staff</option>
            </Select>
          </div>
          {shown.length === 0 ? (
            <Empty title="No accounts match" />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Last login</th>
                    <th className="num">Logins</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((u) => {
                    const self = u.id === user.id
                    return (
                      <tr key={u.id}>
                        <td>
                          <div className="table-product">
                            <Avatar name={u.name} />
                            <span>
                              <b>
                                {u.name}
                                {self && " (you)"}
                              </b>
                              <small>@{u.username}</small>
                            </span>
                          </div>
                        </td>
                        <td>
                          <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
                        </td>
                        <td>
                          {u.online ? (
                            <span className="online-dot">Online now</span>
                          ) : (
                            <Badge tone={u.status === "Active" ? "success" : "neutral"}>{u.status}</Badge>
                          )}
                        </td>
                        <td>{u.lastLoginAt ? timeAgo(u.lastLoginAt) : "Never"}</td>
                        <td className="num">{u.loginCount}</td>
                        <td>{fmtDateTime(u.createdAt).split(",").slice(0, 2).join(",")}</td>
                        <td>
                          <div className="row-actions">
                            <button type="button" title="Edit" aria-label={`Edit ${u.name}`} onClick={() => setForm(u)}>
                              <Pencil size={16} />
                            </button>
                            <button type="button" title="Reset password" aria-label={`Reset password for ${u.name}`} onClick={() => setResetting(u)}>
                              <KeyRound size={16} />
                            </button>
                            {!self && (
                              <button type="button" title={u.status === "Active" ? "Deactivate" : "Reactivate"} aria-label={`${u.status === "Active" ? "Deactivate" : "Reactivate"} ${u.name}`} onClick={() => setToggling(u)}>
                                <Power size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      {form !== undefined && (
        <AccountForm
          account={form}
          isSelf={form?.id === user.id}
          onClose={() => setForm(undefined)}
          onSaved={() => {
            toast(form ? "Account updated." : "Account created.")
            // Editing your own account also updates the name shown in the top bar.
            if (form?.id === user.id) {
              api<{ user: typeof user | null }>("/auth/me")
                .then((r) => r.user && setUser(r.user))
                .catch(() => {})
            }
            setForm(undefined)
            reload()
          }}
        />
      )}
      {resetting && (
        <ResetPassword
          account={resetting}
          onClose={() => setResetting(null)}
          onSaved={() => {
            toast(`Password reset for ${resetting.name}.`)
            setResetting(null)
            reload()
          }}
        />
      )}
      {toggling && (
        <Confirm
          title={`${toggling.status === "Active" ? "Deactivate" : "Reactivate"} ${toggling.name}?`}
          message={toggling.status === "Active" ? "They'll be signed out right away and can't sign in again. Their sales records stay." : "They'll be able to sign in again with their current password."}
          confirmLabel={toggling.status === "Active" ? "Deactivate" : "Reactivate"}
          danger={toggling.status === "Active"}
          onClose={() => setToggling(null)}
          onConfirm={async () => {
            try {
              await api(`/users/${toggling.id}/status`, { method: "POST", body: { status: toggling.status === "Active" ? "Inactive" : "Active" } })
              toast(`${toggling.name} is now ${toggling.status === "Active" ? "inactive" : "active"}.`)
              reload()
            } catch (e: any) {
              toast(e.message, "danger")
            }
            setToggling(null)
          }}
        />
      )}
    </div>
  )
}
