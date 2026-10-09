import { useState, useEffect, useCallback } from "react";
import "./styles.css";

// A service not completed by CUTOFF_HOUR (24-hour clock) on its scheduled day is flagged "under maintenance".
// Set AUTO_MARK to false to flag services only when someone presses "Start maintenance".
const AUTO_MARK = true;
const CUTOFF_HOUR = 17;
const CUTOFF_LABEL = new Date(2000, 0, 1, CUTOFF_HOUR).toLocaleTimeString("en-US", { hour: "numeric" });

const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
let today = ymd(new Date());
const addMo = (s, n) => { const [y, m, d] = s.split("-").map(Number); return ymd(new Date(y, m - 1 + n, d)); };
// A service not completed by its scheduled date is "under maintenance", counted from that date.
const pastCutoff = () => new Date().getHours() >= CUTOFF_HOUR;
const autoMaint = j => AUTO_MARK && !j.done && (j.date < today || (j.date === today && pastCutoff()));
const underMaint = j => !j.done && (!!j.maint_started || autoMaint(j));
const startOf = j => j.maint_started || j.date;
const onDay = (j, s) => j.date === s || (underMaint(j) && s >= startOf(j) && s <= today);
const daysSince = d => Math.max(0, Math.round((new Date(today) - new Date(d)) / 864e5));
const sinceText = j => { const n = daysSince(startOf(j)); return `Started ${fmtDate(startOf(j))} · ${n === 0 ? "today" : `${n} day${n === 1 ? "" : "s"} so far`}`; };
const fmtDate = d => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const maintOf = (J, vid) => J.filter(j => underMaint(j) && j.vehicle_id === vid).sort((a, b) => startOf(a).localeCompare(startOf(b)))[0];
const dueDate = v => addMo(v.last_date, v.interval_mo);
const kmLeft = v => v.last_odo + v.interval_km - v.odo;
function status(v) {
  const days = (new Date(dueDate(v)) - new Date(today)) / 864e5, k = kmLeft(v);
  if (days < 0 || k <= 0) return ["Overdue", "bad"];
  if (days <= 14 || k <= 500) return ["Due soon", "warn"];
  return ["OK", "ok"];
}
let token = localStorage.getItem("t");
async function api(path, method = "GET", body) {
  const r = await fetch("/api" + path, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
  });
  if (r.status === 401) { localStorage.removeItem("t"); location.reload(); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { alert(d.detail || "Something went wrong"); throw new Error(d.detail); }
  return d;
}

function Login() {
  const [u, setU] = useState(""), [p, setP] = useState(""), [err, setErr] = useState("");
  async function go(e) {
    e.preventDefault();
    const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: p }) });
    const d = await r.json();
    if (!r.ok) return setErr(d.detail || "Login failed");
    localStorage.setItem("t", d.token); location.reload();
  }
  return (
    <div className="wrap" style={{ maxWidth: 380 }}>
      <h1>Fleet PMS Manager</h1>
      <form className="card row" onSubmit={go} style={{ flexDirection: "column", alignItems: "stretch" }}>
        <label>Username<input value={u} onChange={e => setU(e.target.value)} autoFocus /></label>
        <label>Password<input type="password" value={p} onChange={e => setP(e.target.value)} /></label>
        {err && <div className="bad">{err}</div>}
        <button className="btn pri">Sign in</button>
      </form>
    </div>
  );
}

function Calendar({ V, P, J, run, launch, clear }) {
  const [cur, setCur] = useState(new Date()), [sel, setSel] = useState(today);
  const [f, setF] = useState({ vehicle_id: "", kind: "pms", note: "" });
  useEffect(() => {   // opened from a Home quick action
    if (launch === "schedule" || launch === "repair") {
      setCur(new Date()); setSel(today); setF(x => ({ ...x, kind: launch === "repair" ? "repair" : "pms" })); clear();
    }
  }, [launch]);
  const y = cur.getFullYear(), m = cur.getMonth(), start = new Date(y, m, 1 - new Date(y, m, 1).getDay());
  const plate = id => V.find(v => v.id === id)?.plate || "?";
  const pending = v => J.some(j => j.kind !== "repair" && j.vehicle_id === v.id && !j.done && j.date >= v.last_date);
  const cells = [...Array(42)].map((_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), s = ymd(d);
    const chips = [
      ...J.filter(j => onDay(j, s)).map(j => ({ k: "j" + j.id, c: underMaint(j) ? "c-under" : j.done ? "c-done" : "c-job", t: (j.kind === "repair" ? "Repair " : "") + plate(j.vehicle_id) })),
      ...V.filter(v => dueDate(v) === s && !pending(v)).map(v => ({ k: "d" + v.id, c: "c-due", t: "Due " + v.plate })),
    ];
    return (
      <div key={s} className={`day ${d.getMonth() !== m ? "out" : ""} ${s === today ? "today" : ""} ${s === sel ? "sel" : ""}`} onClick={() => setSel(s)}>
        <b className="small">{d.getDate()}</b>
        {chips.slice(0, 2).map(c => <div key={c.k} className={"chip " + c.c}>{c.t}</div>)}
        {chips.length > 2 && <div className="mut small">+{chips.length - 2} more</div>}
      </div>
    );
  });
  const dayJobs = J.filter(j => onDay(j, sel));
  const dueThatDay = V.filter(v => dueDate(v) === sel && !pending(v));
  const prettyDay = sel && new Date(sel + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const add = () => {
    const vid = +(f.vehicle_id || V[0]?.id);
    if (vid) run(() => api("/jobs", "POST", { vehicle_id: vid, date: sel, note: f.note, kind: f.kind }));
  };
  return (
    <div className="cal-layout">
      <div className="card">
        <div className="nav">
          <button className="btn sm" onClick={() => setCur(new Date(y, m - 1, 1))} aria-label="Previous month">◀</button>
          <h2 style={{ margin: 0 }}>{cur.toLocaleString("en", { month: "long", year: "numeric" })}</h2>
          <button className="btn sm" onClick={() => setCur(new Date(y, m + 1, 1))} aria-label="Next month">▶</button>
        </div>
        <div className="cal">{"SMTWTFS".split("").map((d, i) => <div key={i} className="dow">{d}</div>)}{cells}</div>
        <p className="mut small">Amber: PMS due. Blue: scheduled. Green: done. Purple: under maintenance ({AUTO_MARK ? `started, or not finished by ${CUTOFF_LABEL} on its day` : "started"}).</p>
      </div>
      <div className="card side-panel">
        {sel ? (
          <>
            <h2>{prettyDay}{sel === today && <span className="badge" style={{ marginLeft: 8 }}>Today</span>}</h2>
            {dueThatDay.map(v => <p key={v.id} className="warn" style={{ margin: "0 0 6px" }}>PMS due: {v.plate}{v.model ? ` (${v.model})` : ""}</p>)}
            {dayJobs.length ? dayJobs.map(j => (
              <div className="job" key={j.id}>
                <div className="job-main">
                  <b>{plate(j.vehicle_id)}</b> <span className="badge">{j.kind === "repair" ? "Repair" : "PMS"}</span>
                  {j.done && <span className="badge ok" style={{ marginLeft: 6 }}>Done</span>}
                  {underMaint(j) && <span className="badge maint" style={{ marginLeft: 6 }}>Under maintenance</span>}
                  {underMaint(j) && <div className="job-note">{sinceText(j)}</div>}
                  {j.note && <div className="job-note">{j.note}</div>}
                </div>
                <div className="job-act">
                  {!j.done && !underMaint(j) && <button className="btn sm" onClick={() => run(() => api(`/jobs/${j.id}/maintenance`, "POST", { date: today }))}>Start maintenance</button>}
                  {!j.done && j.maint_started && <button className="btn sm" onClick={() => run(() => api(`/jobs/${j.id}/maintenance`, "POST", { date: null }))}>Undo start</button>}
                  {!j.done && <button className="btn sm pri" onClick={() => run(() => api(`/jobs/${j.id}/complete`, "POST"))}>Complete</button>}
                  <button className="btn sm red" onClick={() => run(() => api(`/jobs/${j.id}`, "DELETE"))}>Delete</button>
                </div>
              </div>
            )) : <p className="mut">No services scheduled for this day.</p>}
            <h2 style={{ marginTop: 14 }}>Schedule service</h2>
            <div className="stack">
              <label>Vehicle<select value={f.vehicle_id} onChange={e => setF({ ...f, vehicle_id: e.target.value })}>{V.map(v => <option key={v.id} value={v.id}>{v.plate} – {v.model}</option>)}</select></label>
              <label>Type<select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}><option value="pms">PMS</option><option value="repair">Repair / other</option></select></label>
              <label>Notes<input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></label>
              <button className="btn pri" onClick={add}>Schedule</button>
            </div>
          </>
        ) : <p className="mut">Select a day to schedule a service or see its details.</p>}
      </div>
    </div>
  );
}

function Vehicles({ V, J, run, admin, launch, clear }) {
  const blank = { plate: "", model: "", odo: 0, interval_km: 5000, interval_mo: 6, last_date: today };
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => { if (launch === "addVehicle") { setOpen(true); clear(); } }, [launch]);
  const [f, setF] = useState(blank);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const term = q.trim().toLowerCase();
  const shown = V.filter(v => v.plate.toLowerCase().includes(term) || (v.model || "").toLowerCase().includes(term));
  useEffect(() => {
    if (!open) return;
    const onKey = e => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const add = async e => {
    e.preventDefault();
    if (!f.plate.trim()) return;
    await run(() => api("/vehicles", "POST", { ...f, plate: f.plate.trim(), odo: +f.odo || 0, last_odo: +f.odo || 0, interval_km: +f.interval_km || 5000, interval_mo: +f.interval_mo || 6 }));
    setF(blank);
    setOpen(false);
  };
  return (
    <>
      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <input className="search" type="search" placeholder="Search plate or model" value={q} onChange={e => setQ(e.target.value)} aria-label="Search plate or model" />
          <button className="btn pri" onClick={() => setOpen(true)}>Add vehicle</button>
        </div>
        <h2>Vehicles</h2>
        <div className="scroll"><table>
          <thead><tr><th>Plate</th><th>Model</th><th>Odometer</th><th>Last PMS</th><th>Next due</th><th>KM left</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {shown.map(v => { const [t, c] = status(v); return (
              <tr key={v.id}><td>{v.plate}</td><td>{v.model}</td>
                <td><input type="number" style={{ width: 90 }} defaultValue={v.odo} key={v.id + "-" + v.odo}
                  onBlur={e => +e.target.value !== v.odo && run(() => api(`/vehicles/${v.id}/odo`, "PATCH", { value: +e.target.value || 0 }))} /></td>
                <td>{v.last_date}</td><td>{dueDate(v)}</td><td>{kmLeft(v)} km</td><td><span className={"badge " + c}>{t}</span>{(() => { const m = maintOf(J, v.id); return m && <div style={{ marginTop: 4 }}><span className="badge maint">Under maintenance</span><div className="small mut">since {fmtDate(startOf(m))}</div></div>; })()}</td>
                <td>{admin && <button className="btn sm red" onClick={() => confirm("Delete this vehicle and its jobs?") && run(() => api(`/vehicles/${v.id}`, "DELETE"))}>Delete</button>}</td></tr>); })}
            {!shown.length && <tr><td colSpan="8" className="mut">{V.length ? "No vehicles match your search." : "No vehicles yet. Select Add vehicle to create one."}</td></tr>}
          </tbody>
        </table></div>
      </div>
      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <form className="card modal" onClick={e => e.stopPropagation()} onSubmit={add}>
            <h2>Add vehicle</h2>
            <label>Plate<input value={f.plate} onChange={set("plate")} autoFocus /></label>
            <label>Model<input value={f.model} onChange={set("model")} /></label>
            <label>Odometer (km)<input type="number" min="0" value={f.odo} onChange={set("odo")} /></label>
            <label>PMS every (km)<input type="number" min="1" value={f.interval_km} onChange={set("interval_km")} /></label>
            <label>PMS every (months)<input type="number" min="1" value={f.interval_mo} onChange={set("interval_mo")} /></label>
            <label>Last PMS date<input type="date" value={f.last_date} onChange={set("last_date")} /></label>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn pri">Add vehicle</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function StockAdjust({ p, run }) {
  const [n, setN] = useState("1");
  const apply = sign => {
    const amt = Math.floor(+n);
    if (!(amt > 0)) return;
    run(() => api(`/parts/${p.id}/qty`, "PATCH", { value: Math.max(0, p.qty + sign * amt) }));
  };
  return (
    <div className="row" style={{ alignItems: "center", flexWrap: "nowrap" }}>
      <button className="btn sm" onClick={() => apply(-1)} aria-label="Remove from stock">−</button>
      <input type="number" min="1" value={n} style={{ width: 70, textAlign: "center" }} onChange={e => setN(e.target.value)} />
      <button className="btn sm" onClick={() => apply(1)} aria-label="Add to stock">+</button>
    </div>
  );
}

const CATEGORIES = ["Property & Equipment", "Consumables", "Supplies"];

function Inventory({ P, run, admin, launch, clear }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [open, setOpen] = useState(false);
  useEffect(() => { if (launch === "addItem") { setOpen(true); clear(); } }, [launch]);
  const [f, setF] = useState({ name: "", category: "Supplies", qty: 0, min_qty: 2 });
  const catOf = p => p.category || "Supplies";
  const term = q.trim().toLowerCase();
  const shown = P.filter(p => (cat === "All" || catOf(p) === cat) && p.name.toLowerCase().includes(term));
  const count = c => (c === "All" ? P.length : P.filter(p => catOf(p) === c).length);
  useEffect(() => {
    if (!open) return;
    const onKey = e => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const openForm = () => { if (cat !== "All") setF(x => ({ ...x, category: cat })); setOpen(true); };
  const add = async e => {
    e.preventDefault();
    if (!f.name.trim()) return;
    await run(() => api("/parts", "POST", { name: f.name.trim(), category: f.category, qty: +f.qty || 0, min_qty: +f.min_qty || 0 }));
    setF({ name: "", category: f.category, qty: 0, min_qty: 2 });
    setOpen(false);
  };
  return (
    <>
      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <input className="search" type="search" placeholder="Search item name" value={q} onChange={e => setQ(e.target.value)} aria-label="Search item name" />
          <button className="btn pri" onClick={openForm}>Add item</button>
        </div>
        <div className="fchips" role="group" aria-label="Filter by category">
          {["All", ...CATEGORIES].map(c => (
            <button key={c} className={"fchip" + (cat === c ? " on" : "")} aria-pressed={cat === c} onClick={() => setCat(c)}>
              {c}<span className="count">{count(c)}</span>
            </button>
          ))}
        </div>
        <h2>{cat === "All" ? "Inventory" : cat}</h2>
        <div className="scroll"><table>
          <thead><tr><th>Item</th><th>Category</th><th>In stock</th><th>Adjust</th><th>Min</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {shown.map(p => (
              <tr key={p.id}><td>{p.name}</td>
                <td><select className="cat-sel" value={catOf(p)} aria-label={`Category for ${p.name}`}
                  onChange={e => run(() => api(`/parts/${p.id}/category`, "PATCH", { category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select></td>
                <td><b>{p.qty}</b></td>
                <td><StockAdjust p={p} run={run} /></td>
                <td>{p.min_qty}</td>
                <td>{p.qty <= p.min_qty ? <span className="badge bad">Low stock</span> : <span className="badge ok">OK</span>}</td>
                <td>{admin && <button className="btn sm red" onClick={() => confirm("Delete this item?") && run(() => api(`/parts/${p.id}`, "DELETE"))}>Delete</button>}</td></tr>
            ))}
            {!shown.length && <tr><td colSpan="7" className="mut">{P.length ? "No items match your search or category." : "No items yet. Select Add item to create one."}</td></tr>}
          </tbody>
        </table></div>
      </div>
      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <form className="card modal" onClick={e => e.stopPropagation()} onSubmit={add}>
            <h2>Add item</h2>
            <label>Name<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} autoFocus /></label>
            <label>Category<select value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
            <label>Qty<input type="number" min="0" value={f.qty} onChange={e => setF({ ...f, qty: e.target.value })} /></label>
            <label>Min stock<input type="number" min="0" value={f.min_qty} onChange={e => setF({ ...f, min_qty: e.target.value })} /></label>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn pri">Add item</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function Log({ V, P, J }) {
  const [q, setQ] = useState(""), [kind, setKind] = useState("all"), [st, setSt] = useState("all");
  const term = q.trim().toLowerCase();
  const rows = [...J]
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
    .map(j => {
      const v = V.find(x => x.id === j.vehicle_id);
      return { j, plate: v?.plate || "?", model: v?.model || "" };
    })
    .filter(({ j, plate, model }) =>
      (kind === "all" || (j.kind || "pms") === kind) &&
      (st === "all" || (j.done ? "done" : underMaint(j) ? "maint" : "sched") === st) &&
      (!term || [plate, model, j.note, j.kind === "repair" ? "repair" : "pms", underMaint(j) ? "under maintenance" : ""].some(x => (x || "").toLowerCase().includes(term))));
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 10 }}>
        <input className="search" type="search" placeholder="Search plate, notes, or type" value={q} onChange={e => setQ(e.target.value)} aria-label="Search the service log" />
        <select value={kind} onChange={e => setKind(e.target.value)} aria-label="Filter by type">
          <option value="all">All types</option><option value="pms">PMS</option><option value="repair">Repair / other</option>
        </select>
        <select value={st} onChange={e => setSt(e.target.value)} aria-label="Filter by status">
          <option value="all">All statuses</option><option value="done">Done</option><option value="sched">Scheduled</option><option value="maint">Under maintenance</option>
        </select>
      </div>
      <h2>Service log</h2>
      <div className="scroll"><table>
        <thead><tr><th>Date</th><th>Vehicle</th><th>Type</th><th>Notes</th><th>Odometer</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map(({ j, plate, model }) => (
            <tr key={j.id}>
              <td>{j.date}</td><td>{plate}{model ? " – " + model : ""}</td>
              <td>{j.kind === "repair" ? "Repair" : "PMS"}</td><td>{j.note}</td>
              <td>{j.odo_at != null ? j.odo_at + " km" : ""}</td>
              <td>{j.done ? <span className="badge ok">Done</span> : underMaint(j) ? <><span className="badge maint">Under maintenance</span><div className="small mut">since {fmtDate(startOf(j))}</div></> : <span className="badge">Scheduled</span>}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan="6" className="mut">{J.length ? "No entries match your search." : "No services yet. Schedule one from the Calendar."}</td></tr>}
        </tbody>
      </table></div>
      <p className="mut small">{rows.length} of {J.length} entries</p>
    </div>
  );
}

function SupplyLog({ L }) {
  const [q, setQ] = useState(""), [k, setK] = useState("all");
  const term = q.trim().toLowerCase();
  const rows = L.filter(x =>
    (k === "all" || (k === "in" ? x.change > 0 || x.note === "New item" : x.change < 0)) &&
    (!term || [x.part_name, x.by, x.note].some(t => (t || "").toLowerCase().includes(term))));
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 10 }}>
        <input className="search" type="search" placeholder="Search item, user, or action" value={q} onChange={e => setQ(e.target.value)} aria-label="Search the supply log" />
        <select value={k} onChange={e => setK(e.target.value)} aria-label="Filter by direction">
          <option value="all">Added and reduced</option><option value="in">Added only</option><option value="out">Reduced only</option>
        </select>
      </div>
      <h2>Supply log</h2>
      <div className="scroll"><table>
        <thead><tr><th>When</th><th>Item</th><th>Change</th><th>Stock after</th><th>Action</th><th>By</th></tr></thead>
        <tbody>
          {rows.map(x => (
            <tr key={x.id}>
              <td>{new Date(x.at).toLocaleString()}</td><td>{x.part_name}</td>
              <td><b className={x.change > 0 ? "ok" : x.change < 0 ? "bad" : "mut"}>{x.change > 0 ? "+" : ""}{x.change}</b></td>
              <td>{x.qty_after}</td><td>{x.note}</td><td>{x.by}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan="6" className="mut">{L.length ? "No entries match your search." : "No stock changes yet."}</td></tr>}
        </tbody>
      </table></div>
      <p className="mut small">Showing {rows.length} of {L.length} recent entries</p>
    </div>
  );
}

const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

const HOME_ICON = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: 6 }}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></svg>;

const QA_ICONS = {
  schedule: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" /></>,
  repair: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />,
  addVehicle: <><path d="M4 17v-4.5L6.2 7h11.6L20 12.5V17z" /><circle cx="8" cy="17.5" r="1.7" /><circle cx="16" cy="17.5" r="1.7" /></>,
  addItem: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" /></>,
};

function Home({ me, V, P, J, go }) {
  const h = new Date().getHours();
  const greet = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const dateText = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const actions = [
    { id: "schedule", tab: "cal", title: "Schedule PMS", sub: "Book a PMS for today" },
    { id: "repair", tab: "cal", title: "Record repair", sub: "Log a repair or other work" },
    { id: "addVehicle", tab: "veh", title: "Add vehicle", sub: "Register a new vehicle" },
    { id: "addItem", tab: "inv", title: "Add inventory item", sub: "Supply, consumable, or equipment" },
  ];
  const overdue = V.filter(v => status(v)[0] === "Overdue").length;
  const dueSoon = V.filter(v => status(v)[0] === "Due soon").length;
  const maint = J.filter(underMaint).length;
  const low = P.filter(p => p.qty <= p.min_qty).length;
  const items = [
    overdue > 0 && { tone: "bad", text: `${plural(overdue, "vehicle")} overdue for PMS`, tab: "veh" },
    maint > 0 && { tone: "maint", text: `${plural(maint, "service")} under maintenance`, tab: "cal" },
    dueSoon > 0 && { tone: "warn", text: `${plural(dueSoon, "vehicle")} due for PMS soon`, tab: "veh" },
    low > 0 && { tone: "bad", text: `${plural(low, "inventory item")} at or below minimum stock`, tab: "inv" },
  ].filter(Boolean);
  return (
    <>
      <div className="home-head">
        <h2 className="home-title">{greet}, {me.username}</h2>
        <div className="mut">{dateText}</div>
      </div>
      <h2 className="sect">Quick actions</h2>
      <div className="qa-grid">
        {actions.map(a => (
          <button key={a.id} className={"qa " + a.id} onClick={() => go(a.tab, a.id)}>
            <span className="qa-ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{QA_ICONS[a.id]}</svg></span>
            <span><b>{a.title}</b><span className="qa-sub">{a.sub}</span></span>
          </button>
        ))}
      </div>
      <h2 className="sect">Needs attention</h2>
      <div className="card">
        {items.length ? items.map(i => (
          <button key={i.text} className="attn" onClick={() => go(i.tab)}><span className={"dot " + i.tone} />{i.text}</button>
        )) : <p className="mut" style={{ margin: 0 }}>Nothing needs attention right now.</p>}
      </div>
    </>
  );
}

export default function App() {
  const [me, setMe] = useState(null), [tab, setTab] = useState("home"), [launch, setLaunch] = useState(null);
  const [V, setV] = useState([]), [P, setP] = useState([]), [J, setJ] = useState([]), [L, setL] = useState([]);
  const load = useCallback(async () => {
    const [v, p, j, l] = await Promise.all([api("/vehicles"), api("/parts"), api("/jobs"), api("/stocklog")]);
    setV(v); setP(p); setJ(j); setL(l);
  }, []);
  const run = async fn => { await fn(); await load(); };
  const go = (t, intent = null) => { setTab(t); setLaunch(intent); };
  const clear = () => setLaunch(null);
  useEffect(() => { if (token) api("/me").then(setMe).then(load); }, [load]);
  const [, setTick] = useState(0);
  useEffect(() => {   // re-check the date and the cutoff time so an open page updates by itself
    const mark = () => ymd(new Date()) + pastCutoff();
    let last = mark();
    const id = setInterval(() => { const now = mark(); if (now !== last) { last = now; today = ymd(new Date()); setTick(t => t + 1); } }, 30000);
    return () => clearInterval(id);
  }, []);
  if (!token) return <Login />;
  if (!me) return <div className="wrap mut">Loading…</div>;
  const admin = me.role === "admin";
  const low = P.filter(p => p.qty <= p.min_qty);
  return (
    <div className="wrap">
      <div className="top"><h1>Fleet PMS Manager</h1>
        <span className="mut small">{me.username} ({me.role}) <button className="btn sm" onClick={() => { localStorage.removeItem("t"); location.reload(); }}>Sign out</button></span></div>
      <div className="tabs"><button className={"home-btn" + (tab === "home" ? " on" : "")} onClick={() => go("home")}>{HOME_ICON}Home</button><span className="sep" aria-hidden="true" />{[["cal", "Calendar"], ["veh", "Vehicles"], ["inv", "Inventory"], ["slog", "Supply log"], ["log", "Service log"]].map(([k, t]) =>
        <button key={k} className={tab === k ? "on" : ""} onClick={() => go(k)}>{t}{k === "inv" && low.length > 0 && <span className="badge bad" style={{ marginLeft: 6 }}>{low.length}</span>}</button>)}</div>
      {low.length > 0 && tab !== "home" && (
        <div className="alert" role="alert">
          <b>Low supplies ({low.length}):</b> {low.map(p => `${p.name} (${p.qty} left, min ${p.min_qty})`).join(", ")}
          {tab !== "inv" && <button className="btn sm" onClick={() => go("inv")}>View inventory</button>}
        </div>
      )}
      {tab === "home" && <Home me={me} V={V} P={P} J={J} go={go} />}
      {tab === "cal" && <Calendar V={V} P={P} J={J} run={run} launch={launch} clear={clear} />}
      {tab === "veh" && <Vehicles V={V} J={J} run={run} admin={admin} launch={launch} clear={clear} />}
      {tab === "inv" && <Inventory P={P} run={run} admin={admin} launch={launch} clear={clear} />}
      {tab === "log" && <Log V={V} P={P} J={J} />}
      {tab === "slog" && <SupplyLog L={L} />}
    </div>
  );
}