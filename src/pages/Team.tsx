import { useState } from "react"
import { Check, CircleCheck, CircleX, Copy, Download, KeyRound, Pencil, Plus, Power, Search, ShieldCheck, Trash2, UserCheck, UserMinus, UserPlus, Users, Wifi } from "lucide-react"
import { api, downloadCsv, fmtDate, fmtDateTime, timeAgo, useApp, useFetch, type PageParams, type Paged, type Permission } from "../lib"
import { Avatar, Badge, Button, Card, Confirm, Empty, ErrorBox, Field, FormError, FormGroup, Loading, Metric, Modal, PageIntro, Pagination, RoleBadge, Select } from "../ui"

type Member = {
  id: number
  name: string
  username: string
  roleId: number
  role: string
  isOwner: boolean
  status: "Active" | "Inactive"
  createdAt: string
  joinedAt: string | null
  lastLoginAt: string | null
  online: number
  loginCount: number
}
type Role = { id: number; name: string; description: string | null; isOwner: boolean; members: number; permissions: Permission[] }
type CatalogItem = { key: Permission; group: string; label: string; help: string }
type RoleData = { roles: Role[]; catalog: CatalogItem[] }
type Invite = { id: number; code: string; roleId: number; role: string; createdAt: string; expiresAt: string | null; maxUses: number | null; uses: number; active: boolean; createdBy: string; state: "Active" | "Expired" | "Used up" | "Turned off" }
type LoginLog = { id: number; username: string; success: number; reason: string | null; ip: string | null; device: string | null; loginAt: string; logoutAt: string | null; name: string | null; role: string | null; isOwner: number | null; active: number }
type Tab = "members" | "roles" | "invites" | "logins"

/** Codes are shown exactly as people type them. */
const showCode = (code: string) => code

function useCopy() {
  const { toast } = useApp()
  return (code: string) =>
    navigator.clipboard
      .writeText(code)
      .then(() => toast(`Copied ${showCode(code)}.`))
      .catch(() => toast("Couldn't copy. Select the code and copy it yourself.", "warning"))
}

// --- Members ---------------------------------------------------------------------

function ChangeRole({ member, roles, onClose, onSaved }: { member: Member; roles: Role[]; onClose: () => void; onSaved: () => void }) {
  const [roleId, setRoleId] = useState(String(member.roleId))
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const chosen = roles.find((r) => String(r.id) === roleId)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api(`/users/${member.id}/role`, { method: "PUT", body: { roleId: Number(roleId) } })
      onSaved()
    } catch (err: any) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <Modal eyebrow="CHANGE ROLE" title={member.name} onClose={onClose} width={460}>
      <form onSubmit={submit}>
        <FormGroup label="Role" hint={chosen?.isOwner ? "Owners have full access, including the team, settings and security." : chosen?.description ?? undefined}>
          <Select value={roleId} onChange={(e) => setRoleId(e.target.value)} autoFocus>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </FormGroup>
        <p className="form-note">The change applies the next time they open a page. They don't need to sign in again.</p>
        <FormError message={error} />
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || roleId === String(member.roleId)}>
            <Check size={17} /> Save role
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function ResetPassword({ member, onClose, onSaved }: { member: Member; onClose: () => void; onSaved: () => void }) {
  const { settings } = useApp()
  const passwordMin = Number(settings.security_password_min) || 8
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api(`/users/${member.id}/password`, { method: "POST", body: { password } })
      onSaved()
    } catch (err: any) {
      setError(err.message)
    }
  }
  return (
    <Modal eyebrow="RESET PASSWORD" title={member.name} onClose={onClose} width={440}>
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

function Members({ members, roles, reload, onInvite }: { members: Member[]; roles: Role[]; reload: () => void; onInvite: () => void }) {
  const { user, toast } = useApp()
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("")
  const [changing, setChanging] = useState<Member | null>(null)
  const [resetting, setResetting] = useState<Member | null>(null)
  const [toggling, setToggling] = useState<Member | null>(null)
  const [removing, setRemoving] = useState<Member | null>(null)
  const q = search.trim().toLowerCase()
  const shown = members.filter((u) => (!q || u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)) && (!roleFilter || String(u.roleId) === roleFilter))

  const act = async (fn: () => Promise<unknown>, message: string) => {
    try {
      await fn()
      toast(message)
      reload()
    } catch (e: any) {
      toast(e.message, "danger")
    }
  }

  return (
    <Card>
      <div className="table-toolbar">
        <div>
          <Field icon={Search} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or username…" />
          <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role">
            <option value="">All roles</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="secondary" onClick={onInvite}>
          <UserPlus size={16} /> Invite someone
        </Button>
      </div>
      {shown.length === 0 ? (
        <Empty title="No team members match" />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Last login</th>
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
                      <RoleBadge role={u.role} isOwner={u.isOwner} />
                    </td>
                    <td>{u.online ? <span className="online-dot">Online now</span> : <Badge tone={u.status === "Active" ? "success" : "neutral"}>{u.status}</Badge>}</td>
                    <td>{u.joinedAt ? fmtDate(u.joinedAt) : "—"}</td>
                    <td>{u.lastLoginAt ? timeAgo(u.lastLoginAt) : "Never"}</td>
                    <td>
                      <div className="row-actions">
                        {!self && (
                          <button type="button" title="Change role" aria-label={`Change role for ${u.name}`} onClick={() => setChanging(u)}>
                            <Pencil size={16} />
                          </button>
                        )}
                        <button type="button" title="Reset password" aria-label={`Reset password for ${u.name}`} onClick={() => setResetting(u)}>
                          <KeyRound size={16} />
                        </button>
                        {!self && (
                          <>
                            <button type="button" title={u.status === "Active" ? "Deactivate" : "Reactivate"} aria-label={`${u.status === "Active" ? "Deactivate" : "Reactivate"} ${u.name}`} onClick={() => setToggling(u)}>
                              <Power size={16} />
                            </button>
                            <button type="button" title="Remove from shop" aria-label={`Remove ${u.name} from the shop`} onClick={() => setRemoving(u)}>
                              <UserMinus size={16} />
                            </button>
                          </>
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
      {changing && (
        <ChangeRole
          member={changing}
          roles={roles}
          onClose={() => setChanging(null)}
          onSaved={() => {
            toast(`${changing.name}'s role was changed.`)
            setChanging(null)
            reload()
          }}
        />
      )}
      {resetting && (
        <ResetPassword
          member={resetting}
          onClose={() => setResetting(null)}
          onSaved={() => {
            toast(`Password reset for ${resetting.name}.`)
            setResetting(null)
          }}
        />
      )}
      {toggling && (
        <Confirm
          title={`${toggling.status === "Active" ? "Deactivate" : "Reactivate"} ${toggling.name}?`}
          message={toggling.status === "Active" ? "They'll be signed out right away and can't sign in until you reactivate them. Their sales records stay." : "They'll be able to sign in again with their current password."}
          confirmLabel={toggling.status === "Active" ? "Deactivate" : "Reactivate"}
          danger={toggling.status === "Active"}
          onClose={() => setToggling(null)}
          onConfirm={async () => {
            const next = toggling.status === "Active" ? "Inactive" : "Active"
            await act(() => api(`/users/${toggling.id}/status`, { method: "POST", body: { status: next } }), `${toggling.name} is now ${next.toLowerCase()}.`)
            setToggling(null)
          }}
        />
      )}
      {removing && (
        <Confirm
          title={`Remove ${removing.name} from the shop?`}
          message="They're signed out and lose access to everything in the shop. Their account and past sales stay, and they can come back later with a new invite code."
          confirmLabel="Remove from shop"
          danger
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await act(() => api(`/users/${removing.id}/remove`, { method: "POST" }), `${removing.name} was removed from the shop.`)
            setRemoving(null)
          }}
        />
      )}
    </Card>
  )
}

// --- Roles ------------------------------------------------------------------------

function RoleForm({ role, catalog, onClose, onSaved }: { role: Role | null; catalog: CatalogItem[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(role?.name ?? "")
  const [description, setDescription] = useState(role?.description ?? "")
  const [chosen, setChosen] = useState<Permission[]>(role?.permissions ?? ["sales.process"])
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const groups = [...new Set(catalog.map((p) => p.group))]
  const toggle = (key: Permission, on: boolean) => setChosen((c) => (on ? [...c, key] : c.filter((k) => k !== key)))
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError("")
    try {
      const body = { name, description, permissions: chosen }
      if (role) await api(`/roles/${role.id}`, { method: "PUT", body })
      else await api("/roles", { method: "POST", body })
      onSaved()
    } catch (err: any) {
      setError(err.message)
      setBusy(false)
    }
  }
  const sells = chosen.includes("sales.process")
  const stocks = chosen.includes("inventory.manage") || chosen.includes("products.edit")
  return (
    <Modal eyebrow={role ? "EDIT ROLE" : "NEW ROLE"} title={role ? role.name : "Create a role"} onClose={onClose} width={640}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <FormGroup label="Role name">
            <Field value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Cashier" required autoFocus />
          </FormGroup>
          <FormGroup label="Description (optional)">
            <Field value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="What this person does" />
          </FormGroup>
        </div>
        <p className="role-summary">
          {sells && stocks ? "This role can sell and change inventory." : sells ? "This role can sell but can't change inventory." : stocks ? "This role can change inventory but can't sell." : "Choose what this role can open and do."}
        </p>
        <div className="permission-picker">
          {groups.map((group) => (
            <fieldset key={group}>
              <legend>{group}</legend>
              {catalog
                .filter((p) => p.group === group)
                .map((p) => (
                  <label className="permission-option" key={p.key}>
                    <input type="checkbox" checked={chosen.includes(p.key)} onChange={(e) => toggle(p.key, e.target.checked)} />
                    <span>
                      <b>{p.label}</b>
                      <small>{p.help}</small>
                    </span>
                  </label>
                ))}
            </fieldset>
          ))}
        </div>
        <FormError message={error} />
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            <Check size={17} /> {role ? "Save role" : "Create role"}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function Roles({ data, reload }: { data: RoleData; reload: () => void }) {
  const { toast } = useApp()
  const [form, setForm] = useState<Role | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<Role | null>(null)
  const label = (key: Permission) => data.catalog.find((p) => p.key === key)?.label ?? key
  return (
    <>
      <div className="section-head">
        <p>Each person gets one role. Tick only what that job needs: a cashier can sell without touching stock, and an inventory clerk can count stock without selling.</p>
        <Button onClick={() => setForm(null)}>
          <Plus size={17} /> New role
        </Button>
      </div>
      <div className="role-grid">
        {data.roles.map((r) => (
          <Card key={r.id} className="role-card">
            <div className="role-card-head">
              <div>
                <RoleBadge role={r.name} isOwner={r.isOwner} />
                <small>
                  {r.members} {r.members === 1 ? "person" : "people"}
                </small>
              </div>
              {!r.isOwner && (
                <div className="row-actions">
                  <button type="button" title="Edit role" aria-label={`Edit ${r.name}`} onClick={() => setForm(r)}>
                    <Pencil size={16} />
                  </button>
                  <button type="button" title={r.members ? "Move its people to another role first" : "Delete role"} aria-label={`Delete ${r.name}`} disabled={r.members > 0} onClick={() => setDeleting(r)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
            {r.description && <p className="role-desc">{r.description}</p>}
            {r.isOwner ? (
              <p className="role-all">
                <ShieldCheck size={15} /> Everything, plus the team, roles, invite codes, settings and security
              </p>
            ) : r.permissions.length ? (
              <ul className="role-perms">
                {r.permissions.map((k) => (
                  <li key={k}>
                    <Check size={13} /> {label(k)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="role-desc">No permissions yet. People with this role only see the dashboard.</p>
            )}
          </Card>
        ))}
      </div>
      {form !== undefined && (
        <RoleForm
          role={form}
          catalog={data.catalog}
          onClose={() => setForm(undefined)}
          onSaved={() => {
            toast(form ? "Role saved. It applies right away." : "Role created.")
            setForm(undefined)
            reload()
          }}
        />
      )}
      {deleting && (
        <Confirm
          title={`Delete the ${deleting.name} role?`}
          message="Its invite codes stop working too. This can't be undone."
          confirmLabel="Delete role"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await api(`/roles/${deleting.id}`, { method: "DELETE" })
              toast(`${deleting.name} was deleted.`)
              reload()
            } catch (e: any) {
              toast(e.message, "danger")
            }
            setDeleting(null)
          }}
        />
      )}
    </>
  )
}

// --- Invite codes -------------------------------------------------------------------

function NewInvite({ roles, onClose, onCreated }: { roles: Role[]; onClose: () => void; onCreated: (code: string, role: string) => void }) {
  const firstRole = roles.find((r) => !r.isOwner) ?? roles[0]
  const [roleId, setRoleId] = useState(String(firstRole?.id ?? ""))
  const [days, setDays] = useState("7")
  const [maxUses, setMaxUses] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const role = roles.find((r) => String(r.id) === roleId)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError("")
    try {
      const r = await api<{ code: string }>("/invites", { method: "POST", body: { roleId: Number(roleId), days: days || null, maxUses: maxUses || null } })
      onCreated(r.code, role?.name ?? "")
    } catch (err: any) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <Modal eyebrow="INVITE CODE" title="Make an invite code" onClose={onClose} width={480}>
      <form onSubmit={submit}>
        <FormGroup label="Role they get" hint={role?.isOwner ? "An Owner code works once, for one day." : role?.description ?? undefined}>
          <Select value={roleId} onChange={(e) => setRoleId(e.target.value)} autoFocus>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </FormGroup>
        {!role?.isOwner && (
          <div className="form-grid">
            <FormGroup label="Works for">
              <Select value={days} onChange={(e) => setDays(e.target.value)}>
                <option value="1">1 day</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="">Until I turn it off</option>
              </Select>
            </FormGroup>
            <FormGroup label="How many people">
              <Select value={maxUses} onChange={(e) => setMaxUses(e.target.value)}>
                <option value="1">Just 1 person</option>
                <option value="5">Up to 5</option>
                <option value="20">Up to 20</option>
                <option value="">No limit</option>
              </Select>
            </FormGroup>
          </div>
        )}
        <FormError message={error} />
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !roleId}>
            <KeyRound size={17} /> Make code
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function CodeCreated({ code, role, onClose }: { code: string; role: string; onClose: () => void }) {
  const copy = useCopy()
  return (
    <Modal eyebrow="INVITE CODE READY" title={`Code for ${role}`} onClose={onClose} width={460}>
      <div className="code-display">{showCode(code)}</div>
      <ol className="code-steps">
        <li>Give this code to the person, by text or in person.</li>
        <li>
          They open the POS and choose <b>Create an account</b>, or sign in if they already have one.
        </li>
        <li>They type the code, and they're in as {role}.</li>
      </ol>
      <div className="modal-actions">
        <Button variant="secondary" onClick={() => copy(code)}>
          <Copy size={16} /> Copy code
        </Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  )
}

function Invites({ roles, creating, setCreating }: { roles: Role[]; creating: boolean; setCreating: (v: boolean) => void }) {
  const { toast } = useApp()
  const copy = useCopy()
  const { data, error, loading, reload } = useFetch<Invite[]>("/invites")
  const [created, setCreated] = useState<{ code: string; role: string } | null>(null)
  const [disabling, setDisabling] = useState<Invite | null>(null)
  const STATE_TONE = { Active: "success", Expired: "neutral", "Used up": "neutral", "Turned off": "neutral" } as const
  return (
    <>
      <div className="section-head">
        <p>Like a classroom code: people make their own account, then type the code to join the shop. The code decides their role.</p>
        <Button onClick={() => setCreating(true)}>
          <Plus size={17} /> New invite code
        </Button>
      </div>
      <Card>
        {error ? (
          <ErrorBox message={error} onRetry={reload} />
        ) : loading && !data ? (
          <Loading />
        ) : !data?.length ? (
          <Empty title="No invite codes yet">Make one for each role you're hiring for.</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Role</th>
                  <th>Used</th>
                  <th>Works until</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((i) => (
                  <tr key={i.id} className={i.state === "Active" ? "" : "row-muted"}>
                    <td>
                      <span className="code-chip">{showCode(i.code)}</span>
                      <small className="cell-sub">
                        Made {fmtDate(i.createdAt)} by {i.createdBy}
                      </small>
                    </td>
                    <td>
                      <RoleBadge role={i.role} />
                    </td>
                    <td>
                      {i.uses}
                      {i.maxUses !== null ? ` of ${i.maxUses}` : ""} joined
                    </td>
                    <td>{i.expiresAt ? fmtDateTime(i.expiresAt) : "Until turned off"}</td>
                    <td>
                      <Badge tone={STATE_TONE[i.state]}>{i.state}</Badge>
                    </td>
                    <td>
                      {i.state === "Active" && (
                        <div className="row-actions">
                          <button type="button" title="Copy code" aria-label={`Copy code ${i.code}`} onClick={() => copy(i.code)}>
                            <Copy size={16} />
                          </button>
                          <button type="button" title="Turn off" aria-label={`Turn off code ${i.code}`} onClick={() => setDisabling(i)}>
                            <Power size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {creating && (
        <NewInvite
          roles={roles}
          onClose={() => setCreating(false)}
          onCreated={(code, role) => {
            setCreating(false)
            setCreated({ code, role })
            reload()
          }}
        />
      )}
      {created && <CodeCreated code={created.code} role={created.role} onClose={() => setCreated(null)} />}
      {disabling && (
        <Confirm
          title={`Turn off ${showCode(disabling.code)}?`}
          message="Nobody else can join with it. People who already joined keep their access."
          confirmLabel="Turn off code"
          danger
          onClose={() => setDisabling(null)}
          onConfirm={async () => {
            try {
              await api(`/invites/${disabling.id}/disable`, { method: "POST" })
              toast("Invite code turned off.")
              reload()
            } catch (e: any) {
              toast(e.message, "danger")
            }
            setDisabling(null)
          }}
        />
      )}
    </>
  )
}

// --- Login history -----------------------------------------------------------------

function LoginHistory({ users }: { users: Member[] }) {
  const { toast } = useApp()
  const [userId, setUserId] = useState("")
  const [result, setResult] = useState("")
  const [page, setPage] = useState(1)
  const filter = `${userId ? `&user=${userId}` : ""}${result ? `&result=${result}` : ""}`
  const { data, error, loading, reload } = useFetch<Paged<LoginLog>>(`/login-logs?page=${page}&size=12${filter}`)
  const exportCsv = async () => {
    try {
      const r = await api<Paged<LoginLog>>(`/login-logs?size=5000${filter}`)
      downloadCsv("login-history.csv", [["Signed in", "Signed out", "Name", "Username", "Role", "Result", "Device", "IP"], ...r.rows.map((l) => [fmtDateTime(l.loginAt), l.logoutAt ? fmtDateTime(l.logoutAt) : "", l.name, l.username, l.role, l.success ? l.reason ?? "Success" : l.reason, l.device, l.ip])])
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
                  <td>{l.role ? <RoleBadge role={l.role} isOwner={Boolean(l.isOwner)} /> : "—"}</td>
                  <td>
                    {l.success ? (
                      <span className="result ok">
                        <CircleCheck size={15} /> {l.reason ?? "Success"}
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

// --- Page --------------------------------------------------------------------------

export function Team({ params }: { params: PageParams }) {
  const members = useFetch<Member[]>("/users")
  const roles = useFetch<RoleData>("/roles")
  const tabs: Tab[] = ["members", "roles", "invites", "logins"]
  const [tab, setTab] = useState<Tab>(tabs.includes(params.tab as Tab) ? (params.tab as Tab) : "members")
  const [creatingInvite, setCreatingInvite] = useState(false)

  if ((members.loading && !members.data) || (roles.loading && !roles.data)) return <Loading />
  if (members.error && !members.data) return <ErrorBox message={members.error} onRetry={members.reload} />
  if (roles.error && !roles.data) return <ErrorBox message={roles.error} onRetry={roles.reload} />
  const all = members.data ?? []
  const roleData = roles.data!
  const reloadBoth = () => {
    members.reload()
    roles.reload()
  }
  const invite = () => {
    setTab("invites")
    setCreatingInvite(true)
  }

  return (
    <div className="page-stack">
      <PageIntro eyebrow="OWNER ONLY" title="Team & roles" subtitle="Invite your staff with a code, give each person a role, and choose what every role can do.">
        <Button onClick={invite}>
          <UserPlus size={17} /> Invite someone
        </Button>
      </PageIntro>
      <div className="metrics-grid">
        <Metric icon={Users} label="Team members" value={String(all.length)} note={`${roleData.roles.length} roles`} tone="blue" />
        <Metric icon={UserCheck} label="Active" value={String(all.filter((u) => u.status === "Active").length)} note="Can sign in" tone="green" />
        <Metric icon={Wifi} label="Using the POS now" value={String(all.filter((u) => u.online).length)} note="Active in the last 5 minutes" />
        <Metric icon={ShieldCheck} label="Inactive" value={String(all.filter((u) => u.status === "Inactive").length)} note="Blocked from signing in" tone="red" />
      </div>
      <div className="segmented tabs">
        {(
          [
            ["members", "Members"],
            ["roles", "Roles & permissions"],
            ["invites", "Invite codes"],
            ["logins", "Login history"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button type="button" key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "members" && <Members members={all} roles={roleData.roles} reload={reloadBoth} onInvite={invite} />}
      {tab === "roles" && <Roles data={roleData} reload={reloadBoth} />}
      {tab === "invites" && <Invites roles={roleData.roles} creating={creatingInvite} setCreating={setCreatingInvite} />}
      {tab === "logins" && <LoginHistory users={all} />}
    </div>
  )
}
