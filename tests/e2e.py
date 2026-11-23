import sys
from playwright.sync_api import sync_playwright
page_name = sys.argv[1]
errs=[]
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width":1280,"height":900} if page_name=="index.html" else {"width":390,"height":844}); pg = ctx.new_page(); pg.set_default_timeout(4000)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type=="error" and "Failed to load resource" not in m.text else None)
    pg.goto(f"http://127.0.0.1:5000/{page_name}"); pg.wait_for_timeout(600)
    def vis(sel): return pg.locator(sel).first.is_visible()
    def go(rid): pg.evaluate(f"window.iloApp.irA('{rid}')"); pg.wait_for_timeout(350)
    def clk(sel): pg.locator(sel).first.click(); pg.wait_for_timeout(450)
    ok=lambda n,c: print(("OK  " if c else "FALLA"), n)
    ok("catálogo mascotas (8)", (go("v-mascotas") or True) and pg.locator("#mascotas .tarjeta").count()==8)
    ok("tienda (9)", (go("v-tienda") or True) and pg.locator("#tienda .tarjeta").count()==9)
    ok("vets (4)", (go("v-veterinarias") or True) and pg.locator("#veterinarias .tarjeta").count()==4)
    # filtro por servicio en veterinarias (Peluquería => 3)
    pg.locator("#veterinarias .chip", has_text="Peluquería").click(); pg.wait_for_timeout(200)
    ok("filtro vets Peluquería (3 visibles)", pg.locator("#veterinarias .tarjeta:not(.oculto)").count()==3)
    # producto -> carrito
    go("v-tienda"); clk("#tienda .tarjeta >> nth=0")
    ok("detalle producto", vis("#d-producto h2") and "Concentrado" in pg.inner_text("#d-producto h2"))
    clk("#d-producto [data-accion=agregar]"); clk("#carrito [data-act=qty][data-d='1']")
    ok("carrito qty 2 y total $136.000", "136.000" in pg.inner_text("#carrito"))
    # pagar sin sesión => acceso
    clk("#carrito label[for=v-pago]"); ok("pago exige sesión", vis("#li-correo"))
    ok("sin checkbox admin", pg.locator("#li-admin").count()==0)
    # login incorrecto
    pg.fill("#li-correo","x@x.co"); pg.fill("#li-clave","mala"); clk("#acceso [data-accion=login]")
    ok("login inválido muestra error", "incorrectos" in pg.inner_text("#acceso"))
    # registro
    clk("#tab-a-registro") if pg.locator("#tab-a-registro").count() else None
    pg.fill("#re-nombre","Camila Ríos"); pg.fill("#re-correo","cami@correo.com"); pg.fill("#re-clave","clave12345"); clk("#registro [data-accion=registro]")
    ok("tras registro vuelve al PAGO", vis("#pago h2"))
    # pagar
    pg.select_option("#pg-metodo", index=0); clk("#pago [data-accion=pagar]")
    ok("valida tarjeta", "tarjeta" in pg.inner_text("#pago").lower())
    pg.fill("#pg-numero","4111 1111 1111 1111"); pg.fill("#pg-nombre","Camila"); pg.fill("#pg-venc","12/30"); pg.fill("#pg-cvv","123"); clk("#pago [data-accion=pagar]")
    ok("pedido confirmado", vis("#conf-pedido") and "#P-0001" in pg.inner_text("#conf-pedido"))
    # adopción
    go("v-mascotas"); clk("#mascotas .tarjeta >> nth=1"); ok("detalle Rocco", "Rocco" in pg.inner_text("#d-mascota h2"))
    clk("#d-mascota label[for=v-d-form-adopcion]"); pg.fill("#ad-d-obs","Tengo patio"); clk("#d-form-adopcion [data-accion=adoptar]")
    ok("adopción registrada", vis("#conf-adopcion"))
    # cita
    go("v-veterinarias"); clk("#veterinarias .tarjeta >> nth=0"); clk("#d-vet label[data-svc] >> nth=1")
    ok("servicio preseleccionado Vacunación", "Vacunación" in pg.eval_on_selector("#ct-d-servicio","e=>e.options[e.selectedIndex].text"))
    pg.fill("#ct-d-fecha","2030-05-20"); pg.fill("#ct-d-hora","10:00"); clk("#d-form-cita [data-accion=cita]"); ok("cita solicitada", vis("#conf-cita"))
    # donación
    go("v-donaciones"); clk(".montos .chip >> nth=1"); ok("chip llena monto", pg.input_value("#do-monto")=="50000"); clk("#donaciones [data-accion=donar]"); ok("donación", vis("#conf-donacion"))
    # membresía y sello
    go("v-membresia"); pg.wait_for_timeout(300); clk("#membresia [data-accion=activar]"); go("v-membresia"); pg.wait_for_timeout(300)
    ok("membresía Activa", "Activa" in pg.inner_text("#membresia .panel >> nth=0"))
    clk("#membresia [data-accion=sello]"); ok("sello enviado", vis("#conf-sello"))
    go("v-cuenta"); pg.wait_for_timeout(500); t=pg.inner_text("#cuenta")
    ok("Mi cuenta: adopción+pedido+cita", all(x in t for x in ("Rocco","#P-0001","Cita")))
    clk("#cuenta [data-accion=logout]"); ok("logout vuelve a inicio", vis("#inicio h1"))
    go("v-acceso")
    # admin
    pg.fill("#li-correo","admin@iloyoli.co"); pg.fill("#li-clave","Admin123!"); clk("#acceso [data-accion=login]")
    ok("admin entra al panel", vis("#adm-resumen h2"))
    pg.wait_for_timeout(400); k=pg.inner_text("#adm-resumen .kpis"); ok("KPIs reales (ventas 136.000, 3 nuevas)", "136.000" in k and "3" in k)
    go("v-adm-solicitudes"); pg.wait_for_timeout(600)
    clk("#adm-solicitudes [data-act=resolver][data-est=Aprobada]"); ok("aprobar adopción", vis("#adm-conf-aprobada"))
    go("v-adm-solicitudes"); pg.wait_for_timeout(500); clk("#adm-citas [data-act=cita-est][data-est=Confirmada]"); pg.wait_for_timeout(400)
    ok("confirmar cita", "Confirmada" in pg.inner_text("#adm-citas"))
    go("v-adm-sellos"); pg.wait_for_timeout(500); clk("#adm-sellos [data-act=sello-est][data-est=Verificado]"); pg.wait_for_timeout(400)
    ok("verificar sello -> 1 de 6", "1 de 6" in pg.inner_text("#adm-sellos"))
    go("v-adm-ingresos"); pg.wait_for_timeout(500); ok("ingresos con pedido y donación", "P-0001" in pg.inner_text("#adm-ingresos") and "Donación" in pg.inner_text("#adm-ingresos"))
    # CRUD
    go("v-adm-inventarios"); pg.wait_for_timeout(500); clk("#adm-inventarios label[for=v-adm-mascota-nueva]")
    pg.fill("#mn-nombre","Zeus"); pg.fill("#mn-edad","2 años"); pg.fill("#mn-salud","Sano"); pg.fill("#mn-temp","Noble"); clk("#adm-mascota-nueva [data-accion=guardar-mascota]")
    ok("crear mascota", vis("#adm-conf-inventario"))
    go("v-adm-inventarios"); pg.wait_for_timeout(500); clk("#adm-inventarios [data-act=edit-m] >> nth=-1"); pg.fill("#mn-nombre","Zeus II"); clk("#adm-mascota-nueva [data-accion=guardar-mascota]")
    go("v-adm-inventarios"); pg.wait_for_timeout(500); ok("editar mascota", "Zeus II" in pg.inner_text("#adm-inventarios"))
    pg.on("dialog", lambda d: d.accept()); clk("#adm-inventarios [data-act=del-m] >> nth=-1"); pg.wait_for_timeout(400)
    ok("eliminar mascota", "Zeus II" not in pg.inner_text("#adm-inventarios"))
    pg.fill("#un-1","10"); clk("#adm-inventarios [data-act=stock] >> nth=0"); ok("sumar stock", vis("#adm-conf-inventario"))
    go("v-inicio"); pg.wait_for_timeout(500); ok("Rocco ya no está en catálogo público (aprobada)", "Rocco" not in pg.inner_text("#inicio .grilla >> nth=0") )
    pg.screenshot(path=f"/tmp/{page_name}.png")
    b.close()
print("ERRORES JS:", errs or "ninguno")
