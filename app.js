
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  const CFG = typeof CONFIG === "object" && CONFIG ? CONFIG : {};
  const configurado = (v) => typeof v === "string" && /^https:\/\//.test(v.trim());

  const reduceMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scrollSuave = reduceMovimiento ? "auto" : "smooth";

  function hoyISO() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  function fechaLarga(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return iso || "";
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  /* ---------- Pestañas ---------- */
  const tabs = Array.from(document.querySelectorAll(".tab"));
  const vistas = { agendar: $("#vista-agendar"), agenda: $("#vista-agenda") };

  function mostrarVista(nombre, { foco = false } = {}) {
    if (!vistas[nombre]) nombre = "agendar";
    tabs.forEach((t) => {
      const activa = t.dataset.vista === nombre;
      t.classList.toggle("is-active", activa);
      t.setAttribute("aria-selected", String(activa));
      t.tabIndex = activa ? 0 : -1;
      if (activa && foco) t.focus();
    });
    Object.keys(vistas).forEach((k) => (vistas[k].hidden = k !== nombre));
    if (location.hash !== "#" + nombre) history.replaceState(null, "", "#" + nombre);
    if (nombre === "agenda") cargarAgenda();
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => mostrarVista(t.dataset.vista));
    t.addEventListener("keydown", (ev) => {
      let j = null;
      if (ev.key === "ArrowRight") j = (i + 1) % tabs.length;
      else if (ev.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
      else if (ev.key === "Home") j = 0;
      else if (ev.key === "End") j = tabs.length - 1;
      if (j === null) return;
      ev.preventDefault();
      mostrarVista(tabs[j].dataset.vista, { foco: true });
    });
  });

  /* ---------- Vista 1: agendar ---------- */
  const form = $("#form-cita");
  const btnEnviar = $("#btn-enviar");
  const btnLimpiar = $("#btn-limpiar");
  const errorBox = $("#form-error");
  const aviso = $("#form-aviso");
  const resultado = $("#resultado");
  const botonesCaso = document.querySelectorAll("[data-caso]");
  const CAMPOS = ["propietario", "correo", "mascota", "especie", "servicio", "fecha", "hora"];
  const TIMEOUT_MS = 45000;

  function marcar(el, invalido) {
    el.classList.toggle("is-invalid", invalido);
    if (invalido) {
      el.setAttribute("aria-invalid", "true");
      el.setAttribute("aria-describedby", "form-error");
    } else {
      el.removeAttribute("aria-invalid");
      el.removeAttribute("aria-describedby");
    }
  }

  function validar() {
    let primero = null;
    CAMPOS.forEach((n) => {
      const el = form.elements[n];
      const valor = el.value.trim();
      let ok = valor !== "";
      if (n === "correo" && ok) ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
      if (n === "fecha" && ok) ok = /^\d{4}-\d{2}-\d{2}$/.test(valor);
      if (n === "hora" && ok) ok = /^\d{2}:\d{2}$/.test(valor);
      marcar(el, !ok);
      if (!ok && !primero) primero = el;
    });
    if (primero) {
      errorBox.textContent = "Revisa los campos marcados: todos son obligatorios y el correo debe ser válido.";
      errorBox.hidden = false;
      primero.focus();
      return false;
    }
    errorBox.hidden = true;
    return true;
  }

  function mostrarResultado(tipo, icono, titulo, texto, detalle) {
    resultado.className = "resultado " + tipo;
    $("#resultado-icono").textContent = icono;
    $("#resultado-titulo").textContent = titulo;
    $("#resultado-texto").textContent = texto;
    $("#resultado-detalle").textContent = detalle || "";
    $("#resultado-detalle").hidden = !detalle;
    resultado.hidden = false;
    resultado.scrollIntoView({ behavior: scrollSuave, block: "nearest" });
  }

  const sinPunto = (s) => String(s).trim().replace(/[.\s]+$/, "");
  const cupos = (data) =>
    data && data.libres !== undefined && data.libres !== null && data.libres !== ""
      ? "Cupos libres que quedan en la franja: " + data.libres
      : "";

  function interpretar(data, enviado) {
    const r = String((data && data.resultado) || "").trim().toUpperCase();
    const cuando = fechaLarga(enviado.fecha) + " a las " + enviado.hora;
    switch (r) {
      case "CONFIRMADA":
        return ["ok", "✅", "Cita confirmada",
          enviado.mascota + " quedó agendada para el " + cuando + ". Enviamos la confirmación a " + enviado.correo + ".",
          cupos(data)];
      case "CONFIRMADA_CON_ALERTA":
        return ["alerta", "⚠️", "Cita confirmada con alerta",
          enviado.mascota + " quedó agendada para el " + cuando + ", pero la franja casi se llena. Se avisó a la administración.",
          cupos(data)];
      case "RECHAZADA":
        return ["rechazada", "⛔", "Cita rechazada",
          data.mensaje ? sinPunto(data.mensaje) + "." : "La franja del " + cuando + " está llena. Elige otra hora u otro día.", ""];
      case "NO_PROCESADA":
        return ["respaldo", "ℹ️", "Solicitud no procesada",
          sinPunto(data.mensaje || "La franja no existe en la agenda") + ". Quedó registrada como incidencia para revisión.", ""];
      default:
        if (data && data._crudo !== undefined) {
          const crudo = String(data._crudo).trim();
          return ["error", "❓", "Respuesta inesperada",
            "El sistema respondió, pero no con el formato esperado. No sabemos si la cita quedó registrada: revisa la Agenda del día antes de reintentar.",
            /^accepted$/i.test(crudo)
              ? "Make respondió «Accepted»: el escenario no llegó al módulo Webhook response."
              : "Respuesta recibida: " + (crudo.slice(0, 200) || "(vacía)")];
        }
        return ["error", "❓", "Respuesta inesperada",
          "El sistema respondió algo que la interfaz no reconoce. Revisa la Agenda del día antes de reintentar.",
          "Respuesta recibida: " + JSON.stringify(data).slice(0, 200)];
    }
  }

  function bloquear(si) {
    btnEnviar.disabled = si;
    btnEnviar.textContent = si ? "Enviando…" : "Agendar cita";
    btnLimpiar.disabled = si;
    botonesCaso.forEach((b) => (b.disabled = si));
    form.setAttribute("aria-busy", String(si));
  }

  let enviando = false;
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (enviando) return;
    aviso.textContent = "";
    if (!validar()) return;

    if (!configurado(CFG.WEBHOOK_URL)) {
      mostrarResultado("error", "⚙️", "Falta configuración",
        "No hay una URL de webhook válida en config.js (WEBHOOK_URL), así que la cita no se envió.", "");
      return;
    }

    const datos = {};
    CAMPOS.forEach((n) => (datos[n] = form.elements[n].value.trim()));

    enviando = true;
    bloquear(true);
    resultado.hidden = true;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    try {
      // application/x-www-form-urlencoded es una petición "simple": no dispara preflight CORS.
      const resp = await fetch(CFG.WEBHOOK_URL.trim(), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams(datos).toString(),
        signal: ctrl.signal,
      });
      const texto = await resp.text();
      let data;
      try { data = JSON.parse(texto); } catch (_) { data = { _crudo: texto }; }
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const [tipo, icono, titulo, msg, detalle] = interpretar(data, datos);
      mostrarResultado(tipo, icono, titulo, msg, detalle);
    } catch (err) {
      if (err.name === "AbortError") {
        mostrarResultado("error", "⏱️", "El sistema tardó demasiado",
          "No recibimos respuesta en " + TIMEOUT_MS / 1000 + " segundos. Es posible que la cita sí se haya registrado: revisa la Agenda del día antes de volver a enviarla.", "");
      } else {
        mostrarResultado("error", "🔌", "No se pudo contactar el sistema",
          "La cita no se pudo enviar. Revisa tu conexión y que el escenario 1 esté activo (o en «Run once») y vuelve a intentar.",
          "Detalle técnico: " + err.message +
          ". Si el escenario sí corrió en Make, falta la cabecera Access-Control-Allow-Origin: * en el Webhook response.");
      }
    } finally {
      clearTimeout(timer);
      enviando = false;
      bloquear(false);
    }
  });

  form.addEventListener("reset", () => {
    errorBox.hidden = true;
    resultado.hidden = true;
    aviso.textContent = "";
    CAMPOS.forEach((n) => marcar(form.elements[n], false));
  });

  /* Casos de prueba del parcial (cargan el formulario; el envío lo decide el usuario) */
  const CASOS = {
    C1: { propietario: "Ana Torres", correo: "ana1@correo.com", mascota: "Luna", especie: "perro", servicio: "Consulta general", fecha: "2026-10-14", hora: "08:00" },
    C2: { propietario: "Carlos Ruiz", correo: "carlos@correo.com", mascota: "Michi", especie: "gato", servicio: "Vacunación", fecha: "2026-10-14", hora: "10:00" },
    C3: { propietario: "Marta Gómez", correo: "marta@correo.com", mascota: "Rocky", especie: "perro", servicio: "Baño", fecha: "2026-10-14", hora: "11:00" },
    C4: { propietario: "Laura Pérez", correo: "laura@correo.com", mascota: "Pelusa", especie: "gato", servicio: "Consulta general", fecha: "2026-10-20", hora: "08:00" },
    C5: { propietario: "Ana Torres", correo: "ana1@correo.com", mascota: "Luna", especie: "perro", servicio: "Baño", fecha: "2026-10-14", hora: "09:00" },
  };
  botonesCaso.forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.caso;
      const caso = CASOS[id];
      if (!caso || enviando) return;
      CAMPOS.forEach((n) => { form.elements[n].value = caso[n]; marcar(form.elements[n], false); });
      errorBox.hidden = true;
      resultado.hidden = true;
      aviso.textContent = "Caso " + id + " cargado (" + caso.mascota + ", " + caso.fecha + " " + caso.hora + "). Revisa los datos y pulsa «Agendar cita».";
      form.scrollIntoView({ behavior: scrollSuave, block: "start" });
      btnEnviar.focus({ preventScroll: true });
    })
  );

  /* ---------- Vista 2: agenda del día ---------- */
  const inputFecha = $("#agenda-fecha");
  const btnRecargar = $("#btn-recargar");
  const estado = $("#agenda-estado");
  const tabla = $("#tabla-agenda");
  const cuerpo = $("#tabla-cuerpo");
  let cache = null;
  let actualizado = null;
  let cargaId = 0;

  // Parser CSV mínimo con soporte de comillas.
  function parseCSV(texto) {
    if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
    const filas = [];
    let fila = [], campo = "", comillas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (comillas) {
        if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
        else if (c === '"') comillas = false;
        else campo += c;
      } else if (c === '"') comillas = true;
      else if (c === ",") { fila.push(campo); campo = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && texto[i + 1] === "\n") i++;
        fila.push(campo); campo = "";
        if (fila.some((x) => x !== "")) filas.push(fila);
        fila = [];
      } else campo += c;
    }
    fila.push(campo);
    if (fila.some((x) => x !== "")) filas.push(fila);
    return filas;
  }

  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

  function normFecha(v) {
    v = v.trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
    if (m) return m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0");
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
    if (m) return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
    return v;
  }
  function normHora(v) {
    const m = /^(\d{1,2}):(\d{2})/.exec(v.trim());
    return m ? m[1].padStart(2, "0") + ":" + m[2] : v.trim();
  }

  const COLUMNAS = ["fecha", "hora", "mascota", "servicio", "propietario", "resultado", "estado"];

  function aObjetos(filas) {
    if (!filas.length) throw new Error("la hoja está vacía");
    const cab = filas[0].map(norm);
    const ix = {};
    COLUMNAS.forEach((k) => (ix[k] = cab.indexOf(k)));
    const faltan = COLUMNAS.filter((k) => ix[k] < 0);
    if (faltan.length) throw new Error("faltan columnas en la hoja: " + faltan.join(", "));
    const val = (f, k) => (f[ix[k]] || "").trim();
    return filas.slice(1).map((f) => ({
      fecha: normFecha(val(f, "fecha")), hora: normHora(val(f, "hora")), mascota: val(f, "mascota"),
      servicio: val(f, "servicio"), propietario: val(f, "propietario"),
      resultado: val(f, "resultado"), estado: val(f, "estado"),
    }));
  }

  function chip(texto, clase) {
    const s = document.createElement("span");
    s.className = "chip " + clase;
    s.textContent = texto || "—";
    return s;
  }

  function claseResultado(r) {
    const v = r.toUpperCase();
    if (v === "CONFIRMADA") return "ok";
    if (v === "CONFIRMADA_CON_ALERTA") return "alerta";
    if (v === "NO_PROCESADA") return "neutro";
    return "bad";
  }

  function claseEstado(e) {
    const v = e.toUpperCase();
    if (/CANCEL|RECHAZ|ANUL|ERROR/.test(v)) return "bad";
    if (/RECORD|ENVIAD|ATENDID|COMPLET/.test(v)) return "ok";
    return "neutro";
  }

  const legible = (s) => s.replace(/_/g, " ");

  function pintar() {
    const fecha = inputFecha.value;
    cuerpo.replaceChildren();
    if (!fecha) {
      tabla.hidden = true;
      estado.textContent = "Elige una fecha para ver sus citas.";
      return;
    }
    const citas = (cache || [])
      .filter((c) => c.fecha === fecha)
      .sort((a, b) => a.hora.localeCompare(b.hora));
    const sufijo = actualizado ? " (datos leídos a las " + actualizado + ")" : "";
    if (!citas.length) {
      tabla.hidden = true;
      estado.textContent = "No hay citas registradas para el " + fechaLarga(fecha) + sufijo + ".";
      return;
    }
    citas.forEach((c) => {
      const tr = document.createElement("tr");
      [["Hora", c.hora], ["Mascota", c.mascota], ["Servicio", c.servicio], ["Propietario", c.propietario]].forEach(([k, t]) => {
        const td = document.createElement("td");
        td.dataset.label = k;
        td.textContent = t || "—";
        tr.appendChild(td);
      });
      const tdR = document.createElement("td");
      tdR.dataset.label = "Resultado";
      tdR.appendChild(chip(legible(c.resultado), claseResultado(c.resultado)));
      const tdE = document.createElement("td");
      tdE.dataset.label = "Estado";
      tdE.appendChild(chip(legible(c.estado), claseEstado(c.estado)));
      tr.append(tdR, tdE);
      cuerpo.appendChild(tr);
    });
    $("#tabla-caption").textContent = "Citas del " + fechaLarga(fecha) + ", ordenadas por hora";
    tabla.hidden = false;
    estado.textContent = citas.length + (citas.length === 1 ? " cita" : " citas") + " para el " + fechaLarga(fecha) + sufijo + ".";
  }

  async function cargarAgenda() {
    if (!inputFecha.value) inputFecha.value = hoyISO();
    if (!configurado(CFG.CITAS_CSV_URL)) {
      tabla.hidden = true;
      estado.textContent = "Falta configurar CITAS_CSV_URL en config.js (enlace CSV de la hoja «Citas» publicada en la web).";
      return;
    }
    const id = ++cargaId;
    estado.textContent = "Cargando citas…";
    btnRecargar.disabled = true;
    tabla.setAttribute("aria-busy", "true");
    try {
      const base = CFG.CITAS_CSV_URL.trim();
      const url = base + (base.includes("?") ? "&" : "?") + "t=" + Date.now();
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const texto = await resp.text();
      if (/^\s*<(!doctype|html)/i.test(texto)) throw new Error("el enlace devolvió una página web, no un CSV");
      const datos = aObjetos(parseCSV(texto));
      if (id !== cargaId) return;
      cache = datos;
      actualizado = new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
      pintar();
    } catch (err) {
      if (id !== cargaId) return;
      cache = null;
      tabla.hidden = true;
      cuerpo.replaceChildren();
      estado.textContent = "No se pudo leer la hoja de citas (" + err.message + "). Verifica tu conexión y que la hoja «Citas» esté publicada en la web como CSV.";
    } finally {
      if (id === cargaId) {
        btnRecargar.disabled = false;
        tabla.removeAttribute("aria-busy");
      }
    }
  }

  inputFecha.addEventListener("change", () => (cache ? pintar() : cargarAgenda()));
  btnRecargar.addEventListener("click", cargarAgenda);

  /* Valores por defecto */
  form.elements.fecha.min = hoyISO();
  inputFecha.value = hoyISO();
  mostrarVista(location.hash.slice(1) || "agendar");
  window.addEventListener("hashchange", () => mostrarVista(location.hash.slice(1)));
})();
