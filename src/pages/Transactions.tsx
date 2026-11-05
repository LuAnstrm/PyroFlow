import { useEffect, useState } from "react"
import { Check, ChevronRight, Download, Printer, RotateCcw, Search, X } from "lucide-react"
import { api, downloadCsv, fmtDateTime, peso, useApp, useFetch, type PageParams, type Paged, type Sale } from "../lib"
import { Badge, Button, Card, Empty, ErrorBox, Field, FormError, FormGroup, Loading, Modal, PageIntro, Pagination, Select } from "../ui"
import { ReceiptDialog } from "./POS"

const PAGE_SIZE = 10

function SaleDialog({ saleId, onClose, onChanged }: { saleId: number; onClose: () => void; onChanged: () => void }) {
  const { isManager, toast, reloadAlerts } = useApp()
  const { data: sale, error, reload } = useFetch<Sale>(`/sales/${saleId}`)
  const [printing, setPrinting] = useState(false)
  const [refunding, setRefunding] = useState(false)
  const [reason, setReason] = useState("")
  const [formError, setFormError] = useState("")
  const [busy, setBusy] = useState(false)

  if (error) {
    return (
      <Modal title="Transaction" onClose={onClose} width={440}>
        <ErrorBox message={error} />
      </Modal>
    )
  }
  if (!sale) {
    return (
      <Modal title="Transaction" onClose={onClose} width={440}>
        <Loading />
      </Modal>
    )
  }
  if (printing) return <ReceiptDialog sale={sale} onClose={() => setPrinting(false)} />

  const refund = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setFormError("")
    try {
      await api(`/sales/${sale.id}/refund`, { method: "POST", body: { reason } })
      toast(`${sale.txnNo} refunded. Items are back in stock.`)
      setRefunding(false)
      reload()
      onChanged()
      reloadAlerts()
    } catch (err: any) {
      setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal eyebrow="TRANSACTION DETAILS" title={sale.txnNo} onClose={onClose}>
      <div className={`detail-status ${sale.status === "Refunded" ? "refunded" : ""}`}>
        <div>{sale.status === "Refunded" ? <X size={19} /> : <Check size={19} />}</div>
        <span>
          <b>{sale.status === "Refunded" ? "Refunded" : "Payment completed"}</b>
          <small>
            {fmtDateTime(sale.soldAt)} · {sale.cashier}
          </small>
        </span>
      </div>
      {sale.status === "Refunded" && sale.refundReason && <p className="form-note">Reason: {sale.refundReason}</p>}
      <div className="detail-products">
        {sale.items?.map((i) => (
          <div key={i.productId}>
            <span>
              {i.qty} × {i.name}
            </span>
            <b>{peso(i.lineTotal)}</b>
          </div>
        ))}
      </div>
      <div className="detail-lines">
        <div>
          <span>Subtotal</span>
          <b>{peso(sale.subtotal)}</b>
        </div>
        {sale.discountAmount > 0 && (
          <div>
            <span>Discount ({sale.discountPct}%)</span>
            <b>-{peso(sale.discountAmount)}</b>
          </div>
        )}
        <div>
          <span>VAT ({sale.taxRate}%)</span>
          <b>{peso(sale.taxAmount)}</b>
        </div>
        <div>
          <span>Payment</span>
          <b>
            {sale.method}
            {sale.reference ? ` · ${sale.reference}` : ""}
          </b>
        </div>
        {sale.method === "Cash" && (
          <div>
            <span>Cash / change</span>
            <b>
              {peso(sale.tendered ?? 0)} / {peso(sale.changeDue ?? 0)}
            </b>
          </div>
        )}
      </div>
      <div className="detail-total">
        <span>Total</span>
        <strong>{peso(sale.total)}</strong>
      </div>
      {refunding ? (
        <form onSubmit={refund} className="refund-form">
          <FormGroup label="Reason for refund" hint="The items go back into stock and the sale leaves your sales totals.">
            <Field value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} required autoFocus />
          </FormGroup>
          <FormError message={formError} />
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setRefunding(false)}>
              Keep sale
            </Button>
            <Button type="submit" variant="danger" disabled={busy}>
              Confirm refund
            </Button>
          </div>
        </form>
      ) : (
        <div className="modal-actions">
          {isManager && sale.status === "Completed" && (
            <Button variant="danger" className="push-left" onClick={() => setRefunding(true)}>
              <RotateCcw size={16} /> Refund
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => setPrinting(true)}>
            <Printer size={17} /> Print receipt
          </Button>
        </div>
      )}
    </Modal>
  )
}

export function Transactions({ params }: { params: PageParams }) {
  const { isManager, toast } = useApp()
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [cashier, setCashier] = useState("")
  const [method, setMethod] = useState("")
  const [status, setStatus] = useState("")
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<number | null>(params.saleId ?? null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])
  useEffect(() => setPage(1), [debounced, from, to, cashier, method, status])

  const filter = new URLSearchParams()
  if (debounced) filter.set("search", debounced)
  if (from) filter.set("from", from)
  if (to) filter.set("to", to)
  if (cashier) filter.set("cashier", cashier)
  if (method) filter.set("method", method)
  if (status) filter.set("status", status)
  const filterText = filter.toString()
  const { data, error, loading, reload } = useFetch<Paged<Sale>>(`/sales?page=${page}&size=${PAGE_SIZE}&${filterText}`)
  const cashiers = useFetch<{ id: number; name: string }[]>(isManager ? "/sales/cashiers" : null)

  const filtered = Boolean(search || from || to || cashier || method || status)
  const clear = () => {
    setSearch("")
    setFrom("")
    setTo("")
    setCashier("")
    setMethod("")
    setStatus("")
  }
  const exportCsv = async () => {
    try {
      const r = await api<Paged<Sale>>(`/sales?size=5000&${filterText}`)
      downloadCsv("transactions.csv", [
        ["Transaction", "Date", "Cashier", "Items", "Subtotal", "Discount", "VAT", "Total", "Payment", "Reference", "Status"],
        ...r.rows.map((s) => [s.txnNo, fmtDateTime(s.soldAt), s.cashier, s.units, s.subtotal, s.discountAmount, s.taxAmount, s.total, s.method, s.reference, s.status]),
      ])
    } catch (e: any) {
      toast(e.message, "danger")
    }
  }

  return (
    <div className="page-stack">
      <PageIntro eyebrow="SALES RECORDS" title="Transactions" subtitle={isManager ? "Find a sale, reprint its receipt, or process a refund." : "Your sales and their receipts."}>
        <Button variant="secondary" onClick={exportCsv}>
          <Download size={17} /> Export CSV
        </Button>
      </PageIntro>
      <Card>
        <div className="filter-bar">
          <Field icon={Search} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Transaction no.…" />
          <label className="date-filter">
            From
            <Field type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="date-filter">
            To
            <Field type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          {isManager && (
            <Select value={cashier} onChange={(e) => setCashier(e.target.value)} aria-label="Filter by cashier">
              <option value="">All cashiers</option>
              {cashiers.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
          <Select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Filter by payment method">
            <option value="">All payments</option>
            <option>Cash</option>
            <option>Online Payment</option>
            <option>Card</option>
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            <option>Completed</option>
            <option>Refunded</option>
          </Select>
          {filtered && (
            <Button variant="ghost" onClick={clear}>
              <X size={15} /> Clear
            </Button>
          )}
        </div>
        {error ? (
          <ErrorBox message={error} onRetry={reload} />
        ) : loading && !data ? (
          <Loading />
        ) : data && data.rows.length === 0 ? (
          <Empty title="No transactions found">{filtered ? "Try clearing the filters." : "Completed sales will appear here."}</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Transaction</th>
                  <th>Date &amp; time</th>
                  <th>Cashier</th>
                  <th className="num">Items</th>
                  <th>Payment</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data?.rows.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <b>{s.txnNo}</b>
                    </td>
                    <td>{fmtDateTime(s.soldAt)}</td>
                    <td>{s.cashier}</td>
                    <td className="num">{Number(s.units)}</td>
                    <td>{s.method}</td>
                    <td className="num">
                      <b>{peso(s.total)}</b>
                    </td>
                    <td>
                      <Badge tone={s.status === "Completed" ? "success" : "danger"}>{s.status}</Badge>
                    </td>
                    <td>
                      <button type="button" className="text-link" onClick={() => setSelected(s.id)}>
                        View <ChevronRight size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={page} size={PAGE_SIZE} total={data.total} onPage={setPage} label="transactions" />}
      </Card>
      {selected !== null && <SaleDialog saleId={selected} onClose={() => setSelected(null)} onChanged={reload} />}
    </div>
  )
}
