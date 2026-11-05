import { useState } from "react"
import {
  CircleDollarSign,
  LogOut,
  ReceiptText,
  RotateCcw,
  Users,
} from "lucide-react"
import {
  api,
  fmtDateTime,
  num,
  peso,
  timeAgo,
  toKey,
  useApp,
  useFetch,
  type Role,
} from "../lib"
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHead,
  Confirm,
  Empty,
  ErrorBox,
  Field,
  Loading,
  Metric,
  PageIntro,
  ROLE_TONE,
} from "../ui"

type Activity = {
  id: number
  name: string
  username: string
  role: Role
  lastLoginAt: string | null
  online: number
  signedIn: number
  orders: number
  revenue: number
  refunds: number
  refundAmount: number
  lastSaleAt: string | null
}

export function StaffOperations() {
  const { go, toast } = useApp()
  const today = toKey(new Date())
  const [date, setDate] = useState(today)
  const [ending, setEnding] = useState<Activity | null>(null)
  const { data, error, loading, reload } = useFetch<{
    date: string
    rows: Activity[]
  }>(`/staff/activity?date=${date}`)

  const rows = data?.rows ?? []
  const revenue = rows.reduce((sum, r) => sum + r.revenue, 0)
  const orders = rows.reduce((sum, r) => sum + r.orders, 0)
  const refunds = rows.reduce((sum, r) => sum + r.refunds, 0)
  const isToday = date === today

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="TEAM"
        title="Staff operations"
        subtitle="See how each cashier's day is going, check their sales, and end a shift."
      >
        <label className="date-filter">
          Day
          <Field
            type="date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </label>
      </PageIntro>
      {error && !data ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Loading />
      ) : (
        <>
          <div className="metrics-grid">
            <Metric
              icon={CircleDollarSign}
              label={isToday ? "Sales today" : "Sales that day"}
              value={peso(revenue)}
              note="Completed sales, including VAT"
            />
            <Metric
              icon={ReceiptText}
              label="Transactions"
              value={num(orders)}
              note="Completed sales"
              tone="blue"
            />
            <Metric
              icon={RotateCcw}
              label="Refunded"
              value={num(refunds)}
              note="Sales later refunded"
              tone="red"
            />
            <Metric
              icon={Users}
              label="Using the POS now"
              value={num(rows.filter((r) => r.online).length)}
              note="Active in the last 5 minutes"
              tone="green"
            />
          </div>
          <Card>
            <CardHead
              title="Cashier activity"
              subtitle="Active Staff accounts, plus anyone else who sold that day"
            />
            {rows.length === 0 ? (
              <Empty title="No staff activity to show" />
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Person</th>
                      <th>Status</th>
                      <th className="num">Transactions</th>
                      <th className="num">Sales</th>
                      <th className="num">Refunded</th>
                      <th>Last sale</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <div className="table-product">
                            <Avatar name={r.name} />
                            <span>
                              <b>{r.name}</b>
                              <small>@{r.username}</small>
                            </span>
                          </div>
                        </td>
                        <td>
                          {r.online ? (
                            <span className="online-dot">Online now</span>
                          ) : r.signedIn ? (
                            <Badge tone="success">Signed in</Badge>
                          ) : (
                            <Badge tone="neutral">Signed out</Badge>
                          )}
                          {r.role !== "Staff" && (
                            <small className="cell-sub">
                              <Badge tone={ROLE_TONE[r.role]}>{r.role}</Badge>
                            </small>
                          )}
                        </td>
                        <td className="num">{num(r.orders)}</td>
                        <td className="num">
                          <b>{peso(r.revenue)}</b>
                        </td>
                        <td className="num">
                          {r.refunds > 0 ? (
                            <>
                              {num(r.refunds)}
                              <small className="cell-sub">
                                {peso(r.refundAmount)}
                              </small>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td
                          title={
                            r.lastSaleAt ? fmtDateTime(r.lastSaleAt) : undefined
                          }
                        >
                          {r.lastSaleAt ? timeAgo(r.lastSaleAt) : "No sales"}
                        </td>
                        <td>
                          <div className="row-actions">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                go("transactions", { cashier: r.id, date })
                              }
                            >
                              <ReceiptText size={15} /> Sales
                            </Button>
                            {r.role === "Staff" && r.signedIn > 0 && (
                              <button
                                type="button"
                                title="End shift"
                                aria-label={`End shift for ${r.name}`}
                                onClick={() => setEnding(r)}
                              >
                                <LogOut size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
      {ending && (
        <Confirm
          title={`End ${ending.name}'s shift?`}
          message="They'll be signed out on every device and any unfinished cart will be lost. They can sign in again when they're back."
          confirmLabel="End shift"
          danger
          onClose={() => setEnding(null)}
          onConfirm={async () => {
            try {
              await api(`/staff/${ending.id}/end-shift`, { method: "POST" })
              toast(`${ending.name} has been signed out.`)
              reload()
            } catch (e: any) {
              toast(e.message, "danger")
            }
            setEnding(null)
          }}
        />
      )}
    </div>
  )
}
