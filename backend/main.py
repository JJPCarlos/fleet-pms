import os, time, hashlib, secrets
from datetime import datetime, timedelta, timezone
import jwt
from fastapi import FastAPI, APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy import create_engine, String, inspect, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from sqlalchemy.exc import OperationalError

SECRET = os.getenv("SECRET", "dev-secret")
engine = create_engine(os.getenv("DATABASE_URL", "sqlite:///./pms.db"))
Session = sessionmaker(engine)

class Base(DeclarativeBase): pass
class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True)
    pw: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20), default="mechanic")
class Vehicle(Base):
    __tablename__ = "vehicles"
    id: Mapped[int] = mapped_column(primary_key=True)
    plate: Mapped[str] = mapped_column(String(30))
    model: Mapped[str] = mapped_column(String(80), default="")
    odo: Mapped[int] = mapped_column(default=0)
    interval_km: Mapped[int] = mapped_column(default=5000)
    interval_mo: Mapped[int] = mapped_column(default=6)
    last_date: Mapped[str] = mapped_column(String(10))
    last_odo: Mapped[int] = mapped_column(default=0)
class Part(Base):
    __tablename__ = "parts"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    qty: Mapped[int] = mapped_column(default=0)
    min_qty: Mapped[int] = mapped_column(default=2)
    category: Mapped[str] = mapped_column(String(30), default="Supplies")
class StockLog(Base):
    __tablename__ = "stock_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    part_id: Mapped[int | None] = mapped_column(default=None)
    part_name: Mapped[str] = mapped_column(String(80))
    change: Mapped[int]
    qty_after: Mapped[int]
    note: Mapped[str] = mapped_column(String(100), default="")
    by: Mapped[str] = mapped_column(String(50), default="")
    at: Mapped[str] = mapped_column(String(30))

class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    vehicle_id: Mapped[int]
    date: Mapped[str] = mapped_column(String(10))
    note: Mapped[str] = mapped_column(String(200), default="")
    part_id: Mapped[int | None] = mapped_column(default=None)
    qty: Mapped[int] = mapped_column(default=1)
    done: Mapped[bool] = mapped_column(default=False)
    kind: Mapped[str] = mapped_column(String(10), default="pms")
    odo_at: Mapped[int | None] = mapped_column(default=None)
    maint_started: Mapped[str | None] = mapped_column(String(10), default=None)

def hp(p, salt=None):
    salt = salt or secrets.token_hex(8)
    return salt + "$" + hashlib.pbkdf2_hmac("sha256", p.encode(), salt.encode(), 100_000).hex()
def check(p, h): return secrets.compare_digest(hp(p, h.split("$")[0]), h)

for _ in range(30):
    try: Base.metadata.create_all(engine); break
    except OperationalError: time.sleep(2)
# add the new job columns to databases created by an older version
with engine.begin() as c:
    cols = {x["name"] for x in inspect(c).get_columns("jobs")}
    if "kind" not in cols:
        c.execute(text("ALTER TABLE jobs ADD COLUMN kind VARCHAR(10) NOT NULL DEFAULT 'pms'"))
    if "odo_at" not in cols:
        c.execute(text("ALTER TABLE jobs ADD COLUMN odo_at INTEGER"))
    if "maint_started" not in cols:
        c.execute(text("ALTER TABLE jobs ADD COLUMN maint_started VARCHAR(10)"))
    pcols = {x["name"] for x in inspect(c).get_columns("parts")}
    if "category" not in pcols:
        c.execute(text("ALTER TABLE parts ADD COLUMN category VARCHAR(30) NOT NULL DEFAULT 'Supplies'"))
with Session() as s:
    name = os.getenv("ADMIN_USER", "admin")
    if not s.query(User).filter_by(username=name).first():
        s.add(User(username=name, pw=hp(os.getenv("ADMIN_PASS", "admin123")), role="admin")); s.commit()

class Login(BaseModel): username: str; password: str
class UserIn(BaseModel): username: str; password: str; role: str = "mechanic"
class VehicleIn(BaseModel):
    plate: str; model: str = ""; odo: int = 0; interval_km: int = 5000
    interval_mo: int = 6; last_date: str; last_odo: int = 0
CATEGORIES = ("Property & Equipment", "Consumables", "Supplies")
class PartIn(BaseModel): name: str; qty: int = 0; min_qty: int = 2; category: str = "Supplies"
class CatIn(BaseModel): category: str
class JobIn(BaseModel): vehicle_id: int; date: str; note: str = ""; part_id: int | None = None; qty: int = 1; kind: str = "pms"
class Val(BaseModel): value: int

def log_stock(db, p, change, note, u):
    if change == 0 and note != "New item": return
    db.add(StockLog(part_id=p.id, part_name=p.name, change=change, qty_after=p.qty if note != "Deleted" else 0,
                    note=note, by=u.username, at=datetime.now(timezone.utc).isoformat(timespec="seconds")))

def row(o): return {c.name: getattr(o, c.name) for c in o.__table__.columns}
def get_db():
    with Session() as s: yield s
def one(db, M, i):
    o = db.get(M, i)
    if not o: raise HTTPException(404, "Not found")
    return o
bearer = HTTPBearer()
def user(c: HTTPAuthorizationCredentials = Depends(bearer), db=Depends(get_db)):
    try: uid = jwt.decode(c.credentials, SECRET, algorithms=["HS256"])["uid"]
    except jwt.PyJWTError: raise HTTPException(401, "Session expired")
    u = db.get(User, uid)
    if not u: raise HTTPException(401, "Unknown user")
    return u
def admin(u=Depends(user)):
    if u.role != "admin": raise HTTPException(403, "Admin only")
    return u

app = FastAPI(title="Fleet PMS")
r = APIRouter(prefix="/api")

@r.post("/login")
def login(b: Login, db=Depends(get_db)):
    u = db.query(User).filter_by(username=b.username).first()
    if not u or not check(b.password, u.pw): raise HTTPException(401, "Wrong username or password")
    exp = datetime.now(timezone.utc) + timedelta(days=7)
    return {"token": jwt.encode({"uid": u.id, "exp": exp}, SECRET, "HS256")}
@r.get("/me")
def me(u=Depends(user)): return {"username": u.username, "role": u.role}
@r.post("/users")
def add_user(b: UserIn, db=Depends(get_db), _=Depends(admin)):
    if db.query(User).filter_by(username=b.username).first(): raise HTTPException(400, "Username taken")
    db.add(User(username=b.username, pw=hp(b.password), role=b.role)); db.commit(); return {"ok": True}

@r.get("/vehicles")
def vehicles(db=Depends(get_db), _=Depends(user)): return [row(x) for x in db.query(Vehicle).order_by(Vehicle.id)]
@r.post("/vehicles")
def add_vehicle(b: VehicleIn, db=Depends(get_db), _=Depends(user)):
    v = Vehicle(**b.model_dump()); db.add(v); db.commit(); return row(v)
@r.patch("/vehicles/{i}/odo")
def set_odo(i: int, b: Val, db=Depends(get_db), _=Depends(user)):
    v = one(db, Vehicle, i); v.odo = max(0, b.value); db.commit(); return row(v)
@r.delete("/vehicles/{i}")
def del_vehicle(i: int, db=Depends(get_db), _=Depends(admin)):
    db.query(Job).filter_by(vehicle_id=i).delete(); db.delete(one(db, Vehicle, i)); db.commit(); return {"ok": True}

@r.get("/parts")
def parts(db=Depends(get_db), _=Depends(user)): return [row(x) for x in db.query(Part).order_by(Part.id)]
@r.post("/parts")
def add_part(b: PartIn, db=Depends(get_db), u=Depends(user)):
    if b.category not in CATEGORIES: raise HTTPException(400, "Unknown category")
    p = Part(**b.model_dump()); db.add(p); db.flush()
    log_stock(db, p, p.qty, "New item", u); db.commit(); return row(p)
@r.patch("/parts/{i}/qty")
def set_qty(i: int, b: Val, db=Depends(get_db), u=Depends(user)):
    p = one(db, Part, i); old = p.qty; p.qty = max(0, b.value)
    log_stock(db, p, p.qty - old, "Added stock" if p.qty > old else "Reduced stock", u); db.commit(); return row(p)
@r.patch("/parts/{i}/category")
def set_category(i: int, b: CatIn, db=Depends(get_db), _=Depends(user)):
    if b.category not in CATEGORIES: raise HTTPException(400, "Unknown category")
    p = one(db, Part, i); p.category = b.category; db.commit(); return row(p)

@r.delete("/parts/{i}")
def del_part(i: int, db=Depends(get_db), u=Depends(admin)):
    for j in db.query(Job).filter_by(part_id=i): j.part_id = None
    p = one(db, Part, i); log_stock(db, p, -p.qty, "Deleted", u)
    db.delete(p); db.commit(); return {"ok": True}

@r.get("/stocklog")
def stocklog(db=Depends(get_db), _=Depends(user)): return [row(x) for x in db.query(StockLog).order_by(StockLog.id.desc()).limit(500)]

@r.get("/jobs")
def jobs(db=Depends(get_db), _=Depends(user)): return [row(x) for x in db.query(Job).order_by(Job.date)]
@r.post("/jobs")
def add_job(b: JobIn, db=Depends(get_db), _=Depends(user)):
    if b.kind not in ("pms", "repair"): raise HTTPException(400, "Type must be pms or repair")
    one(db, Vehicle, b.vehicle_id); j = Job(**b.model_dump()); db.add(j); db.commit(); return row(j)
@r.post("/jobs/{i}/complete")
def complete(i: int, db=Depends(get_db), _=Depends(user)):
    j = one(db, Job, i)
    if not j.done:
        j.done = True
        v = db.get(Vehicle, j.vehicle_id)
        if v:
            j.odo_at = v.odo
            if j.kind == "pms": v.last_date, v.last_odo = (j.maint_started or j.date), v.odo
        db.commit()
    return row(j)
class MaintIn(BaseModel): date: str | None = None
@r.post("/jobs/{i}/maintenance")
def maintenance(i: int, b: MaintIn, db=Depends(get_db), _=Depends(user)):
    j = one(db, Job, i)
    if j.done: raise HTTPException(400, "This service is already completed")
    if b.date is not None:
        try: datetime.strptime(b.date, "%Y-%m-%d")
        except ValueError: raise HTTPException(400, "Date must be YYYY-MM-DD")
    j.maint_started = b.date; db.commit(); return row(j)

@r.delete("/jobs/{i}")
def del_job(i: int, db=Depends(get_db), _=Depends(user)):
    db.delete(one(db, Job, i)); db.commit(); return {"ok": True}

app.include_router(r)