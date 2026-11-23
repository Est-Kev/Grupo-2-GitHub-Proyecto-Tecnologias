"""ilo & oli - API REST (Flask + SQLite). Sesiones por cookie y roles usuario/admin."""
import os, re, sqlite3
from datetime import date
from functools import wraps
from flask import Flask, g, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

BASE = os.path.dirname(os.path.abspath(__file__))
DB = os.environ.get("ILO_DB", os.path.join(BASE, "iloyoli.db"))
app = Flask(__name__, static_folder=os.path.join(BASE, "..", "frontend"), static_url_path="")
app.config.update(SECRET_KEY=os.environ.get("SECRET_KEY", "fbea0f67b85a7ff15068d2537026633f7f7c196053a0c22a59f09a7bc3434e86"),
                  SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax")

SCHEMA = """
CREATE TABLE IF NOT EXISTS usuarios(id INTEGER PRIMARY KEY, nombre TEXT NOT NULL,
  correo TEXT UNIQUE NOT NULL, clave TEXT NOT NULL, rol TEXT NOT NULL DEFAULT 'usuario');
CREATE TABLE IF NOT EXISTS mascotas(id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, tipo TEXT NOT NULL,
  edad TEXT, tamano TEXT, fundacion TEXT, salud TEXT, temperamento TEXT, estado TEXT DEFAULT 'Disponible', imagen TEXT);
CREATE TABLE IF NOT EXISTS productos(id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, categoria TEXT NOT NULL,
  marca TEXT, presentacion TEXT, precio INTEGER NOT NULL CHECK(precio>=0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK(stock>=0), descripcion TEXT, imagen TEXT);
CREATE TABLE IF NOT EXISTS adopciones(id INTEGER PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  mascota_id INTEGER NOT NULL REFERENCES mascotas(id), vivienda TEXT, observaciones TEXT,
  estado TEXT NOT NULL DEFAULT 'Pendiente', creada TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS veterinarias(id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, direccion TEXT, telefono TEXT,
  horario TEXT, urgencias INTEGER DEFAULT 0, imagen TEXT);
CREATE TABLE IF NOT EXISTS servicios_vet(id INTEGER PRIMARY KEY, vet_id INTEGER NOT NULL REFERENCES veterinarias(id),
  nombre TEXT NOT NULL, precio INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS citas(id INTEGER PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  vet_id INTEGER NOT NULL REFERENCES veterinarias(id), servicio TEXT NOT NULL, precio INTEGER, fecha TEXT NOT NULL,
  hora TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'Solicitada', creada TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS pedidos(id INTEGER PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  total INTEGER NOT NULL, metodo TEXT, estado TEXT NOT NULL DEFAULT 'Confirmado', creada TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS pedido_items(id INTEGER PRIMARY KEY, pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
  producto_id INTEGER, nombre TEXT, precio INTEGER, cantidad INTEGER);
CREATE TABLE IF NOT EXISTS donaciones(id INTEGER PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  fundacion TEXT, monto INTEGER NOT NULL CHECK(monto>0), creada TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS membresias(usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id), creada TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sellos(id INTEGER PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  tipo TEXT, estado TEXT NOT NULL DEFAULT 'Pendiente', creada TEXT DEFAULT CURRENT_TIMESTAMP);
"""
IMG_M = {n: "mascota-" + n.lower().replace("ó", "o") for n in ("Luna","Rocco","Toby","Mishi","Simón","Nube","Max","Bella")}
IMG_P = {"Concentrado Premium 3kg":"producto-comida","Alimento húmedo para gatos":"producto-humedo","Snacks dentales":"producto-snacks",
 "Shampoo hipoalergénico":"producto-shampoo","Toallitas húmedas":"producto-toallitas","Arena sanitaria aglomerante":"producto-arena",
 "Correa reflectiva":"producto-correa","Rascador para gatos":"producto-rascador","Cama acolchada mediana":"producto-cama"}
_S = ["Consulta general","Vacunación","Desparasitación","Peluquería","Urgencias"]
VETS = [("Clínica San Roque","Cra 15 #45-20, Bogotá","(601) 555-0199","Lun–Sáb, 8:00–18:00",1,"vet-sanroque",dict(zip(_S,(45000,35000,25000,40000,90000)))),
 ("Veterinaria Patitas Felices","Cll 80 #22-10, Bogotá","(601) 555-0123","Lun–Dom, 9:00–19:00",1,"vet-patitas",dict(zip(_S,(50000,38000,28000,42000,95000)))),
 ("Centro Veterinario Norte","Av. Suba #110-5, Bogotá","(601) 555-0147","Lun–Vie, 8:00–17:00",0,"vet-norte",dict(zip(_S[:4],(42000,33000,22000,38000)))),
 ("Veterinaria El Refugio","Cra 7 #63-40, Bogotá","(601) 555-0168","Lun–Sáb, 7:30–19:00",1,"vet-refugio",{"Consulta general":48000,"Vacunación":36000,"Desparasitación":26000,"Urgencias":85000})]
MASCOTAS = [("Luna","Perro","2 años","Mediano","Fundación Huellas","Vacunada y esterilizada","Activa, cariñosa"),
 ("Rocco","Perro","5 años","Grande","Fundación Huellas","Vacunado y esterilizado","Tranquilo y leal"),
 ("Toby","Perro","8 meses","Pequeño","Santuario Patitas","Vacunas al día","Juguetón y curioso"),
 ("Mishi","Gato","1 año","Pequeño","Fundación Huellas","Vacunada y esterilizada","Dulce y sociable"),
 ("Simón","Gato","3 años","Mediano","Santuario Patitas","Vacunado y esterilizado","Independiente y tranquilo"),
 ("Nube","Gato","6 meses","Pequeño","Fundación Huellas","Vacunas al día","Juguetona y ágil"),
 ("Max","Perro de asistencia","4 años","Grande","Santuario Patitas","Entrenamiento certificado","Paciente y obediente"),
 ("Bella","Perro de asistencia","3 años","Mediano","Fundación Huellas","Entrenamiento certificado","Calmada y atenta")]
PRODUCTOS = [("Concentrado Premium 3kg","Alimento","NutriCan","Bolsa 3 kg",68000,12),
 ("Alimento húmedo para gatos","Alimento","MiauGourmet","Lata 170 g",12000,24),
 ("Snacks dentales","Alimento","NutriCan","Bolsa 200 g",19000,18),
 ("Shampoo hipoalergénico","Higiene","PielSana","Frasco 500 ml",27000,15),
 ("Toallitas húmedas","Higiene","PielSana","80 unidades",15000,30),
 ("Arena sanitaria aglomerante","Higiene","ArenaFresh","Bolsa 5 kg",32000,20),
 ("Correa reflectiva","Accesorios","PasoSeguro","1,5 m",35000,14),
 ("Rascador para gatos","Accesorios","GatoAlto","Torre 80 cm",89000,6),
 ("Cama acolchada mediana","Accesorios","DulceSueño","70 × 55 cm",75000,9)]

def db():
    if "db" not in g:
        g.db = sqlite3.connect(DB); g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys=ON")
    return g.db

@app.teardown_appcontext
def cerrar(_):
    d = g.pop("db", None)
    if d: d.close()

def iniciar_db():
    c = sqlite3.connect(DB); c.executescript(SCHEMA)
    if not c.execute("SELECT 1 FROM usuarios").fetchone():
        clave = os.environ.get("ADMIN_CLAVE", "Admin123!")
        c.execute("INSERT INTO usuarios(nombre,correo,clave,rol) VALUES(?,?,?,'admin')",
                  ("Equipo ilo & oli", "admin@iloyoli.co", generate_password_hash(clave)))
        c.execute("INSERT INTO usuarios(nombre,correo,clave,rol) VALUES(?,?,?,'usuario')",
                  ("Usuario de prueba", "usuario@iloyoli.co", generate_password_hash("Usuario123!")))
        c.executemany("INSERT INTO mascotas(nombre,tipo,edad,tamano,fundacion,salud,temperamento) VALUES(?,?,?,?,?,?,?)", MASCOTAS)
        c.executemany("INSERT INTO productos(nombre,categoria,marca,presentacion,precio,stock) VALUES(?,?,?,?,?,?)", PRODUCTOS)
    for t in ("mascotas", "productos"):                 # bases creadas con la versión anterior
        try: c.execute(f"ALTER TABLE {t} ADD COLUMN imagen TEXT")
        except sqlite3.OperationalError: pass
    c.executemany("UPDATE mascotas SET imagen=? WHERE nombre=? AND imagen IS NULL", [(v, k) for k, v in IMG_M.items()])
    c.executemany("UPDATE productos SET imagen=? WHERE nombre=? AND imagen IS NULL", [(v, k) for k, v in IMG_P.items()])
    if not c.execute("SELECT 1 FROM veterinarias").fetchone():
        for n, d, t, h, u, img, sv in VETS:
            vid = c.execute("INSERT INTO veterinarias(nombre,direccion,telefono,horario,urgencias,imagen) VALUES(?,?,?,?,?,?)", (n, d, t, h, u, img)).lastrowid
            c.executemany("INSERT INTO servicios_vet(vet_id,nombre,precio) VALUES(?,?,?)", [(vid, k, v) for k, v in sv.items()])
    c.commit(); c.close()

def err(msg, code=400): return jsonify(error=msg), code
def filas(q, *a): return [dict(r) for r in db().execute(q, a).fetchall()]
def cuerpo(): return request.get_json(silent=True) or {}

def requiere(rol=None):
    def deco(f):
        @wraps(f)
        def w(*a, **k):
            if "uid" not in session: return err("Debes iniciar sesión", 401)
            if rol and session.get("rol") != rol: return err("No tienes permiso", 403)
            return f(*a, **k)
        return w
    return deco

def texto(d, campo, obligatorio=True, max_=200):
    v = str(d.get(campo, "") or "").strip()
    if obligatorio and not v: raise ValueError(f"El campo «{campo}» es obligatorio")
    return v[:max_]

def entero(d, campo):
    try: n = int(d.get(campo))
    except (TypeError, ValueError): raise ValueError(f"«{campo}» debe ser un número")
    if n < 0: raise ValueError(f"«{campo}» no puede ser negativo")
    return n

@app.errorhandler(ValueError)
def _val(e): return err(str(e))

# ---------- Sesión ----------
@app.post("/api/registro")
def registro():
    d = cuerpo()
    nombre, correo, clave = texto(d, "nombre"), texto(d, "correo").lower(), str(d.get("clave", ""))
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", correo): return err("Correo no válido")
    if len(clave) < 8: return err("La contraseña debe tener al menos 8 caracteres")
    try:
        cur = db().execute("INSERT INTO usuarios(nombre,correo,clave) VALUES(?,?,?)", (nombre, correo, generate_password_hash(clave)))
        db().commit()
    except sqlite3.IntegrityError: return err("Ese correo ya está registrado", 409)
    session.clear(); session.update(uid=cur.lastrowid, rol="usuario")
    return jsonify(id=cur.lastrowid, nombre=nombre, correo=correo, rol="usuario"), 201

@app.post("/api/login")
def login():
    d = cuerpo()
    u = db().execute("SELECT * FROM usuarios WHERE correo=?", (str(d.get("correo", "")).strip().lower(),)).fetchone()
    if not u or not check_password_hash(u["clave"], str(d.get("clave", ""))): return err("Correo o contraseña incorrectos", 401)
    session.clear(); session.update(uid=u["id"], rol=u["rol"])
    return jsonify(id=u["id"], nombre=u["nombre"], correo=u["correo"], rol=u["rol"])

@app.post("/api/logout")
def logout(): session.clear(); return "", 204

@app.get("/api/sesion")
def sesion():
    if "uid" not in session: return jsonify(rol=None)
    u = db().execute("SELECT id,nombre,correo,rol FROM usuarios WHERE id=?", (session["uid"],)).fetchone()
    if not u: session.clear(); return jsonify(rol=None)
    return jsonify(dict(u))

@app.put("/api/perfil")
@requiere()
def perfil():
    db().execute("UPDATE usuarios SET nombre=? WHERE id=?", (texto(cuerpo(), "nombre"), session["uid"]))
    db().commit(); return jsonify(ok=True)

# ---------- Mascotas (lectura pública, CRUD admin) ----------
CAMPOS_M = ("nombre", "tipo", "edad", "tamano", "fundacion", "salud", "temperamento")
def datos_mascota(d): return [texto(d, c, obligatorio=c in ("nombre", "tipo")) for c in CAMPOS_M]

@app.get("/api/mascotas")
def mascotas(): return jsonify(filas("SELECT * FROM mascotas ORDER BY id"))

@app.post("/api/mascotas")
@requiere("admin")
def mascota_crear():
    cur = db().execute(f"INSERT INTO mascotas({','.join(CAMPOS_M)}) VALUES(?,?,?,?,?,?,?)", datos_mascota(cuerpo())); db().commit()
    return jsonify(id=cur.lastrowid), 201

@app.put("/api/mascotas/<int:i>")
@requiere("admin")
def mascota_editar(i):
    cur = db().execute(f"UPDATE mascotas SET {','.join(c+'=?' for c in CAMPOS_M)} WHERE id=?", datos_mascota(cuerpo()) + [i]); db().commit()
    return jsonify(ok=True) if cur.rowcount else err("No existe", 404)

@app.delete("/api/mascotas/<int:i>")
@requiere("admin")
def mascota_borrar(i):
    if db().execute("SELECT 1 FROM adopciones WHERE mascota_id=? AND estado='Pendiente'", (i,)).fetchone():
        return err("Tiene solicitudes pendientes; resuélvelas primero", 409)
    db().execute("DELETE FROM adopciones WHERE mascota_id=?", (i,))
    cur = db().execute("DELETE FROM mascotas WHERE id=?", (i,)); db().commit()
    return ("", 204) if cur.rowcount else err("No existe", 404)

# ---------- Productos ----------
def datos_producto(d):
    return (texto(d, "nombre"), texto(d, "categoria"), texto(d, "marca", False), texto(d, "presentacion", False),
            entero(d, "precio"), entero(d, "stock"), texto(d, "descripcion", False, 600))

@app.get("/api/productos")
def productos(): return jsonify(filas("SELECT * FROM productos ORDER BY id"))

@app.post("/api/productos")
@requiere("admin")
def producto_crear():
    cur = db().execute("INSERT INTO productos(nombre,categoria,marca,presentacion,precio,stock,descripcion) VALUES(?,?,?,?,?,?,?)",
                       datos_producto(cuerpo())); db().commit()
    return jsonify(id=cur.lastrowid), 201

@app.put("/api/productos/<int:i>")
@requiere("admin")
def producto_editar(i):
    cur = db().execute("UPDATE productos SET nombre=?,categoria=?,marca=?,presentacion=?,precio=?,stock=?,descripcion=? WHERE id=?",
                       datos_producto(cuerpo()) + (i,)); db().commit()
    return jsonify(ok=True) if cur.rowcount else err("No existe", 404)

@app.patch("/api/productos/<int:i>/stock")
@requiere("admin")
def producto_stock(i):
    n = entero(cuerpo(), "unidades")
    if n < 1: return err("Indica al menos 1 unidad")
    cur = db().execute("UPDATE productos SET stock=stock+? WHERE id=?", (n, i)); db().commit()
    return jsonify(ok=True) if cur.rowcount else err("No existe", 404)

@app.delete("/api/productos/<int:i>")
@requiere("admin")
def producto_borrar(i):
    cur = db().execute("DELETE FROM productos WHERE id=?", (i,)); db().commit()
    return ("", 204) if cur.rowcount else err("No existe", 404)

# ---------- Solicitudes de adopción ----------
SEL_ADOP = """SELECT a.id,a.estado,a.vivienda,a.observaciones,a.creada,m.nombre AS mascota,m.fundacion,
  u.nombre AS solicitante,u.correo FROM adopciones a JOIN mascotas m ON m.id=a.mascota_id
  JOIN usuarios u ON u.id=a.usuario_id"""

@app.post("/api/adopciones")
@requiere("usuario")
def adopcion_crear():
    d = cuerpo()
    m = db().execute("SELECT id FROM mascotas WHERE nombre=?", (texto(d, "mascota"),)).fetchone()
    if not m: return err("Esa mascota no existe", 404)
    if db().execute("SELECT 1 FROM adopciones WHERE usuario_id=? AND mascota_id=? AND estado='Pendiente'", (session["uid"], m["id"])).fetchone():
        return err("Ya tienes una solicitud pendiente para esta mascota", 409)
    cur = db().execute("INSERT INTO adopciones(usuario_id,mascota_id,vivienda,observaciones) VALUES(?,?,?,?)",
                       (session["uid"], m["id"], texto(d, "vivienda", False), texto(d, "observaciones", False, 800))); db().commit()
    return jsonify(id=cur.lastrowid, estado="Pendiente"), 201

@app.get("/api/adopciones/mias")
@requiere()
def adopciones_mias(): return jsonify(filas(SEL_ADOP + " WHERE a.usuario_id=? ORDER BY a.id DESC", session["uid"]))

@app.get("/api/adopciones")
@requiere("admin")
def adopciones(): return jsonify(filas(SEL_ADOP + " ORDER BY a.id DESC"))

@app.patch("/api/adopciones/<int:i>")
@requiere("admin")
def adopcion_resolver(i):
    est = cuerpo().get("estado")
    if est not in ("Aprobada", "Rechazada"): return err("Estado no válido")
    cur = db().execute("UPDATE adopciones SET estado=? WHERE id=?", (est, i))
    if est == "Aprobada":
        db().execute("UPDATE mascotas SET estado='Adoptada' WHERE id=(SELECT mascota_id FROM adopciones WHERE id=?)", (i,))
    db().commit()
    return jsonify(ok=True) if cur.rowcount else err("No existe", 404)

# ---------- Veterinarias y citas ----------
@app.get("/api/veterinarias")
def veterinarias():
    vs = filas("SELECT * FROM veterinarias ORDER BY id")
    for v in vs: v["servicios"] = filas("SELECT id,nombre,precio FROM servicios_vet WHERE vet_id=? ORDER BY id", v["id"])
    return jsonify(vs)

SEL_CITA = "SELECT c.id,c.servicio,c.precio,c.fecha,c.hora,c.estado,v.nombre AS vet,u.nombre AS solicitante FROM citas c JOIN veterinarias v ON v.id=c.vet_id JOIN usuarios u ON u.id=c.usuario_id"

@app.post("/api/citas")
@requiere("usuario")
def cita_crear():
    d = cuerpo()
    s = db().execute("SELECT s.*,v.nombre AS vet FROM servicios_vet s JOIN veterinarias v ON v.id=s.vet_id WHERE s.id=?", (entero(d, "servicio_id"),)).fetchone()
    if not s: return err("Ese servicio no existe", 404)
    try: f = date.fromisoformat(texto(d, "fecha"))
    except ValueError: return err("Fecha no válida")
    if f < date.today(): return err("La fecha no puede ser pasada")
    hora = texto(d, "hora")
    if not re.fullmatch(r"\d{2}:\d{2}", hora): return err("Hora no válida")
    cur = db().execute("INSERT INTO citas(usuario_id,vet_id,servicio,precio,fecha,hora) VALUES(?,?,?,?,?,?)",
                       (session["uid"], s["vet_id"], s["nombre"], s["precio"], f.isoformat(), hora)); db().commit()
    return jsonify(id=cur.lastrowid, estado="Solicitada"), 201

@app.get("/api/citas/mias")
@requiere()
def citas_mias(): return jsonify(filas(SEL_CITA + " WHERE c.usuario_id=? ORDER BY c.id DESC", session["uid"]))

@app.get("/api/citas")
@requiere("admin")
def citas(): return jsonify(filas(SEL_CITA + " ORDER BY c.id DESC"))

@app.patch("/api/citas/<int:i>")
@requiere("admin")
def cita_resolver(i):
    est = cuerpo().get("estado")
    if est not in ("Confirmada", "Cancelada"): return err("Estado no válido")
    cur = db().execute("UPDATE citas SET estado=? WHERE id=?", (est, i)); db().commit()
    return jsonify(ok=True) if cur.rowcount else err("No existe", 404)

# ---------- Pedidos (el total y el stock los controla el servidor) ----------
@app.post("/api/pedidos")
@requiere("usuario")
def pedido_crear():
    d = cuerpo(); items = d.get("items")
    if not isinstance(items, list) or not items: return err("El carrito está vacío")
    cant = {}
    for it in items:
        n = entero(it, "cantidad")
        if n < 1: return err("Cantidad no válida")
        cant[entero(it, "id")] = cant.get(entero(it, "id"), 0) + n
    total, lineas = 0, []
    for pid, n in cant.items():
        p = db().execute("SELECT * FROM productos WHERE id=?", (pid,)).fetchone()
        if not p: return err("Un producto del carrito ya no existe", 404)
        if p["stock"] < n: return err(f"Stock insuficiente de {p['nombre']} (quedan {p['stock']})", 409)
        total += p["precio"] * n; lineas.append((p, n))
    cur = db().execute("INSERT INTO pedidos(usuario_id,total,metodo) VALUES(?,?,?)", (session["uid"], total, texto(d, "metodo")))
    for p, n in lineas:
        db().execute("INSERT INTO pedido_items(pedido_id,producto_id,nombre,precio,cantidad) VALUES(?,?,?,?,?)", (cur.lastrowid, p["id"], p["nombre"], p["precio"], n))
        db().execute("UPDATE productos SET stock=stock-? WHERE id=?", (n, p["id"]))
    db().commit()
    return jsonify(id=cur.lastrowid, total=total), 201

@app.get("/api/pedidos/mias")
@requiere()
def pedidos_mios(): return jsonify(filas("SELECT id,total,estado,creada FROM pedidos WHERE usuario_id=? ORDER BY id DESC", session["uid"]))

# ---------- Donaciones ----------
@app.post("/api/donaciones")
@requiere()
def donar():
    d = cuerpo(); m = entero(d, "monto")
    if m < 1: return err("El monto debe ser mayor que cero")
    db().execute("INSERT INTO donaciones(usuario_id,fundacion,monto) VALUES(?,?,?)", (session["uid"], texto(d, "fundacion", False), m)); db().commit()
    return jsonify(ok=True), 201

# ---------- Membresía y sellos ----------
def sellos_de(uid, estado):
    return db().execute("SELECT COUNT(*) FROM sellos WHERE usuario_id=? AND estado=?", (uid, estado)).fetchone()[0]

@app.get("/api/membresia")
@requiere("usuario")
def membresia():
    u = session["uid"]
    return jsonify(activa=bool(db().execute("SELECT 1 FROM membresias WHERE usuario_id=?", (u,)).fetchone()),
                   sellos=sellos_de(u, "Verificado"), pendientes=sellos_de(u, "Pendiente"))

@app.post("/api/membresia")
@requiere("usuario")
def membresia_activar():
    db().execute("INSERT OR IGNORE INTO membresias(usuario_id) VALUES(?)", (session["uid"],)); db().commit()
    return jsonify(activa=True), 201

@app.post("/api/sellos")
@requiere("usuario")
def sello_registrar():
    if sellos_de(session["uid"], "Pendiente"): return err("Ya tienes un registro pendiente de verificación", 409)
    db().execute("INSERT INTO sellos(usuario_id,tipo) VALUES(?,?)", (session["uid"], texto(cuerpo(), "tipo", False) or "Vacunación al día")); db().commit()
    return jsonify(estado="Pendiente"), 201

@app.get("/api/sellos")
@requiere("admin")
def sellos():
    return jsonify(registros=filas("SELECT s.id,s.tipo,s.estado,u.nombre FROM sellos s JOIN usuarios u ON u.id=s.usuario_id ORDER BY s.id DESC"),
                   membresias=filas("""SELECT u.nombre,(SELECT COUNT(*) FROM sellos s WHERE s.usuario_id=u.id AND s.estado='Verificado') AS sellos
                                       FROM membresias m JOIN usuarios u ON u.id=m.usuario_id"""))

@app.patch("/api/sellos/<int:i>")
@requiere("admin")
def sello_resolver(i):
    est = cuerpo().get("estado")
    if est not in ("Verificado", "Rechazado"): return err("Estado no válido")
    cur = db().execute("UPDATE sellos SET estado=? WHERE id=?", (est, i)); db().commit()
    return jsonify(ok=True) if cur.rowcount else err("No existe", 404)

# ---------- Estadísticas del administrador ----------
def uno(q): return db().execute(q).fetchone()[0] or 0

@app.get("/api/admin/resumen")
@requiere("admin")
def resumen():
    return jsonify(ventas=uno("SELECT SUM(total) FROM pedidos"), donaciones=uno("SELECT SUM(monto) FROM donaciones"),
                   pedidos=uno("SELECT COUNT(*) FROM pedidos"),
                   nuevas=uno("SELECT COUNT(*) FROM adopciones WHERE estado='Pendiente'") + uno("SELECT COUNT(*) FROM citas WHERE estado='Solicitada'")
                          + uno("SELECT COUNT(*) FROM sellos WHERE estado='Pendiente'"))

@app.get("/api/admin/movimientos")
@requiere("admin")
def movimientos():
    return jsonify(filas("""SELECT 'Pedido #P-' || printf('%04d', id) AS titulo, 'Tienda' AS detalle, total AS valor, creada FROM pedidos
      UNION ALL SELECT 'Donación', fundacion, monto, creada FROM donaciones ORDER BY creada DESC LIMIT 20"""))

@app.get("/")
def raiz(): return app.send_static_file("index.html")

iniciar_db()
if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1")
