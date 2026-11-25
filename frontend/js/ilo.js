/* ilo & oli - conexión con la API REST: sesión real, CRUD admin y solicitudes.
   Se carga ANTES del script inline para interceptar el clic de login/registro. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var estado = { usuario: null, editar: null };
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function api(metodo, url, cuerpo) {
    return fetch(url, { method: metodo, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined })
      .then(function (r) { return r.status === 204 ? {} : r.json().then(function (d) { if (!r.ok) { var e = new Error(d.error || 'Error'); e.status = r.status; throw e; } return d; }); });
  }
  function aviso(donde, msg) {
    var a = donde.querySelector('.error-api');
    if (!a) { a = document.createElement('p'); a.className = 'error-api'; a.setAttribute('role', 'alert'); a.style.cssText = 'color:#b3261e;font-weight:600'; donde.insertBefore(a, donde.firstChild); }
    a.textContent = msg || ''; a.hidden = !msg;
  }
  function ir(id) { window.iloApp && window.iloApp.irA(id); }
  var val = function (id) { var e = $(id); return e ? e.value.trim() : ''; };

  /* ---------- Acciones por data-accion (antes que el script inline) ---------- */
  document.addEventListener('click', function (e) {
    var lab = e.target.closest && e.target.closest('[data-accion]');
    if (!lab) return;
    var accion = lab.getAttribute('data-accion'), panel = lab.closest('.panel') || lab.parentNode;
    if (!/^(login|registro|logout|adoptar|perfil|guardar-mascota|guardar-producto)$/.test(accion)) return;
    if (accion === 'logout') { api('POST', '/api/logout').catch(function () {}); estado.usuario = null; return; }

    e.preventDefault(); e.stopImmediatePropagation();
    var tarea;
    if (accion === 'login') tarea = api('POST', '/api/login', { correo: val('li-correo'), clave: $('li-clave').value });
    else if (accion === 'registro') tarea = api('POST', '/api/registro', { nombre: val('re-nombre'), correo: val('re-correo'), clave: $('re-clave').value });
    else if (accion === 'adoptar') {
      var sec = lab.closest('.vista'), m = lab.getAttribute('data-mascota');
      tarea = api('POST', '/api/adopciones', { mascota: m, vivienda: sec.querySelector('select').value, observaciones: sec.querySelector('textarea').value });
    } else if (accion === 'perfil') tarea = api('PUT', '/api/perfil', { nombre: val('pf-nombre') });
    else if (accion === 'guardar-mascota') {
      var dm = { nombre: val('mn-nombre'), tipo: val('mn-tipo'), edad: val('mn-edad'), tamano: val('mn-tamano'), fundacion: val('mn-fundacion'), salud: val('mn-salud'), temperamento: val('mn-temp') };
      tarea = estado.editar && estado.editar.t === 'm' ? api('PUT', '/api/mascotas/' + estado.editar.id, dm) : api('POST', '/api/mascotas', dm);
    } else if (accion === 'guardar-producto') {
      var dp = { nombre: val('pn-nombre'), categoria: val('pn-categoria'), marca: val('pn-marca'), presentacion: val('pn-presentacion'), precio: val('pn-precio'), stock: val('pn-stock'), descripcion: val('pn-desc') };
      tarea = estado.editar && estado.editar.t === 'p' ? api('PUT', '/api/productos/' + estado.editar.id, dp) : api('POST', '/api/productos', dp);
    } else return;

    tarea.then(function (r) {
      aviso(panel, '');
      if (accion === 'login' || accion === 'registro') { estado.usuario = r; window.iloApp.entrar(r.rol); }
      else { estado.editar = null; ir(lab.getAttribute('data-ir')); }
    }).catch(function (er) {
      aviso(panel, er.message);
      if (er.status === 401 && accion === 'adoptar') ir('v-acceso');
    });
  }, true);

  /* Editar / borrar / stock / resolver (botones generados) */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button[data-act]');
    if (!b) return;
    var id = b.getAttribute('data-id'), act = b.getAttribute('data-act'), fila = b.closest('.fila-admin, .panel');
    var fallo = function (er) { aviso(fila.parentNode, er.message); };
    if (act === 'del-m' && confirm('¿Eliminar esta mascota?')) api('DELETE', '/api/mascotas/' + id).then(pintarInventarios, fallo);
    else if (act === 'del-p' && confirm('¿Eliminar este producto?')) api('DELETE', '/api/productos/' + id).then(pintarInventarios, fallo);
    else if (act === 'stock') api('PATCH', '/api/productos/' + id + '/stock', { unidades: $('un-' + id).value }).then(function () { ir('v-adm-conf-inventario'); }, fallo);
    else if (act === 'resolver') {
      var est = b.getAttribute('data-est');
      api('PATCH', '/api/adopciones/' + id, { estado: est }).then(function () { ir(est === 'Aprobada' ? 'v-adm-conf-aprobada' : 'v-adm-conf-rechazada'); }, fallo);
    } else if (act === 'edit-m') {
      api('GET', '/api/mascotas').then(function (l) {
        var m = l.filter(function (x) { return String(x.id) === id; })[0]; if (!m) return;
        estado.editar = { t: 'm', id: id };
        ['nombre', 'tipo', 'edad', 'tamano', 'fundacion', 'salud'].forEach(function (c) { if ($('mn-' + c)) $('mn-' + c).value = m[c] || ''; });
        $('mn-temp').value = m.temperamento || ''; ir('v-adm-mascota-nueva');
      });
    } else if (act === 'edit-p') {
      api('GET', '/api/productos').then(function (l) {
        var p = l.filter(function (x) { return String(x.id) === id; })[0]; if (!p) return;
        estado.editar = { t: 'p', id: id };
        $('pn-nombre').value = p.nombre; $('pn-categoria').value = p.categoria; $('pn-marca').value = p.marca || '';
        $('pn-presentacion').value = p.presentacion || ''; $('pn-precio').value = p.precio; $('pn-stock').value = p.stock; $('pn-desc').value = p.descripcion || '';
        ir('v-adm-producto-nuevo');
      });
    }
  });
  /* "Agregar ..." parte de un formulario limpio */
  document.addEventListener('click', function (e) {
    var l = e.target.closest && e.target.closest('[data-ir="v-adm-mascota-nueva"],[data-ir="v-adm-producto-nuevo"]');
    if (l && !l.hasAttribute('data-accion')) { estado.editar = null; document.querySelectorAll('#adm-mascota-nueva input,#adm-mascota-nueva textarea,#adm-producto-nuevo input,#adm-producto-nuevo textarea').forEach(function (i) { i.value = ''; }); }
  });

  /* ---------- Vistas dinámicas ---------- */
  function despuesDe(titulo, html) {
    var s = titulo.nextElementSibling;
    while (s && s.classList.contains('fila-admin')) { var n = s.nextElementSibling; s.remove(); s = n; }
    titulo.insertAdjacentHTML('afterend', html);
  }
  function pintarInventarios() {
    var cont = document.querySelector('#adm-inventarios .admin-contenido'); if (!cont) return;
    var tit = cont.querySelectorAll('.bloque-titulo');
    Promise.all([api('GET', '/api/mascotas'), api('GET', '/api/productos')]).then(function (r) {
      despuesDe(tit[0], r[0].map(function (m) {
        return '<div class="fila-admin"><div class="info"><b>' + esc(m.nombre) + '</b><span>' + esc(m.tipo) + ' · ' + esc(m.edad) + '</span></div><span class="estado">' + esc(m.estado) + '</span>' +
          '<button type="button" class="btn chico borde" data-act="edit-m" data-id="' + m.id + '" aria-label="Editar ' + esc(m.nombre) + '">Editar</button>' +
          '<button type="button" class="btn chico borde" data-act="del-m" data-id="' + m.id + '" aria-label="Eliminar ' + esc(m.nombre) + '">Eliminar</button></div>';
      }).join(''));
      despuesDe(tit[1], r[1].map(function (p) {
        return '<div class="fila-admin"><div class="info"><b>' + esc(p.nombre) + '</b><span>' + esc(p.categoria) + ' · Stock: ' + p.stock + ' unidades</span></div>' +
          '<label class="sr-only" for="un-' + p.id + '">Unidades a agregar de ' + esc(p.nombre) + '</label><input id="un-' + p.id + '" type="number" min="1" inputmode="numeric" placeholder="Unidades">' +
          '<button type="button" class="btn chico borde" data-act="stock" data-id="' + p.id + '" aria-label="Agregar unidades de ' + esc(p.nombre) + '">Agregar unidades</button>' +
          '<button type="button" class="btn chico borde" data-act="edit-p" data-id="' + p.id + '" aria-label="Editar ' + esc(p.nombre) + '">Editar</button>' +
          '<button type="button" class="btn chico borde" data-act="del-p" data-id="' + p.id + '" aria-label="Eliminar ' + esc(p.nombre) + '">Eliminar</button></div>';
      }).join(''));
    }).catch(function (er) { aviso(cont, er.message); });
  }
  function pintarSolicitudes() {
    var cont = document.querySelector('#adm-solicitudes .admin-contenido'); if (!cont) return;
    api('GET', '/api/adopciones').then(function (l) {
      cont.querySelectorAll('.panel.panel-ancho').forEach(function (p) { p.remove(); });
      cont.insertAdjacentHTML('beforeend', l.map(function (a) {
        var pend = a.estado === 'Pendiente';
        return '<div class="panel panel-ancho" style="margin-bottom:14px"><div class="rend-cab"><h3>Adopción de ' + esc(a.mascota) + '</h3><span class="estado' + (pend ? ' pendiente' : a.estado === 'Rechazada' ? ' rechazada' : '') + '">' + esc(a.estado) + '</span></div>' +
          '<dl><dt>Santuario / fundación</dt><dd>' + esc(a.fundacion) + '</dd><dt>Solicitante</dt><dd>' + esc(a.solicitante) + '</dd><dt>Correo</dt><dd>' + esc(a.correo) + '</dd><dt>Tipo de vivienda</dt><dd>' + esc(a.vivienda) + '</dd></dl>' +
          (pend ? '<div class="botones" style="margin-top:14px"><button type="button" class="btn chico" data-act="resolver" data-est="Aprobada" data-id="' + a.id + '" aria-label="Aprobar solicitud de ' + esc(a.mascota) + '">Aprobar</button>' +
            '<button type="button" class="btn chico borde" data-act="resolver" data-est="Rechazada" data-id="' + a.id + '" aria-label="Rechazar solicitud de ' + esc(a.mascota) + '">Rechazar</button></div>' : '') + '</div>';
      }).join('') || '<p>No hay solicitudes todavía.</p>');
    }).catch(function (er) { aviso(cont, er.message); });
  }
  function pintarCuenta() {
    if (!estado.usuario || estado.usuario.rol !== 'usuario') return;
    if ($('pf-nombre')) $('pf-nombre').value = estado.usuario.nombre; if ($('pf-correo')) $('pf-correo').value = estado.usuario.correo;
    if (window.ILO.estados) window.ILO.estados();
  }
  document.addEventListener('change', function (e) {
    var id = e.target.id; if (!e.target.classList || !e.target.classList.contains('pantalla')) return;
    if (id === 'v-adm-inventarios') pintarInventarios();
    else if (id === 'v-adm-solicitudes') pintarSolicitudes();
    else if (id === 'v-cuenta') pintarCuenta();
  });

  window.ILO = { api: api, esc: esc, aviso: aviso, ir: ir, val: val, estado: estado, despuesDe: despuesDe };

  /* Restaurar sesión al recargar (la cookie la mantiene el servidor) */
  window.addEventListener('load', function () {
    api('GET', '/api/sesion').then(function (s) { if (s.rol && window.iloApp) { estado.usuario = s; window.iloApp.fijarSesion(s.rol); pintarCuenta(); } }).catch(function () {});
  });
})();
