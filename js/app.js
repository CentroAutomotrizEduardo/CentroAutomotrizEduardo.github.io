import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// -------- CONFIG --------
const SUPABASE_URL = 'https://tsxojomiriruedjvnsgj.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeG9qb21pcmlydWVkanZuc2dqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYyMTcyOTksImV4cCI6MjA3MTc5MzI5OX0.4dgZ-dMXgrWlgh9vjkaY0n1yv0aInWIwn51kboLM_6k'
// ------------------------

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ------------------------
// FUNCIONES PRINCIPALES
// ------------------------

async function login(usuario, contrasena) {
  try {
    console.log("Intentando login con:", usuario, contrasena)

    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('usuario', usuario)
      .eq('contrasena', contrasena)
      .single()

    console.log("Login -> data:", data, " error:", error)

    if (error || !data) {
      document.getElementById('login-error').textContent = "Usuario o contraseña incorrectos"
      return null
    } else {
      localStorage.setItem("usuario", data.usuario)
      showMainScreen()
      await cargarRegistros()
      return data
    }
  } catch (err) {
    console.error("Error en login:", err)
    document.getElementById('login-error').textContent = "Error al comunicarse con el servidor"
    return null
  }
}
window.login = login // seguimos exponiendo por compatibilidad

async function uploadFiles(vehiculoId, files) {
  const uploaded = []
  for (const file of files) {
    const path = `${vehiculoId}/${Date.now()}_${file.name}`
    const { data, error } = await supabase.storage
      .from('vehiculos-photos')
      .upload(path, file, { cacheControl: '3600', upsert: false })
    if (error) throw error
    uploaded.push({ path: data.path, name: file.name })
  }
  return uploaded
}

async function crearRegistro(payload) {
  try {
    const { data, error } = await supabase
      .from('vehiculos')
      .insert([ payload ])
      .select()
    if (error) throw error
    return data[0]
  } catch (err) {
    console.error("Error crearRegistro:", err)
    throw err
  }
}

async function listarRegistros() {
  try {
    const { data, error } = await supabase
      .from('vehiculos')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  } catch (err) {
    console.error("Error listarRegistros:", err)
    return []
  }
}

async function cargarRegistros() {
  try {
    const registros = await listarRegistros()
    const contenedor = document.getElementById("content")
    contenedor.innerHTML = ""
    if (!registros || registros.length === 0) {
      contenedor.innerHTML = "<p>No hay registros.</p>"
      return
    }
    registros.forEach(r => {
      const div = document.createElement("div")
      div.className = "registro"
      div.innerHTML = `
        <h3>${r.cliente_nombre || '—'} - ${r.vehiculo_marca || '—'} ${r.vehiculo_modelo || ''}</h3>
        <p>Placa: ${r.vehiculo_placa || '—'}</p>
        <p>Fecha: ${r.created_at || '—'}</p>
      `
      contenedor.appendChild(div)
    })
  } catch (err) {
    console.error("Error en cargarRegistros:", err)
    document.getElementById("content").innerText = "Error al cargar registros"
  }
}

// ------------------------
// HELPERS UI
// ------------------------

function showMainScreen() {
  const login = document.getElementById("login-screen")
  const main = document.getElementById("main-screen")
  if (login) login.hidden = true
  if (main) main.hidden = false
  ensureMainUI()
}

function showLoginScreen() {
  document.getElementById("login-screen").hidden = false
  document.getElementById("main-screen").hidden = true
}

// ------------------------
// INICIALIZACIÓN
// ------------------------
document.addEventListener('DOMContentLoaded', async () => {
  // Obtener referencias
  const loginForm = document.getElementById("login-form")
  const loginError = document.getElementById("login-error")
  if (loginError) loginError.textContent = ""

  // ocultar logout al inicio (estamos en pantalla de login por defecto)
  const logoutBtn = document.getElementById("logout-btn")
  if (logoutBtn) logoutBtn.style.display = 'none'

  // Asegurarnos de que el UI principal y sus listeners existen (si los botones están en HTML o los crea JS)
  try {
    ensureMainUI()
  } catch (err) {
    console.warn("ensureMainUI falló en init:", err)
  }

  // Atar listener del formulario de login
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault()
      if (loginError) loginError.textContent = ""
      const usuario = document.getElementById("usuario").value.trim()
      const contrasena = document.getElementById("contrasena").value
      if (!usuario || !contrasena) {
        if (loginError) loginError.textContent = "Ingresa usuario y contraseña"
        return
      }
      await login(usuario, contrasena)
    })
  } else {
    console.warn("No se encontró #login-form en el DOM")
  }

  // Asegurar que el logout tenga un listener (por si attachMainListeners no se ejecutó)
  if (logoutBtn && !logoutBtn._domAttached) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("usuario")
      showLoginScreen()
      const content = document.getElementById("content")
      if (content) content.innerHTML = ""
    })
    logoutBtn._domAttached = true
  }

  // Si ya hay usuario en localStorage, ir al main y cargar registros
  try {
    const saved = localStorage.getItem("usuario")
    if (saved) {
      console.log("Usuario en localStorage:", saved)
      showMainScreen()
      // cargarRegistros puede lanzar; lo atrapamos
      try {
        await cargarRegistros()
      } catch (err) {
        console.error("Error cargando registros al inicio:", err)
      }
    }
  } catch (err) {
    console.warn("No se pudo leer localStorage:", err)
  }

  // Pequeña verificación de conexión con Supabase (debug)
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id')
      .limit(1)
    if (error) {
      console.warn("Verificación Supabase devolvió error:", error)
    } else {
      console.log("Conexión a Supabase OK (usuarios table accesible).")
    }
  } catch (err) {
    console.error("No se pudo verificar Supabase:", err)
  }

  // Suscripción realtime para actualizar lista automáticamente (si supabase soporta channel)
  try {
    // creamos/subscribimos a canal (idempotente si ya existe)
    supabase.channel('vehiculos-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehiculos' }, payload => {
        console.log("Realtime payload:", payload)
        // recarga lista cada vez que detectamos un cambio (sin bloquear UI)
        cargarRegistros().catch(e => console.error("Error recargando registros por realtime:", e))
      })
      .subscribe()
  } catch (err) {
    console.warn("Realtime: no se pudo subscribir", err)
  }

  // Finalmente, si los botones ya están en el HTML, ensureMainUI() habrá atado listeners;
  // si por alguna razón no, forzamos attachMainListeners una vez más.
  try {
    attachMainListeners()
  } catch (err) {
    console.warn("attachMainListeners fallo en init:", err)
  }
})

// ------------------------
// UI: asegurar que el main y botones existan y estén visibles
// ------------------------
function ensureMainUI() {
  const main = document.getElementById("main-screen")
  if (!main) {
    console.error("No se encontró #main-screen en el DOM")
    return
  }
  // quitar atributo hidden si aún existe (no mostrar por defecto, controlado por showMainScreen)
  // main.hidden = false // no forzamos aquí; lo hace showMainScreen

  // asegurar que el contenedor de acciones exista y tenga botones
  let actions = document.querySelector(".actions")
  if (!actions) {
    actions = document.createElement("div")
    actions.className = "actions"
    // insertar antes del content
    const content = document.getElementById("content")
    main.insertBefore(actions, content)
  }

  // crear botones si no existen (mantiene estilos existentes)
  if (!document.getElementById("btn-registrar")) {
    const btn1 = document.createElement("button")
    btn1.id = "btn-registrar"
    btn1.className = "btn btn-primary"
    btn1.textContent = "Registrar vehículo"
    actions.appendChild(btn1)
  }
  if (!document.getElementById("btn-ver")) {
    const btn2 = document.createElement("button")
    btn2.id = "btn-ver"
    btn2.className = "btn btn-secondary"
    btn2.textContent = "Ver registros"
    actions.appendChild(btn2)
  }

  // forzar estilo visible (evita CSS inesperado)
  actions.style.display = "flex"
  actions.style.gap = "8px"

  // atar listeners (solo una vez, y también si botones están en HTML)
  attachMainListeners()
}

function attachMainListeners() {
  // Registrar
  const btnRegistrar = document.getElementById("btn-registrar")
  if (btnRegistrar && !btnRegistrar._attached) {
    btnRegistrar.addEventListener("click", () => {
      // usa renderRegistrarForm si existe, si no, placeholder
      if (typeof renderRegistrarForm === 'function') {
        renderRegistrarForm()
      } else {
        document.getElementById("content").innerHTML = "<p>Formulario de registrar vehículo (a implementar)</p>"
      }
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
    btnRegistrar._attached = true
  }

  // Ver registros
  const btnVer = document.getElementById("btn-ver")
  if (btnVer && !btnVer._attached) {
    btnVer.addEventListener("click", async () => {
      document.getElementById("content").innerHTML = "<p>Cargando registros...</p>"
      await cargarRegistros()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
    btnVer._attached = true
  }

  // Logout
  const logoutBtn = document.getElementById("logout-btn")
  if (logoutBtn && !logoutBtn._attached) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("usuario")
      showLoginScreen()
      document.getElementById("content").innerHTML = ""
    })
    logoutBtn._attached = true
  }
}

// Mostrar / ocultar pantallas + controlar boton logout
function showMainScreen() {
  const login = document.getElementById("login-screen")
  const main = document.getElementById("main-screen")
  const logout = document.getElementById("logout-btn")
  if (login) login.hidden = true
  if (main) main.hidden = false
  if (logout) logout.style.display = 'inline-block'
  ensureMainUI()
}

function showLoginScreen() {
  const login = document.getElementById("login-screen")
  const main = document.getElementById("main-screen")
  const logout = document.getElementById("logout-btn")
  if (login) login.hidden = false
  if (main) main.hidden = true
  if (logout) logout.style.display = 'none'
}


/* ---------- BÚSQUEDAS: placa y teléfono ---------- */

async function buscarPorPlaca(placa) {
  if (!placa) return null
  try {
    const placaTrim = placa.trim()
    // Buscar el último registro con esa placa (case-insensitive)
    const { data, error } = await supabase
      .from('vehiculos')
      .select('marca,modelo,color,placa,kilometraje')
      .ilike('placa', placaTrim)
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) {
      console.warn('buscarPorPlaca error:', error)
      return null
    }
    if (!data || data.length === 0) return null
    return data[0]
  } catch (err) {
    console.error('buscarPorPlaca exception:', err)
    return null
  }
}

async function buscarPorTelefono(telefono) {
  if (!telefono) return null
  try {
    const telTrim = telefono.trim()
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .ilike('telefono', telTrim)
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) {
      console.warn('buscarPorTelefono error:', error)
      return null
    }
    if (!data || data.length === 0) return null
    return data[0]
  } catch (err) {
    console.error('buscarPorTelefono exception:', err)
    return null
  }
}

/* ---------- Formulario Registrar Vehículo (render + lógica) ----------
   Esta versión añade listeners de búsqueda por placa y teléfono.
*/
function renderRegistrarForm() {
  const content = document.getElementById("content")
  content.innerHTML = `
    <div class="registro-card">
      <h2>Registrar vehículo</h2>
      <form id="registrar-form">
        <fieldset>
          <legend>Cliente</legend>
          <input type="text" id="cliente-nombre" placeholder="Nombre" required />
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="tel" id="cliente-telefono" placeholder="Teléfono" />
            <button type="button" id="buscar-telefono" class="btn" style="min-width:110px;padding:8px 12px">Buscar</button>
            <span id="telefono-status" style="color:var(--muted); font-size:0.9rem;"></span>
          </div>
          <input type="text" id="cliente-direccion" placeholder="Dirección" />
        </fieldset>

        <fieldset>
          <legend>Vehículo</legend>
          <input type="text" id="veh-marca" placeholder="Marca" />
          <input type="text" id="veh-modelo" placeholder="Modelo" />
          <input type="text" id="veh-color" placeholder="Color" />
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="text" id="veh-placa" placeholder="Placa" />
            <button type="button" id="buscar-placa" class="btn" style="min-width:110px;padding:8px 12px">Buscar</button>
            <span id="placa-status" style="color:var(--muted); font-size:0.9rem;"></span>
          </div>
          <input type="number" id="veh-km" placeholder="Kilometraje" min="0" />
        </fieldset>

        <fieldset>
          <legend>Checklist</legend>
          <div class="check-grid">
            <label><input type="checkbox" name="check" value="bocinas"> Bocinas</label>
            <label><input type="checkbox" name="check" value="aire_acondicionado"> Aire acondicionado</label>
            <label><input type="checkbox" name="check" value="radio"> Radio</label>
            <label><input type="checkbox" name="check" value="limpia_vidrios"> Limpia vidrios</label>
            <label><input type="checkbox" name="check" value="goma_repuesto"> Goma de repuesto</label>
            <label><input type="checkbox" name="check" value="llave_rueda"> Llave de rueda</label>
            <label><input type="checkbox" name="check" value="antenas"> Antenas</label>
            <label><input type="checkbox" name="check" value="alfombras"> Alfombras</label>
            <label><input type="checkbox" name="check" value="tapiceria"> Tapicería</label>
            <label><input type="checkbox" name="check" value="guardalodo"> Guardalodo</label>
            <label><input type="checkbox" name="check" value="ribete"> Ribete</label>
            <label><input type="checkbox" name="check" value="espejos"> Espejos</label>
            <label><input type="checkbox" name="check" value="documentos"> Documentos</label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Fotos</legend>
          <label>Foto del tablero (una):</label>
          <input type="file" id="tablero-input" accept="image/*" />
          <label>Fotos del vehículo (varias):</label>
          <input type="file" id="fotos-input" accept="image/*" multiple />
        </fieldset>

        <fieldset>
          <legend>Trabajo a realizar</legend>
          <textarea id="trabajo-text" rows="5" placeholder="Describir lo que se le hará al vehículo..."></textarea>
        </fieldset>

        <fieldset>
          <legend>Firma</legend>
          <div class="signature-wrap">
            <canvas id="signature-pad" width="600" height="200" style="border:1px solid rgba(0,0,0,0.08); border-radius:8px;"></canvas>
            <div style="margin-top:8px;">
              <button type="button" id="clear-sign">Limpiar firma</button>
            </div>
          </div>
        </fieldset>

        <p class="clausula"><strong>Cláusula:</strong> Lorem ipsum dolor sit amet, consectetur adipisicing elit...</p>

        <div style="display:flex;gap:12px;align-items:center;margin-top:12px;">
          <button class="btn btn-primary" type="submit" id="submit-registrar">Guardar registro</button>
          <div id="registrar-status" style="color:var(--muted)"></div>
        </div>
      </form>
    </div>
  `

  // init signature pad
  initSignaturePad()

  // atar listener de submit
  const form = document.getElementById("registrar-form")
  form.addEventListener("submit", handleRegistrarSubmit)

  // atar búsqueda por placa (botón y blur)
  const placaInput = document.getElementById('veh-placa')
  const placaStatus = document.getElementById('placa-status')
  const buscarPlacaBtn = document.getElementById('buscar-placa')

  async function doBuscarPlaca(valor) {
    placaStatus.textContent = 'Buscando…'
    try {
      const found = await buscarPorPlaca(valor)
      if (found) {
        // Rellenar solo datos del vehículo
        document.getElementById('veh-marca').value = found.marca || ''
        document.getElementById('veh-modelo').value = found.modelo || ''
        document.getElementById('veh-color').value = found.color || ''
        document.getElementById('veh-placa').value = found.placa || valor
        document.getElementById('veh-km').value = found.kilometraje ?? ''
        placaStatus.textContent = 'Encontrado (datos rellenados)'
      } else {
        placaStatus.textContent = 'No se encontró'
      }
    } catch (err) {
      placaStatus.textContent = 'Error'
      console.error('doBuscarPlaca error', err)
    }
    setTimeout(() => { placaStatus.textContent = '' }, 3500)
  }

  placaInput.addEventListener('blur', (e) => {
    const v = e.target.value.trim()
    if (v) doBuscarPlaca(v)
  })
  buscarPlacaBtn.addEventListener('click', () => {
    const v = placaInput.value.trim()
    if (v) doBuscarPlaca(v)
  })

  // atar búsqueda por teléfono (botón y blur)
  const telInput = document.getElementById('cliente-telefono')
  const telStatus = document.getElementById('telefono-status')
  const buscarTelBtn = document.getElementById('buscar-telefono')

  async function doBuscarTelefono(valor) {
    telStatus.textContent = 'Buscando…'
    try {
      const found = await buscarPorTelefono(valor)
      if (found) {
        document.getElementById('cliente-nombre').value = found.nombre || ''
        document.getElementById('cliente-direccion').value = found.direccion || ''
        telStatus.textContent = 'Cliente encontrado (datos rellenados)'
      } else {
        telStatus.textContent = 'No se encontró'
      }
    } catch (err) {
      telStatus.textContent = 'Error'
      console.error('doBuscarTelefono error', err)
    }
    setTimeout(() => { telStatus.textContent = '' }, 3500)
  }

  telInput.addEventListener('blur', (e) => {
    const v = e.target.value.trim()
    if (v) doBuscarTelefono(v)
  })
  buscarTelBtn.addEventListener('click', () => {
    const v = telInput.value.trim()
    if (v) doBuscarTelefono(v)
  })
}
