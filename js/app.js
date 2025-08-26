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
      const loginError = document.getElementById('login-error')
      if (loginError) loginError.textContent = "Usuario o contraseña incorrectos"
      return null
    } else {
      localStorage.setItem("usuario", data.usuario)
      showMainScreen()
      await cargarRegistros()
      return data
    }
  } catch (err) {
    console.error("Error en login:", err)
    const loginError = document.getElementById('login-error')
    if (loginError) loginError.textContent = "Error al comunicarse con el servidor"
    return null
  }
}
window.login = login // opcional, por compatibilidad

// ------------------------
// Storage helpers
// ------------------------
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

// ------------------------
// CRUD vehiculos/clientes (ajustado a tu esquema)
// ------------------------
async function crearCliente({ nombre, telefono, direccion }) {
  try {
    const { data, error } = await supabase
      .from('clientes')
      .insert([{ nombre, telefono, direccion }])
      .select()
      .single()
    if (error) throw error
    return data
  } catch (err) {
    console.error('Error crearCliente:', err)
    throw err
  }
}

async function crearVehiculo(payload) {
  try {
    const { data, error } = await supabase
      .from('vehiculos')
      .insert([payload])
      .select()
      .single()
    if (error) throw error
    return data
  } catch (err) {
    console.error('Error crearVehiculo:', err)
    throw err
  }
}

async function crearRegistroCompleto(input) {
  try {
    // Si el input trae cliente_id (cuando reusamos cliente), usamos eso
    let cliente = null
    if (input.cliente_id) {
      // obtener cliente por id
      const { data, error } = await supabase.from('clientes').select('*').eq('id', input.cliente_id).single()
      if (error) throw error
      cliente = data
    } else {
      cliente = await crearCliente(input.cliente)
    }

    const payloadVehiculo = {
      cliente_id: cliente.id,
      marca: input.vehiculo.marca || null,
      modelo: input.vehiculo.modelo || null,
      color: input.vehiculo.color || null,
      placa: input.vehiculo.placa || null,
      kilometraje: input.vehiculo.kilometraje || null,
      checklist: input.vehiculo.checklist || {},
      tablero_photo_path: input.vehiculo.tableroPath || null,
      photos: input.vehiculo.photos || [],
      trabajo: input.vehiculo.trabajo || null,
      firma_path: input.vehiculo.firmaPath || null,
      clausula: input.vehiculo.clausula || null,
      status: input.vehiculo.status || 'activo'
    }

    const vehiculo = await crearVehiculo(payloadVehiculo)
    return { cliente, vehiculo }
  } catch (err) {
    console.error('Error crearRegistroCompleto:', err)
    throw err
  }
}

// Versión básica listar vehiculos (fallback incluido para traer clientes)
async function listarRegistros() {
  try {
    // Intentamos traer vehiculos con cliente embebido
    const { data, error } = await supabase
      .from('vehiculos')
      .select('*, clientes(*)')
      .order('created_at', { ascending: false })

    if (!error && data) {
      return data
    }
    // else: fallback
  } catch (err) {
    console.warn('listarRegistros (embed) falló:', err)
  }

  try {
    const { data: vehs, error: errVeh } = await supabase
      .from('vehiculos')
      .select('*')
      .order('created_at', { ascending: false })
    if (errVeh) throw errVeh
    if (!vehs || vehs.length === 0) return []
    const clienteIds = Array.from(new Set(vehs.map(v => v.cliente_id).filter(Boolean)))
    let clientesMap = {}
    if (clienteIds.length) {
      const { data: clientesData, error: errCli } = await supabase
        .from('clientes')
        .select('*')
        .in('id', clienteIds)
      if (errCli) throw errCli
      clientesMap = (clientesData || []).reduce((acc, c) => { acc[c.id] = c; return acc }, {})
    }
    return vehs.map(v => ({ ...v, cliente: clientesMap[v.cliente_id] || null }))
  } catch (err) {
    console.error('Error listarRegistros fallback:', err)
    return []
  }
}

async function cargarRegistros() {
  try {
    const registros = await listarRegistros()
    const contenedor = document.getElementById("content")
    if (!contenedor) return
    contenedor.innerHTML = ""
    if (!registros || registros.length === 0) {
      contenedor.innerHTML = "<p>No hay registros.</p>"
      return
    }

    registros.forEach(r => {
      const cliente = r.clientes ? (Array.isArray(r.clientes) ? r.clientes[0] : r.clientes) : (r.cliente ? r.cliente : null)
      const nombreCliente = cliente ? (cliente.nombre || '—') : '—'
      const telefonoCliente = cliente ? (cliente.telefono || '') : ''
      const marca = r.marca || r.vehiculo_marca || '—'
      const modelo = r.modelo || r.vehiculo_modelo || ''
      const placa = r.placa || r.vehiculo_placa || '—'
      const km = r.kilometraje ?? r.vehiculo_kilometraje ?? '—'

      const div = document.createElement("div")
      div.className = "registro"
      div.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
          <div>
            <h3>${nombreCliente} — ${marca} ${modelo}</h3>
            <p>Placa: ${placa} · KM: ${km}</p>
            <p style="color:var(--muted)">Tel: ${telefonoCliente}</p>
          </div>
          <div style="text-align:right; font-size:0.9rem; color:var(--muted)">
            ${r.created_at ? new Date(r.created_at).toLocaleString() : ''}
          </div>
        </div>
      `
      contenedor.appendChild(div)
    })
  } catch (err) {
    console.error('Error en cargarRegistros:', err)
    const contenedor = document.getElementById("content")
    if (contenedor) contenedor.innerText = "Error al cargar registros"
  }
}

// ------------------------
// UI helpers y listeners
// ------------------------

function ensureMainUI() {
  const main = document.getElementById("main-screen")
  if (!main) {
    console.error("No se encontró #main-screen en el DOM")
    return
  }

  let actions = document.querySelector(".actions")
  if (!actions) {
    actions = document.createElement("div")
    actions.className = "actions"
    const content = document.getElementById("content") || document.createElement('main')
    main.insertBefore(actions, content)
  }

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

  actions.style.display = "flex"
  actions.style.gap = "8px"

  attachMainListeners()
}

function attachMainListeners() {
  const btnRegistrar = document.getElementById("btn-registrar")
  if (btnRegistrar && !btnRegistrar._attached) {
    btnRegistrar.addEventListener("click", () => {
      if (typeof renderRegistrarForm === 'function') renderRegistrarForm()
      else document.getElementById("content").innerHTML = "<p>Formulario de registrar vehículo (a implementar)</p>"
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
    btnRegistrar._attached = true
  }

  const btnVer = document.getElementById("btn-ver")
  if (btnVer && !btnVer._attached) {
    btnVer.addEventListener("click", async () => {
      const content = document.getElementById("content")
      if (content) content.innerHTML = "<p>Cargando registros...</p>"
      await cargarRegistros()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
    btnVer._attached = true
  }

  const logoutBtn = document.getElementById("logout-btn")
  if (logoutBtn && !logoutBtn._attached) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("usuario")
      showLoginScreen()
      const content = document.getElementById("content")
      if (content) content.innerHTML = ""
    })
    logoutBtn._attached = true
  }
}

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

// ------------------------
// Búsqueda por placa y teléfono
// ------------------------
async function buscarPorPlaca(placa) {
  if (!placa) return null
  try {
    const placaTrim = placa.trim()
    const { data, error } = await supabase
      .from('vehiculos')
      .select('marca,modelo,color,placa,kilometraje,cliente_id')
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

// ------------------------
// Formulario Registrar + firma + subida + submit
// ------------------------
function renderRegistrarForm() {
  const content = document.getElementById("content")
  if (!content) return
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

  initSignaturePad()

  const form = document.getElementById("registrar-form")
  if (form) form.addEventListener("submit", handleRegistrarSubmit)

  const placaInput = document.getElementById('veh-placa')
  const placaStatus = document.getElementById('placa-status')
  const buscarPlacaBtn = document.getElementById('buscar-placa')

  async function doBuscarPlaca(valor) {
    placaStatus.textContent = 'Buscando…'
    try {
      const found = await buscarPorPlaca(valor)
      if (found) {
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

  if (placaInput) {
    placaInput.addEventListener('blur', (e) => {
      const v = e.target.value.trim()
      if (v) doBuscarPlaca(v)
    })
  }
  if (buscarPlacaBtn) {
    buscarPlacaBtn.addEventListener('click', () => {
      const v = placaInput.value.trim()
      if (v) doBuscarPlaca(v)
    })
  }

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

  if (telInput) {
    telInput.addEventListener('blur', (e) => {
      const v = e.target.value.trim()
      if (v) doBuscarTelefono(v)
    })
  }
  if (buscarTelBtn) {
    buscarTelBtn.addEventListener('click', () => {
      const v = telInput.value.trim()
      if (v) doBuscarTelefono(v)
    })
  }
}

// Signature pad
function initSignaturePad() {
  const canvas = document.getElementById('signature-pad')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  let drawing = false
  let last = { x: 0, y: 0 }

  function getPos(e) {
    if (e.touches && e.touches.length) {
      const rect = canvas.getBoundingClientRect()
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    } else {
      const rect = canvas.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
  }

  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#0f172a'

  canvas.addEventListener('mousedown', (e) => { drawing = true; last = getPos(e) })
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); drawing = true; last = getPos(e) }, { passive: false })
  window.addEventListener('mouseup', () => { drawing = false })
  canvas.addEventListener('mousemove', (e) => {
    if (!drawing) return
    const p = getPos(e)
    ctx.beginPath()
    ctx.moveTo(last.x, last.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last = p
  })
  canvas.addEventListener('touchmove', (e) => {
    if (!drawing) return
    const p = getPos(e)
    ctx.beginPath()
    ctx.moveTo(last.x, last.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last = p
  }, { passive: false })

  const clearBtn = document.getElementById('clear-sign')
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    })
  }
}

function getSignatureBlob() {
  return new Promise((resolve) => {
    const canvas = document.getElementById('signature-pad')
    if (!canvas) return resolve(null)
    canvas.toBlob((blob) => {
      resolve(blob)
    }, 'image/png')
  })
}

// Submit handler (usa crearRegistroCompleto)
async function handleRegistrarSubmit(ev) {
  ev.preventDefault()
  const btn = document.getElementById('submit-registrar')
  const status = document.getElementById('registrar-status')
  if (btn) btn.disabled = true
  if (status) status.textContent = 'Guardando...'
  try {
    // cliente
    const cliente_nombre = document.getElementById('cliente-nombre').value.trim()
    const cliente_telefono = document.getElementById('cliente-telefono').value.trim()
    const cliente_direccion = document.getElementById('cliente-direccion').value.trim()
    // vehiculo
    const vehiculo_marca = document.getElementById('veh-marca').value.trim()
    const vehiculo_modelo = document.getElementById('veh-modelo').value.trim()
    const vehiculo_color = document.getElementById('veh-color').value.trim()
    const vehiculo_placa = document.getElementById('veh-placa').value.trim()
    const vehiculo_km = parseInt(document.getElementById('veh-km').value || 0, 10)
    const checklist = collectChecklist()
    const trabajo = document.getElementById('trabajo-text').value.trim()

    const vehiculoId = `veh_${Date.now()}_${Math.floor(Math.random()*9000+1000)}`

    // archivos y firma
    const tableroInput = document.getElementById('tablero-input')
    const fotosInput = document.getElementById('fotos-input')
    const fotosFiles = fotosInput && fotosInput.files ? Array.from(fotosInput.files) : []
    const tableroFiles = tableroInput && tableroInput.files && tableroInput.files[0] ? [tableroInput.files[0]] : []

    let firmaPath = null
    const firmaBlob = await getSignatureBlob()
    if (firmaBlob) {
      try {
        const file = new File([firmaBlob], `firma_${vehiculoId}.png`, { type: 'image/png' })
        const { data: firmaData, error: firmaErr } = await supabase.storage
          .from('vehiculos-photos')
          .upload(`${vehiculoId}/firma_${Date.now()}.png`, file, { cacheControl: '3600', upsert: false })
        if (firmaErr) console.warn("No se pudo subir firma:", firmaErr)
        else firmaPath = firmaData.path
      } catch (err) { console.warn('Error subiendo firma:', err) }
    }

    // subir tablero
    let tableroPath = null
    if (tableroFiles.length) {
      try {
        const uploadedTab = await uploadFiles(vehiculoId, tableroFiles)
        if (uploadedTab && uploadedTab.length) tableroPath = uploadedTab[0].path
      } catch (err) { console.warn('Error subir tablero', err) }
    }

    // subir fotos
    let fotosPaths = []
    if (fotosFiles.length) {
      try {
        const uploaded = await uploadFiles(vehiculoId, fotosFiles)
        fotosPaths = uploaded.map(u => ({ path: u.path, name: u.name }))
      } catch (err) { console.warn('Error subir fotos', err) }
    }

    // detectar cliente existente por telefono (si coincide) y detectar cliente_id por placa si queremos
    let cliente_id = null
    if (cliente_telefono) {
      const foundCli = await buscarPorTelefono(cliente_telefono)
      if (foundCli) cliente_id = foundCli.id
    }

    // opcion: si la placa coincide con un vehiculo existente, reutilizar cliente_id del veh encontrado
    if (!cliente_id && vehiculo_placa) {
      const foundVeh = await buscarPorPlaca(vehiculo_placa)
      if (foundVeh && foundVeh.cliente_id) {
        cliente_id = foundVeh.cliente_id
      }
    }

    const input = {
      cliente: {
        nombre: cliente_nombre || '—',
        telefono: cliente_telefono || null,
        direccion: cliente_direccion || null
      },
      cliente_id: cliente_id || null,
      vehiculo: {
        marca: vehiculo_marca || null,
        modelo: vehiculo_modelo || null,
        color: vehiculo_color || null,
        placa: vehiculo_placa || null,
        kilometraje: Number.isFinite(vehiculo_km) ? vehiculo_km : null,
        checklist: checklist || {},
        tableroPath: tableroPath,
        photos: fotosPaths,
        trabajo: trabajo || null,
        firmaPath: firmaPath,
        clausula: "Lorem ipsum dolor sit amet...",
        status: "activo"
      }
    }

    if (status) status.textContent = 'Guardando cliente y registro...'
    const result = await crearRegistroCompleto(input)

    if (status) status.textContent = 'Registro guardado correctamente ✓'
    const form = document.getElementById('registrar-form')
    if (form) form.reset()
    const canvas = document.getElementById('signature-pad')
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }

    await cargarRegistros()
    setTimeout(() => { if (status) status.textContent = '' }, 3000)
    if (btn) btn.disabled = false
  } catch (err) {
    console.error("Error al guardar registro (completo):", err)
    const status = document.getElementById('registrar-status')
    if (status) status.textContent = 'Error al guardar registro'
    const btn = document.getElementById('submit-registrar')
    if (btn) btn.disabled = false
  }
}

// helper checklist
function collectChecklist() {
  const checks = document.querySelectorAll('#registrar-form input[name="check"]')
  const obj = {}
  checks.forEach(ch => { obj[ch.value] = ch.checked })
  return obj
}

// ------------------------
// INITIALIZACIÓN: DOMContentLoaded
// ------------------------
document.addEventListener('DOMContentLoaded', async () => {
  // Obtener referencias
  const loginForm = document.getElementById("login-form")
  const loginError = document.getElementById("login-error")
  if (loginError) loginError.textContent = ""

  // ocultar logout al inicio
  const logoutBtn = document.getElementById("logout-btn")
  if (logoutBtn) logoutBtn.style.display = 'none'

  // Asegurar UI y listeners
  try { ensureMainUI() } catch (err) { console.warn("ensureMainUI fallo:", err) }

  // login form listener
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

  // asegurar logout listener
  if (logoutBtn && !logoutBtn._domAttached) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("usuario")
      showLoginScreen()
      const content = document.getElementById("content")
      if (content) content.innerHTML = ""
    })
    logoutBtn._domAttached = true
  }

  // si hay usuario en localStorage -> saltar
  try {
    const saved = localStorage.getItem("usuario")
    if (saved) {
      console.log("Usuario en localStorage:", saved)
      showMainScreen()
      try { await cargarRegistros() } catch (e) { console.error("Error cargarRegistros init:", e) }
    }
  } catch (err) {
    console.warn("No se pudo leer localStorage:", err)
  }

  // verificación supabase (debug)
  try {
    const { data, error } = await supabase.from('usuarios').select('id').limit(1)
    if (error) console.warn("Verificación Supabase devolvió error:", error)
    else console.log("Conexión a Supabase OK (usuarios table accesible).")
  } catch (err) {
    console.error("No se pudo verificar Supabase:", err)
  }

  // suscripción realtime (opcional)
  try {
    supabase.channel('vehiculos-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehiculos' }, payload => {
        console.log("Realtime payload:", payload)
        cargarRegistros().catch(e => console.error("Error recargando registros por realtime:", e))
      })
      .subscribe()
  } catch (err) {
    console.warn("Realtime: no se pudo subscribir", err)
  }

  try { attachMainListeners() } catch (err) { console.warn("attachMainListeners fallo:", err) }
})
