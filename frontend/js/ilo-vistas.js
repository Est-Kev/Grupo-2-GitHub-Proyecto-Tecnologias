/* ilo & oli - vistas conectadas a la API: catálogos, detalle, carrito, pago, citas, donaciones,
   membresía/sellos y el resto del panel de administración. Requiere js/ilo.js (window.ILO). */
(function () {
  var I = window.ILO, api = I.api, esc = I.esc, aviso = I.aviso, ir = I.ir;
  var $ = function (id) { return document.getElementById(id); };
  var D = { m: [], p: [], v: [] }, sel = {}, carrito = [];
  try { carrito = JSON.parse(localStorage.getItem('ilo_carrito') || '[]'); } catch (e) { carrito = []; }
  var money = function (n) { return '$' + Number(n || 0).toLocaleString('es-CO'); };
  var pad = function (n) { return ('0000' + n).slice(-4); };
  var ic = function (n) { return '<svg class="icon" aria-hidden="true" focusable="false"><use href="#' + n + '"/></svg>'; };
  var por = function (lista, id) { return lista.filter(function (x) { return String(x.id) === String(id); })[0]; };
  var volver = function (a, t) { return '<label class="volver" for="' + a + '" role="link" tabindex="0">' + ic('atras') + ' ' + t + '</label>'; };
  /* movil.html usa su propio set de imágenes (sufijo -movil); si aún no existe, cae a la de escritorio */
  var SUF = /movil/i.test(location.pathname) ? '-movil' : '';
  var img = function (b, alt, mini) {
    if (!b) return '';
    var base = b + (mini ? '-mini' : '');
    return '<img src="img/' + base + SUF + '.jpg" alt="' + esc(alt) + '" loading="lazy" onerror="if(!this.dataset.f&&\'' + SUF + '\'){this.dataset.f=1;this.src=\'img/' + base + '.jpg\'}else{this.remove()}">';
  };
  var cls = function (e) { return /^(Pendiente|Solicitada)$/.test(e) ? ' pendiente' : /^(Rechazad[ao]|Cancelada)$/.test(e) ? ' rechazada' : ''; };

  /* ---- vistas dinámicas: radio + sección (el CSS de dinamico.css las muestra) ---- */
  var main = document.querySelector('main');
  [['d-mascota', 'Detalle de mascota'], ['d-form-adopcion', 'Solicitud de adopción'], ['d-producto', 'Detalle de producto'],
   ['d-vet', 'Detalle de veterinaria'], ['d-form-cita', 'Solicitud de cita']].forEach(function (v) {
    var r = document.createElement('input');
    r.type = 'radio'; r.name = 'pantalla'; r.id = 'v-' + v[0]; r.className = 'pantalla'; r.tabIndex = -1; r.setAttribute('aria-hidden', 'true');
    main.insertAdjacentElement('beforebegin', r);
    var s = document.createElement('section'); s.className = 'vista'; s.id = v[0]; s.setAttribute('aria-label', v[1]); main.appendChild(s);
  });

  /* ---- catálogos ---- */
  function tarjeta(k, vista, id, tag, foto, titulo, metas, tags) {
    return '<label class="tarjeta" for="v-d-' + vista + '" data-k="' + k + '" data-id="' + id + '" role="link" tabindex="0"' + (tags ? ' data-tags="' + esc(tags) + '"' : '') + '><div class="imagen">' +
      (tag ? '<span class="tag">' + esc(tag) + '</span>' : '') + foto + '</div><div class="texto"><h4>' + esc(titulo) + '</h4>' +
      metas.map(function (m) { return '<div class="meta">' + esc(m) + '</div>'; }).join('') + '</div></label>';
  }
  var cM = function (m) { return tarjeta('m', 'mascota', m.id, m.tipo, img(m.imagen, 'Foto de ' + m.nombre, 1), m.nombre, [m.tipo + ' · ' + m.edad]); };
  var cP = function (p) { return tarjeta('p', 'producto', p.id, p.categoria, img(p.imagen, p.nombre, 0), p.nombre, [p.categoria + ' · ' + money(p.precio) + (p.stock < 1 ? ' · Agotado' : '')]); };
  var cV = function (v) { return tarjeta('v', 'vet', v.id, v.urgencias ? 'Atiende urgencias' : '', img(v.imagen, 'Fachada de ' + v.nombre, 0), v.nombre, [v.direccion, v.horario], v.servicios.map(function (s) { return s.nombre; }).join('|')); };
  function grilla(q, arr, fn) { var g = document.querySelector(q); if (g) g.innerHTML = arr.map(fn).join(''); }
  function disponibles() { return D.m.filter(function (m) { return m.estado === 'Disponible'; }); }
  function renderCatalogos() {
    var ms = disponibles();
    grilla('#mascotas .grilla', ms, cM); grilla('#tienda .grilla', D.p, cP); grilla('#veterinarias .grilla', D.v, cV);
    var h = document.querySelectorAll('#inicio .grilla');
    if (h[0]) h[0].innerHTML = ms.slice(0, 3).map(cM).join('');
    if (h[1]) h[1].innerHTML = D.p.slice(0, 3).map(cP).join('');
    var c = document.querySelectorAll('#inicio .cifras strong');
    if (c.length >= 3) { c[0].textContent = ms.length; c[1].textContent = D.v.length; c[2].textContent = D.p.length; }
  }
  function cargar() {
    return Promise.all([api('GET', '/api/mascotas'), api('GET', '/api/productos'), api('GET', '/api/veterinarias')])
      .then(function (r) { D.m = r[0]; D.p = r[1]; D.v = r[2]; renderCatalogos(); }).catch(function () {});
  }

  /* ---- detalles y formularios ---- */
  function otras(lista, fn, actual) { return '<section class="bloque"><div class="bloque-titulo"><h2>Más para explorar</h2></div><div class="grilla">' + lista.filter(function (x) { return x.id !== actual; }).slice(0, 2).map(fn).join('') + '</div></section>'; }
  function dM() {
    var m = por(D.m, sel.id), s = $('d-mascota');
    if (!m) { s.innerHTML = volver('v-mascotas', 'Volver al catálogo') + '<p>No encontramos esta mascota.</p>'; return; }
    s.setAttribute('aria-label', 'Detalle de mascota: ' + m.nombre);
    s.innerHTML = volver('v-mascotas', 'Volver al catálogo') + '<div class="detalle"><div class="foto">' + img(m.imagen, 'Foto de ' + m.nombre, 0) + '</div><div><h2>' + esc(m.nombre) + '</h2><div>' +
      '<span class="badge">' + ic('paw') + ' ' + esc(m.tipo) + '</span><span class="badge">' + ic('reloj') + ' ' + esc(m.edad) + '</span><span class="badge">' + ic('check') + ' ' + esc(m.estado) + '</span></div>' +
      '<dl><dt>Santuario / fundación</dt><dd>' + esc(m.fundacion) + '</dd><dt>Estado de salud</dt><dd>' + esc(m.salud) + '</dd><dt>Tamaño</dt><dd>' + esc(m.tamano) + '</dd><dt>Temperamento</dt><dd>' + esc(m.temperamento) + '</dd></dl>' +
      (m.estado === 'Disponible' ? '<label class="btn miel" for="v-d-form-adopcion" role="link" tabindex="0">' + ic('corazon') + ' Solicitar adopción</label>' : '<p>Esta mascota ya fue adoptada.</p>') +
      '</div></div>' + otras(disponibles(), cM, m.id);
  }
  function dFA() {
    var m = por(D.m, sel.id), s = $('d-form-adopcion'), u = I.estado.usuario || {};
    if (!m) { s.innerHTML = '<p>Elige una mascota primero.</p>'; return; }
    s.setAttribute('aria-label', 'Solicitud de adopción: ' + m.nombre);
    s.innerHTML = volver('v-d-mascota', 'Volver al detalle') + '<h2>Formulario de solicitud de adopción</h2><p>Completa tus datos para iniciar el contacto con la fundación correspondiente.</p>' +
      '<p style="font-weight:600; color:var(--verde)">Adopción de: ' + esc(m.nombre) + '</p><div class="panel">' +
      '<div class="campo"><label for="ad-d-nombre">Nombre completo</label><input id="ad-d-nombre" type="text" value="' + esc(u.nombre || '') + '" readonly></div>' +
      '<div class="campo"><label for="ad-d-viv">Tipo de vivienda</label><select id="ad-d-viv"><option>Casa con patio</option><option>Apartamento</option></select></div>' +
      '<div class="campo"><label for="ad-d-obs">Observaciones</label><textarea id="ad-d-obs" rows="3" placeholder="Cuéntale a la fundación por qué quieres adoptar"></textarea></div>' +
      '<label class="btn ancho" data-accion="adoptar" data-mascota="' + esc(m.nombre) + '" for="v-conf-adopcion" role="button" tabindex="0">Enviar solicitud</label></div>';
  }
  function dP() {
    var p = por(D.p, sel.id), s = $('d-producto');
    if (!p) { s.innerHTML = volver('v-tienda', 'Volver al catálogo') + '<p>No encontramos este producto.</p>'; return; }
    s.setAttribute('aria-label', 'Detalle de producto: ' + p.nombre);
    s.innerHTML = volver('v-tienda', 'Volver al catálogo') + '<div class="detalle"><div class="foto">' + img(p.imagen, p.nombre, 0) + '</div><div><span class="badge">' + esc(p.categoria) + '</span><h2>' + esc(p.nombre) + '</h2>' +
      '<p class="precio">' + money(p.precio) + '</p>' + (p.descripcion ? '<p>' + esc(p.descripcion) + '</p>' : '') +
      '<dl><dt>Marca</dt><dd>' + esc(p.marca) + '</dd><dt>Presentación</dt><dd>' + esc(p.presentacion) + '</dd><dt>Stock disponible</dt><dd>' + p.stock + ' unidades</dd></dl><div class="botones">' +
      (p.stock > 0 ? '<label class="btn miel" data-accion="agregar" data-id="' + p.id + '" for="v-carrito" role="button" tabindex="0">' + ic('bolsa') + ' Agregar al carrito</label>' : '<p><b>Agotado</b></p>') +
      '<label class="btn borde" for="v-carrito" role="link" tabindex="0">Ver carrito</label></div></div></div>' +
      otras(D.p.filter(function (x) { return x.categoria === p.categoria; }), cP, p.id);
  }
  function dV() {
    var v = por(D.v, sel.id), s = $('d-vet');
    if (!v) { s.innerHTML = volver('v-veterinarias', 'Volver al directorio') + '<p>No encontramos este establecimiento.</p>'; return; }
    s.setAttribute('aria-label', 'Detalle de veterinaria: ' + v.nombre);
    s.innerHTML = volver('v-veterinarias', 'Volver al directorio') + '<h2>' + esc(v.nombre) + '</h2><div class="datos">' +
      '<div class="dato"><span class="circulo">' + ic('pin') + '</span>' + esc(v.direccion) + '</div><div class="dato"><span class="circulo">' + ic('telefono') + '</span>' + esc(v.telefono) + '</div>' +
      '<div class="dato"><span class="circulo">' + ic('reloj') + '</span>' + esc(v.horario) + '</div></div><div class="subtitulo">Servicios</div><div>' +
      v.servicios.map(function (x) { return '<span class="badge">' + esc(x.nombre) + '</span>'; }).join('') + '</div><div class="subtitulo">Precios y reserva</div><div style="margin-bottom:22px">' +
      v.servicios.map(function (x) { return '<div class="fila-precio"><span class="nombre">' + esc(x.nombre) + '</span><span class="valor">' + money(x.precio) + '</span><label class="btn chico borde" data-svc="' + x.id + '" for="v-d-form-cita" role="link" tabindex="0" aria-label="Reservar ' + esc(x.nombre) + '">Reservar</label></div>'; }).join('') +
      '</div><label class="btn miel" for="v-d-form-cita" role="link" tabindex="0">' + ic('calendario') + ' Solicitar cita</label>';
  }
  function dFC() {
    var v = por(D.v, sel.id), s = $('d-form-cita');
    if (!v) { s.innerHTML = '<p>Elige un establecimiento primero.</p>'; return; }
    s.setAttribute('aria-label', 'Solicitud de cita: ' + v.nombre);
    s.innerHTML = volver('v-d-vet', 'Volver al establecimiento') + '<h2>Solicitud de cita</h2><p style="font-weight:600; color:var(--verde)">Establecimiento: ' + esc(v.nombre) + '</p><div class="panel">' +
      '<div class="campo"><label for="ct-d-servicio">Servicio</label><select id="ct-d-servicio">' + v.servicios.map(function (x) { return '<option value="' + x.id + '"' + (String(x.id) === String(sel.svc) ? ' selected' : '') + '>' + esc(x.nombre) + ' — ' + money(x.precio) + '</option>'; }).join('') + '</select></div>' +
      '<div class="campo"><label for="ct-d-fecha">Fecha</label><input id="ct-d-fecha" type="date" min="' + new Date().toISOString().slice(0, 10) + '"></div>' +
      '<div class="campo"><label for="ct-d-hora">Hora</label><input id="ct-d-hora" type="time"></div>' +
      '<label class="btn ancho" data-accion="cita" for="v-conf-cita" role="button" tabindex="0">Solicitar cita</label></div>';
  }

  /* ---- carrito y pago (el total real lo calcula el servidor) ---- */
  function guardarCarrito() {
    try { localStorage.setItem('ilo_carrito', JSON.stringify(carrito)); } catch (e) {}
    var n = carrito.reduce(function (a, i) { return a + i.cantidad; }, 0);
    document.querySelectorAll('.contador').forEach(function (c) { c.textContent = n; });
    document.querySelectorAll('[aria-label^="Carrito"]').forEach(function (l) { l.setAttribute('aria-label', 'Carrito, ' + n + ' productos'); });
  }
  function totalCarrito() { return carrito.reduce(function (a, i) { var p = por(D.p, i.id); return a + (p ? p.precio * i.cantidad : 0); }, 0); }
  function pintarCarrito() {
    var panel = $('carrito').querySelector('.panel');
    carrito = carrito.filter(function (i) { return por(D.p, i.id); }); guardarCarrito();
    if (!carrito.length) { panel.innerHTML = '<p>Tu carrito está vacío.</p><label class="btn ancho" for="v-tienda" role="link" tabindex="0">Ir a la tienda</label>'; return; }
    panel.innerHTML = carrito.map(function (i) {
      var p = por(D.p, i.id);
      return '<div class="fila-carrito"><span class="nombre">' + esc(p.nombre) + '</span><div class="cantidad" role="group" aria-label="Cantidad de ' + esc(p.nombre) + '">' +
        '<button type="button" data-act="qty" data-d="-1" data-id="' + p.id + '" aria-label="Disminuir cantidad">–</button><span>' + i.cantidad + '</span><button type="button" data-act="qty" data-d="1" data-id="' + p.id + '" aria-label="Aumentar cantidad">+</button></div>' +
        '<span>' + money(p.precio * i.cantidad) + '</span><button type="button" class="quitar" data-act="quitar" data-id="' + p.id + '" aria-label="Quitar ' + esc(p.nombre) + ' del carrito"><span aria-hidden="true">✕</span></button></div>';
    }).join('') + '<div class="total"><span>Total</span><span>' + money(totalCarrito()) + '</span></div><label class="btn miel ancho" for="v-pago" role="link" tabindex="0">Ir a pagar</label>';
  }
  function pintarPago() { var t = document.querySelector('#pago .total-pago .total span:last-child'); if (t) t.textContent = money(totalCarrito()); }
  function validarPago() {
    if (!carrito.length) return 'Tu carrito está vacío.';
    if (!/tarjeta/i.test($('pg-metodo').value)) return '';
    if (!/^\d{13,19}$/.test($('pg-numero').value.replace(/\s/g, ''))) return 'Revisa el número de tarjeta.';
    if (!$('pg-nombre').value.trim()) return 'Escribe el nombre que aparece en la tarjeta.';
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test($('pg-venc').value.trim())) return 'El vencimiento debe tener el formato MM/AA.';
    if (!/^\d{3,4}$/.test($('pg-cvv').value.trim())) return 'Revisa el CVV.';
    return '';
  }

  /* ---- acciones (se evalúan antes que el script inline, igual que ilo.js) ---- */
  var PROPIAS = ['cita', 'pagar', 'donar', 'activar', 'sello'];
  document.addEventListener('click', function (e) {
    var lab = e.target.closest && e.target.closest('label[data-accion]'); if (!lab) return;
    var a = lab.getAttribute('data-accion');
    if (a === 'agregar') {
      var p = por(D.p, lab.getAttribute('data-id')), it = carrito.filter(function (i) { return String(i.id) === String(p.id); })[0];
      if (it) it.cantidad = Math.min(it.cantidad + 1, p.stock); else carrito.push({ id: p.id, cantidad: 1 });
      guardarCarrito(); return;
    }
    if (PROPIAS.indexOf(a) === -1) return;
    e.preventDefault(); e.stopImmediatePropagation();
    var panel = lab.closest('.panel') || lab.parentNode, dest = lab.getAttribute('for'), tarea, msg = '';
    if (a === 'cita') { if (!$('ct-d-fecha').value || !$('ct-d-hora').value) msg = 'Elige una fecha y una hora.'; else tarea = api('POST', '/api/citas', { servicio_id: $('ct-d-servicio').value, fecha: $('ct-d-fecha').value, hora: $('ct-d-hora').value }); }
    else if (a === 'donar') { if (!($('do-monto').value > 0)) msg = 'Indica el monto de tu donación.'; else tarea = api('POST', '/api/donaciones', { monto: $('do-monto').value, fundacion: $('do-fundacion').value }); }
    else if (a === 'activar') tarea = api('POST', '/api/membresia');
    else if (a === 'sello') tarea = api('POST', '/api/sellos', {});
    else if (a === 'pagar') {
      msg = validarPago();
      if (!msg) tarea = api('POST', '/api/pedidos', { items: carrito.map(function (i) { return { id: i.id, cantidad: i.cantidad }; }), metodo: $('pg-metodo').value }).then(function (r) {
        carrito = []; guardarCarrito();
        $('conf-pedido').querySelector('p').textContent = 'Tu pago fue aprobado y el pedido #P-' + pad(r.id) + ' quedó registrado por un total de ' + money(r.total) + '.';
        return r;
      });
    }
    if (msg) { aviso(panel, msg); return; }
    tarea.then(function () { aviso(panel, ''); ir(dest); }, function (er) {
      aviso(panel, er.message);
      if (er.status === 401) ir('v-acceso'); else if (er.status === 409 || er.status === 404) cargar();
    });
  }, true);

  var PINTAR = {};
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target : e.target.parentNode;
    var card = t.closest('label[data-k]');
    if (card) {
      sel = { k: card.dataset.k, id: card.dataset.id };
      var dest = card.getAttribute('for');           // si ya estás en esa vista el radio no cambia: se repinta a mano
      if ($(dest).checked) { PINTAR[dest](); window.scrollTo(0, 0); }
      return;
    }
    var svc = t.closest('label[data-svc]'); if (svc) sel.svc = svc.getAttribute('data-svc');
    var chip = t.closest('.montos .chip'); if (chip) $('do-monto').value = chip.textContent.replace(/\D/g, '');
    var b = t.closest('button[data-act]'); if (!b) return;
    var act = b.getAttribute('data-act'), id = b.getAttribute('data-id'), est = b.getAttribute('data-est');
    var it = carrito.filter(function (i) { return String(i.id) === String(id); })[0], p = por(D.p, id);
    if (act === 'qty' && it) { it.cantidad = Math.max(1, Math.min(it.cantidad + Number(b.getAttribute('data-d')), p ? p.stock : 99)); pintarCarrito(); }
    else if (act === 'quitar') { carrito = carrito.filter(function (i) { return String(i.id) !== String(id); }); pintarCarrito(); }
    else if (act === 'cita-est') api('PATCH', '/api/citas/' + id, { estado: est }).then(pintarCitas, function (er) { aviso(b.closest('#adm-citas'), er.message); });
    else if (act === 'sello-est') api('PATCH', '/api/sellos/' + id, { estado: est }).then(pintarSellos, function (er) { aviso(b.closest('.admin-contenido'), er.message); });
  });

  /* ---- cuenta, membresía y panel de administración ---- */
  function fila(txt, est) { return '<div class="estado-fila"><span>' + esc(txt) + '</span><span class="estado' + cls(est) + '">' + esc(est) + '</span></div>'; }
  I.estados = function () {
    Promise.all([api('GET', '/api/adopciones/mias'), api('GET', '/api/pedidos/mias'), api('GET', '/api/citas/mias')]).then(function (r) {
      var sec = $('cuenta'); sec.querySelectorAll('.estado-fila, .vacio').forEach(function (f) { f.remove(); });
      var h3 = sec.querySelectorAll('h3'); h3 = h3[h3.length - 1];
      var html = r[0].map(function (a) { return fila('Solicitud de adopción — ' + a.mascota, a.estado); })
        .concat(r[1].map(function (p) { return fila('Pedido #P-' + pad(p.id) + ' · ' + money(p.total), p.estado); }),
                r[2].map(function (c) { return fila('Cita — ' + c.vet + ' · ' + c.servicio + ' (' + c.fecha + ' ' + c.hora + ')', c.estado); })).join('');
      h3.insertAdjacentHTML('afterend', html || '<p class="vacio">Aún no tienes solicitudes, pedidos ni citas.</p>');
    }).catch(function () {});
  };
  function pintarMembresia() {
    api('GET', '/api/membresia').then(function (m) {
      var ps = $('membresia').querySelectorAll('.panel'), b = ps[0].querySelector('.badge'), n = Math.min(m.sellos, 6);
      b.textContent = m.activa ? 'Activa' : 'Inactiva'; b.className = 'badge' + (m.activa ? '' : ' gris');
      ps[0].querySelector('label.btn').hidden = m.activa;
      var sl = ps[1].querySelector('.sellos'); sl.setAttribute('aria-label', n + ' de 6 sellos acumulados');
      sl.innerHTML = [0, 1, 2, 3, 4, 5].map(function (i) { return '<span class="sello' + (i < n ? ' lleno' : '') + '">' + ic('paw') + '</span>'; }).join('');
      var ps2 = ps[1].querySelectorAll('p'); ps2[ps2.length - 1].textContent = n + ' de 6 sellos acumulados.' + (m.pendientes ? ' Tienes un registro pendiente de verificación.' : '') + (n >= 6 ? ' ¡Completaste los 6 sellos! Ya tienes beneficios canjeables.' : '');
    }).catch(function () {});
  }
  function pintarResumen() {
    api('GET', '/api/admin/resumen').then(function (r) {
      var k = document.querySelectorAll('#adm-resumen .kpis > div'); if (k.length < 3) return;
      k[0].querySelector('strong').textContent = money(r.ventas) + ' COP'; k[1].querySelector('strong').textContent = r.nuevas;
      k[2].querySelector('span').textContent = 'Pedidos confirmados'; k[2].querySelector('strong').textContent = r.pedidos;
    }).catch(function () {});
  }
  function pintarIngresos() {
    Promise.all([api('GET', '/api/admin/resumen'), api('GET', '/api/admin/movimientos')]).then(function (r) {
      var k = document.querySelector('#adm-ingresos .kpis'); k.className = 'kpis';
      k.innerHTML = '<div><span>Ventas totales</span><strong>' + money(r[0].ventas) + ' COP</strong></div><div><span>Donaciones recibidas</span><strong>' + money(r[0].donaciones) + ' COP</strong></div>';
      I.despuesDe(document.querySelector('#adm-ingresos .admin-contenido h3'), r[1].map(function (m) {
        return '<div class="fila-admin"><div class="info"><b>' + esc(m.titulo) + '</b><span>' + esc(m.detalle) + '</span></div><span class="valor-fila">' + money(m.valor) + '</span></div>';
      }).join('') || '<p>Aún no hay movimientos.</p>');
    }).catch(function () {});
  }
  function pintarCitas() {
    var cont = document.querySelector('#adm-solicitudes .admin-contenido');
    api('GET', '/api/citas').then(function (l) {
      var box = $('adm-citas'); if (!box) { cont.insertAdjacentHTML('beforeend', '<div id="adm-citas"></div>'); box = $('adm-citas'); }
      box.innerHTML = '<h3 style="margin-top:28px">Citas veterinarias</h3>' + (l.map(function (c) {
        return '<div class="fila-admin"><div class="info"><b>' + esc(c.vet) + ' · ' + esc(c.servicio) + '</b><span>' + esc(c.solicitante) + ' · ' + esc(c.fecha) + ' ' + esc(c.hora) + '</span></div><span class="estado' + cls(c.estado) + '">' + esc(c.estado) + '</span>' +
          (c.estado === 'Solicitada' ? '<div class="acciones"><button type="button" class="btn chico" data-act="cita-est" data-est="Confirmada" data-id="' + c.id + '" aria-label="Confirmar cita de ' + esc(c.solicitante) + '">Confirmar</button>' +
            '<button type="button" class="btn chico borde" data-act="cita-est" data-est="Cancelada" data-id="' + c.id + '" aria-label="Cancelar cita de ' + esc(c.solicitante) + '">Cancelar</button></div>' : '') + '</div>';
      }).join('') || '<p>No hay citas todavía.</p>');
    }).catch(function () {});
  }
  function pintarSellos() {
    api('GET', '/api/sellos').then(function (r) {
      var h = document.querySelectorAll('#adm-sellos .admin-contenido h3');
      I.despuesDe(h[0], r.registros.map(function (s) {
        return '<div class="fila-admin"><div class="info"><b>' + esc(s.nombre) + '</b><span>' + esc(s.tipo) + '</span></div><span class="estado' + cls(s.estado) + '">' + esc(s.estado) + '</span>' +
          (s.estado === 'Pendiente' ? '<div class="acciones"><button type="button" class="btn chico" data-act="sello-est" data-est="Verificado" data-id="' + s.id + '" aria-label="Verificar registro de ' + esc(s.nombre) + '">Verificar</button>' +
            '<button type="button" class="btn chico borde" data-act="sello-est" data-est="Rechazado" data-id="' + s.id + '" aria-label="Rechazar registro de ' + esc(s.nombre) + '">Rechazar</button></div>' : '') + '</div>';
      }).join('') || '<p>No hay registros por verificar.</p>');
      I.despuesDe(h[1], r.membresias.map(function (m) {
        return '<div class="fila-admin"><div class="info"><b>' + esc(m.nombre) + '</b><span>' + m.sellos + ' de 6 sellos</span></div><span class="estado">Activa</span></div>';
      }).join('') || '<p>Aún no hay membresías activas.</p>');
    }).catch(function () {});
  }

  Object.assign(PINTAR, { 'v-d-mascota': dM, 'v-d-form-adopcion': dFA, 'v-d-producto': dP, 'v-d-vet': dV, 'v-d-form-cita': dFC, 'v-carrito': pintarCarrito, 'v-pago': pintarPago,
    'v-membresia': pintarMembresia, 'v-adm-resumen': pintarResumen, 'v-adm-ingresos': pintarIngresos, 'v-adm-solicitudes': pintarCitas, 'v-adm-sellos': pintarSellos });
  var CATALOGO = ['v-inicio', 'v-mascotas', 'v-tienda', 'v-veterinarias'];
  document.addEventListener('change', function (e) {
    if (!e.target.classList || !e.target.classList.contains('pantalla')) return;
    var id = e.target.id;
    if (CATALOGO.indexOf(id) !== -1) cargar();
    if (PINTAR[id]) PINTAR[id]();
  });
  window.addEventListener('load', function () { guardarCarrito(); cargar().then(function () { var r = document.querySelector('input.pantalla:checked'); if (r && PINTAR[r.id]) PINTAR[r.id](); }); });
})();
