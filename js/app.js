import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// -------- CONFIG --------
const SUPABASE_URL = 'https://tsxojomiriruedjvnsgj.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeG9qb21pcmlydWVkanZuc2dqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYyMTcyOTksImV4cCI6MjA3MTc5MzI5OX0.4dgZ-dMXgrWlgh9vjkaY0n1yv0aInWIwn51kboLM_6k'
// ------------------------

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ------------------------
// Variables para fotos seleccionadas (globales)
// ------------------------
let selectedTableroFiles = []
let selectedFotosFiles = []


// ------------------------
// CONSTANTE BUCKET (por si no está definida)
// ------------------------
if (typeof BUCKET === 'undefined') {
  const BUCKET = 'vehiculos-photos'
  // Si prefieres que sea una variable global re-asignable, podrías usar window.BUCKET = 'vehiculos-photos'
  window.BUCKET = BUCKET
}


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
// Security helper: verify password for current logged user
// ------------------------
async function verifyPassword(plainPassword) {
  try {
    const usuario = localStorage.getItem("usuario")
    if (!usuario) return false
    const { data, error } = await supabase
      .from('usuarios')
      .select('id')
      .eq('usuario', usuario)
      .eq('contrasena', plainPassword)
      .single()
    if (error || !data) return false
    return true
  } catch (err) {
    console.error('verifyPassword error', err)
    return false
  }
}

async function promptPasswordAndVerify() {
  const pwd = window.prompt("Ingresa tu contraseña para confirmar:")
  if (!pwd) return false
  const ok = await verifyPassword(pwd)
  if (!ok) alert('Contraseña incorrecta')
  return ok
}

// ------------------------
// Asignar el primer "cono" libre (1,2,3...) entre vehiculos activos
// ------------------------
async function assignCono() {
  // busca todos los conos asignados a vehiculos que NO estén despachados
  try {
    const { data, error } = await supabase
      .from('vehiculos')
      .select('cono')
      .neq('status', 'despachado') // solo activos ocupando conos
    if (error) {
      console.warn('assignCono: error al obtener conos', error)
      // fallback: asignar 1 si falla
      return 1
    }
    const used = (data || []).map(r => Number(r.cono)).filter(n => Number.isFinite(n) && n > 0).sort((a,b)=>a-b)
    // encontrar el primer entero positivo no usado
    let expected = 1
    for (const n of used) {
      if (n === expected) expected++
      else if (n > expected) break
    }
    return expected
  } catch (err) {
    console.error('assignCono exception', err)
    return 1
  }
}

// ------------------------
// Storage helpers
// ------------------------
// Reemplaza tu uploadFiles por esta versión mejorada
async function uploadFiles(vehiculoId, files, { upsert = false } = {}) {
  const bucket = 'vehiculos-photos' // asegúrate que coincide exactamente
  const uploaded = []

  // helper nombre seguro
  function safeFileName(name) {
    return name
      .replace(/\s+/g, '_')
      .replace(/[^A-Za-z0-9_\-\.]/g, '') // sólo caracteres seguros
      .slice(0, 200)
  }

  for (const file of files) {
    try {
      const uid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2,11)
      const filename = `${vehiculoId}/${Date.now()}_${uid}_${safeFileName(file.name)}`
      console.log('[uploadFiles] subiendo ->', filename, file)

      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filename, file, { cacheControl: '3600', upsert })

      // Si la SDK devuelve error, lo mostramos con detalle
      if (error) {
        console.error('[uploadFiles] error response:', error)
        // algunos errores devolvieron un `status` y `message` en error
        throw error
      }
      if (!data || !data.path) {
        console.warn('[uploadFiles] upload sin data.path:', data)
      }

      // Intentar obtener URL pública (si bucket es público)
      let publicUrl = null
      try {
        const { data: pData, error: pErr } = supabase.storage.from(bucket).getPublicUrl(data.path)
        if (pErr) console.warn('[uploadFiles] getPublicUrl error:', pErr)
        else publicUrl = pData?.publicUrl || pData?.publicURL || null
      } catch (e) { console.warn('[uploadFiles] getPublicUrl exception', e) }

      uploaded.push({
        path: data.path,
        name: file.name,
        publicUrl
      })

      console.log('[uploadFiles] ok ->', uploaded[uploaded.length-1])
    } catch (err) {
      console.error('[uploadFiles] excepción subiendo archivo', file.name, err)
      // re-lanzamos para que el flujo principal lo capture y muestre al usuario
      throw err
    }
  }

  return uploaded
}

// ------------------------
// getPublicUrlSync (robusto)
// ------------------------
function getPublicUrlSync(path, bucket = BUCKET) {
  if (!path) return null;
  try {
    // soporta recibir { path } u objeto con publicUrl
    if (typeof path === 'object') {
      if (path.publicUrl) return path.publicUrl;
      if (path.path) path = path.path;
    }
    const res = supabase.storage.from(bucket).getPublicUrl(path);
    // la SDK devuelve { data: { publicUrl } } o similar
    return res?.data?.publicUrl || res?.data?.publicURL || null;
  } catch (e) {
    console.warn('getPublicUrlSync error', e);
    return null;
  }
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

// ------------------------
// CREAR REGISTRO COMPLETO (modificado para asignar cono automáticamente)
// ------------------------
async function crearRegistroCompleto(input) {
  try {
    // resolver / crear cliente
    let cliente = null
    if (input.cliente_id) {
      const { data: clienteData, error: clienteErr } = await supabase.from('clientes').select('*').eq('id', input.cliente_id).single()
      if (clienteErr) throw clienteErr
      cliente = clienteData
    } else {
      cliente = await crearCliente(input.cliente)
    }

    // asignar cono disponible (solo si el payload no viene con uno)
    let assignedCono = null
    if (!input.vehiculo.cono) {
      try {
        assignedCono = await assignCono()
      } catch (e) {
        console.warn('crearRegistroCompleto: no se pudo asignar cono, continúa sin cono', e)
      }
    } else {
      assignedCono = input.vehiculo.cono
    }

    const payloadVehiculo = {
      cliente_id: cliente.id,
      marca: input.vehiculo.marca || null,
      modelo: input.vehiculo.modelo || null,
      color: input.vehiculo.color || null,
      placa: input.vehiculo.placa || null,
      kilometraje: input.vehiculo.kilometraje ?? null,
      checklist: input.vehiculo.checklist || {},
      tablero_photo_path: input.vehiculo.tableroPath || null,
      photos: input.vehiculo.photos || [],
      trabajo: input.vehiculo.trabajo || null,
      firma_path: input.vehiculo.firmaPath || null,
      clausula: input.vehiculo.clausula || null,
      status: input.vehiculo.status || 'activo',
      cono: assignedCono
    }

    const vehiculo = await crearVehiculo(payloadVehiculo)
    return { cliente, vehiculo }
  } catch (err) {
    console.error('crearRegistroCompleto error', err)
    throw err
  }
}

// update cliente / vehiculo
async function updateCliente(id, payload) {
  try {
    const { data, error } = await supabase.from('clientes').update(payload).eq('id', id).select().single()
    if (error) throw error
    return data
  } catch (err) {
    console.error('updateCliente error', err)
    throw err
  }
}

// ------------------------
// UPDATE VEHICULO (modificado: si status -> 'despachado' libera cono en la misma operación)
// ------------------------
async function updateVehiculo(id, payload) {
  try {
    // Si el payload pide despachar, asegurarnos de liberar cono (poner null)
    const toUpdate = { ...payload }
    if (payload && payload.status === 'despachado') {
      toUpdate.cono = null
    }
    const { data, error } = await supabase.from('vehiculos').update(toUpdate).eq('id', id).select().single()
    if (error) throw error
    return data
  } catch (err) {
    console.error('updateVehiculo error', err)
    throw err
  }
}

// ------------------------
// DELETE VEHICULO (mejorado): borra archivos asociados del storage y luego la fila en DB
// ------------------------
async function deleteVehiculo(id) {
  if (!id) throw new Error('deleteVehiculo: id inválido');
  try {
    // intentamos borrar y solicitamos el registro devuelto
    const { data, error, status } = await supabase
      .from('vehiculos')
      .delete()
      .eq('id', id)
      .select();

    if (error) {
      console.error('deleteVehiculo supabase error:', error);
      throw error;
    }
    // data es el/los registros borrados (array). Si está vacío, es extraño.
    if (!data || (Array.isArray(data) && data.length === 0)) {
      console.warn('deleteVehiculo: no se devolvió data, puede que no exista el id o no tengas permisos.');
    } else {
      console.log('deleteVehiculo OK, borrados:', data);
    }
    return data;
  } catch (err) {
    console.error('deleteVehiculo exception:', err);
    throw err;
  }
}

// ------------------------
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
      const fecha = r.created_at ? new Date(r.created_at).toLocaleString() : ''

      const div = document.createElement("div")
      div.className = "registro"
      if (r.status === 'despachado') div.classList.add('despachado')
      div.dataset.id = r.id
      // Guardar registro completo como dataset (stringify) para abrir modal sin nueva fetch (podemos fallback a fetch si es enorme)
      div.dataset.record = JSON.stringify(r)
      div.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
          <div>
            <h3 style="margin:0">${escapeHtml(nombreCliente)} — ${escapeHtml(marca)} ${escapeHtml(modelo)}</h3>
            <p style="margin:4px 0">Placa: ${escapeHtml(placa)} · KM: ${escapeHtml(String(km))}</p>
            <p style="margin:0;color:var(--muted)">Tel: ${escapeHtml(telefonoCliente)}</p>
          </div>
          <div style="text-align:right; font-size:0.9rem; color:var(--muted)">
            ${escapeHtml(fecha)}
          </div>
        </div>
      `
      // hover cursor
      div.style.cursor = 'pointer'
      // click abre modal con detalle
      div.addEventListener('click', () => {
        // preferir usar el objeto almacenado, si existe
        let registroObj = null
        try {
          registroObj = JSON.parse(div.dataset.record)
        } catch (e) { registroObj = r }
        openRegistroModal(registroObj)
      })
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
  // Si no hay main-screen en el DOM, lo creamos (evita quedar pegado en login si el HTML cambió)
  let main = document.getElementById("main-screen")
  if (!main) {
    console.warn("#main-screen no encontrado: creando uno automáticamente")
    main = document.createElement('section')
    main.id = 'main-screen'
    // cabecera mínima (no sobrescribimos si ya existe header principal)
    const headerHtml = `
      <header class="main-header">
        <div class="brand"><div class="brand-text"><h1>Centro Automotriz Eduardo</h1></div></div>
        <button id="logout-btn" style="display:none">Cerrar sesión</button>
      </header>
      <div id="main-actions-placeholder"></div>
      <main id="content"></main>
    `
    main.innerHTML = headerHtml
    document.getElementById('app')?.appendChild(main)
  }

  let actions = document.querySelector(".actions")
  if (!actions) {
    actions = document.createElement("div")
    actions.className = "actions"
    const content = document.getElementById("content") || document.createElement('main')
    const mainEl = document.getElementById('main-screen')
    mainEl.insertBefore(actions, content)
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
// Función para buscar por placa (MODIFICADO para incluir ID)
// ------------------------
async function buscarPorPlaca(placa) {
  if (!placa) return null
  try {
    const placaTrim = placa.trim()
    const { data, error } = await supabase
      .from('vehiculos')
      .select('id,marca,modelo,color,placa,kilometraje,cliente_id')
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

// ------------------------
// Función para buscar por teléfono (MODIFICADO para incluir ID)
// ------------------------
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
// Formulario Registrar + firma + subida + submit (MODIFICADO)
// ------------------------
function renderRegistrarForm() {
  const content = document.getElementById("content")
  if (!content) return

  // limpiar arrays de fotos por si hay restos
  selectedTableroFiles = []
  selectedFotosFiles = []

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
          <div class="check-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px;">
            <label style="display: flex; justify-content: space-between; align-items: center;">
              <span>Bocinas</span>
              <input type="checkbox" name="check" value="bocinas">
            </label>
            <label style="display: flex; justify-content: space-between; align-items: center;">
              <span>Aire acondicionado</span>
              <input type="checkbox" name="check" value="aire_acondicionado">
            </label>
            <label style="display: flex; justify-content: space-between; align-items: center;">
              <span>Radio</span>
              <input type="checkbox" name="check" value="radio">
            </label>
            <label style="display: flex; justify-content: space-between; align-items: center;">
              <span>Limpia vidrios</span>
              <input type="checkbox" name="check" value="limpia_vidrios">
            </label>
            <label style="display: flex; justify-content: space-between; align-items: center;">
              <span>Goma de repuesto</span>
              <input type="checkbox" name="check" value="goma_repuesto">
            </label>
            <label style="display: flex; justify-content: space-between; align-items: center;">
              <span>Llave de rueda</span>
              <input type="checkbox" name="check" value="llave_rueda">
            </label>
            <label style="display: flex; justify-content: space-between; align-items: center;">
              <span>Antenas</span>
              <input type="checkbox" name="check" value="antenas">
            </label>
            <label style="display: flex; justify-content: space-between; align-items: center;">
              <span>Alfombras</span>
              <input type="checkbox" name="check" value="alfombras">
            </label>
            <label style="display: flex; justify-content: space-between; align-items: center;">
              <span>Tapicería</span>
              <input type="checkbox" name="check" value="tapiceria">
            </label>
            <label style="display: flex; justify-content: space-between; align-items: center;">
              <span>Guardalodo</span>
              <input type="checkbox" name="check" value="guardalodo">
            </label>
            <label style="display: flex; justify-content: space-between; align-items: center;">
              <span>Ribete</span>
              <input type="checkbox" name="check" value="ribete">
            </label>
            <label style="display: flex; justify-content: space-between; align-items: center;">
              <span>Espejos</span>
              <input type="checkbox" name="check" value="espejos">
            </label>
            <label style="display: flex; justify-content: space-between; align-items: center;">
              <span>Documentos</span>
              <input type="checkbox" name="check" value="documentos">
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Fotos</legend>
          <label>Foto del tablero (una):</label>
          <div class="foto-section">
            <button type="button" id="btn-foto-tablero" class="btn-foto">+</button>
            <div id="preview-tablero" class="preview" aria-live="polite"></div>
          </div>

          <label>Fotos del vehículo (varias):</label>
          <div class="foto-section">
            <button type="button" id="btn-foto-vehiculo" class="btn-foto">+</button>
            <div id="preview-vehiculo" class="preview" aria-live="polite"></div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Trabajo a realizar</legend>
          <textarea id="trabajo-text" rows="5" placeholder="Describir lo que se le hará al vehículo..."></textarea>
        </fieldset>

        <fieldset>
          <legend>Firma</legend>
          <div class="signature-wrap">
            <p class="clausula"><strong>Cláusula:</strong> Lorem ipsum dolor sit amet, consectetur adipisicing elit...</p>
            <canvas id="signature-pad" width="600" height="200" style="border:1px solid rgba(0,0,0,0.08); border-radius:8px;"></canvas>
            <div style="margin-top:8px;">
              <button type="button" id="clear-sign">Limpiar firma</button>
            </div>
          </div>
        </fieldset>

        <div style="display:flex;gap:12px;align-items:center;margin-top:12px;">
          <button class="btn btn-primary" type="submit" id="submit-registrar">Guardar registro</button>
          <div id="registrar-status" style="color:var(--muted)"></div>
        </div>
      </form>
    </div>
  `

  // ocultar logout mientras se llena el formulario
  const logoutBtn = document.getElementById("logout-btn")
  if (logoutBtn) logoutBtn.style.display = 'none'

  initSignaturePad()

  const form = document.getElementById("registrar-form")
  if (form) form.addEventListener("submit", handleRegistrarSubmit)

  // BOTÓN + para foto tablero (abre cámara en móvil o selector en PC)
  const btnTab = document.getElementById('btn-foto-tablero')
  if (btnTab) {
    btnTab.addEventListener('click', () => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      // apertura de cámara en móviles si está disponible
      if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) input.setAttribute('capture', 'environment')
      input.onchange = () => {
        selectedTableroFiles = input.files && input.files.length ? [input.files[0]] : []
        renderPreview('tablero', selectedTableroFiles)
      }
      input.click()
    })
  }

  // BOTÓN + para fotos vehiculo (múltiples)
  const btnVeh = document.getElementById('btn-foto-vehiculo')
  if (btnVeh) {
    btnVeh.addEventListener('click', () => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.multiple = true
      if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) input.setAttribute('capture', 'environment')
      input.onchange = () => {
        selectedFotosFiles = input.files ? Array.from(input.files) : []
        renderPreview('vehiculo', selectedFotosFiles)
      }
      input.click()
    })
  }

  // BUSCAR placa/telefono (mismos handlers que antes)
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

// ---------- RENDER PREVIEW (Formularios) ----------
// Reemplaza tu renderPreview anterior por esta versión.
// NOTA: esta función asume que `selectedTableroFiles` y `selectedFotosFiles` (o arrays) 
// están siendo actualizados por los inputs al seleccionar archivos.
function renderPreview(target, files) {
  const preview = document.getElementById('preview-' + target);
  if (!preview) return;
  preview.innerHTML = '';

  // files puede ser FileList o array
  const fileArray = files ? Array.from(files) : [];

  fileArray.forEach((file, idx) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'img-wrapper';

    const img = document.createElement('img');
    img.alt = file.name || `imagen-${idx}`;

    // al click: abrir lightbox
    img.style.cursor = 'pointer';
    img.addEventListener('click', () => {
      // si es local (dataURL) estará ya en src; abrir con esa url
      // si no, intentamos abrir por objeto File (no será posible). Para form previews siempre usamos dataURL.
      if (img.src) openLightbox(img.src, img.alt);
    });

    // botón para eliminar la foto seleccionada (solo en formulario)
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-btn';
    removeBtn.title = 'Eliminar foto';
    removeBtn.innerText = '×';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // remover del DOM preview
      wrapper.remove();
      // también remover del array global correspondiente
      if (target === 'tablero') {
        selectedTableroFiles = selectedTableroFiles.filter((f, i) => !(i === idx));
      } else if (target === 'vehiculo') {
        selectedFotosFiles = selectedFotosFiles.filter((f, i) => !(i === idx));
      }
      // volver a renderizar (re-index)
      if (target === 'tablero') renderPreview('tablero', selectedTableroFiles);
      else renderPreview('vehiculo', selectedFotosFiles);
    });

    wrapper.appendChild(img);
    wrapper.appendChild(removeBtn);
    preview.appendChild(wrapper);

    // leer archivo como DataURL
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });

  // Si no hay archivos, mostrar hint
  if (!fileArray.length) {
    preview.innerHTML = `<div style="color:var(--muted);font-size:0.95rem">No hay imágenes seleccionadas.</div>`;
  }
}

// ------------------------
// Setup photo buttons (adjuntar a botones de la UI): usa append para vehiculo y replace para tablero
// Llama a esta función desde renderRegistrarForm() justo después de renderizar el HTML.
// ------------------------
function setupPhotoButtons() {
  const btnTab = document.getElementById('btn-foto-tablero')
  if (btnTab) {
    btnTab.addEventListener('click', () => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      // intento de abrir cámara en móviles
      if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) input.setAttribute('capture', 'environment')
      input.onchange = () => {
        // reemplazamos tablero (solo 1)
        selectedTableroFiles = input.files && input.files.length ? [input.files[0]] : []
        renderPreview('tablero', selectedTableroFiles)
      }
      input.click()
    })
  }

  const btnVeh = document.getElementById('btn-foto-vehiculo')
  if (btnVeh) {
    btnVeh.addEventListener('click', () => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.multiple = true
      if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) input.setAttribute('capture', 'environment')
      input.onchange = () => {
        const newFiles = input.files ? Array.from(input.files) : []
        // append (no reemplazar) — para tablets donde antes se perdían las anteriores
        selectedFotosFiles = (selectedFotosFiles || []).concat(newFiles)
        renderPreview('vehiculo', selectedFotosFiles)
      }
      input.click()
    })
  }
}

// ------------------------
// signature pad: se ajusta el canvas al contenedor para que NO sobresalga (versión mejorada)
// ------------------------
function initSignaturePad() {
  const canvas = document.getElementById('signature-pad')
  if (!canvas) return

  // ajustar tamaño del canvas para que quepa en su contenedor y no sobresalga
  function resizeCanvasToDisplaySize() {
    const ratio = window.devicePixelRatio || 1
    // limitar ancho al 100% del contenedor padre
    const parent = canvas.parentElement || document.body
    const maxW = Math.max(300, Math.min(900, parent.clientWidth - 32)) // valores razonables
    const desiredWidth = maxW
    const desiredHeight = canvas.height // mantener altura definida
    canvas.style.width = desiredWidth + 'px'
    canvas.style.height = desiredHeight + 'px'
    canvas.width = Math.floor(desiredWidth * ratio)
    canvas.height = Math.floor(desiredHeight * ratio)
    const ctx = canvas.getContext('2d')
    ctx.scale(ratio, ratio)
    // opcional: mantener estilo de stroke tras resize
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#0f172a'
  }

  // inicial resize
  resizeCanvasToDisplaySize()
  // re-resize on window resize
  window.addEventListener('resize', () => {
    // guardamos la imagen actual para re-dibujar (si quieres mantener la firma entre resizes tendrías que serializarla)
    resizeCanvasToDisplaySize()
  })

  const ctx = canvas.getContext('2d')
  let drawing = false
  let last = { x: 0, y: 0 }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect()
    if (e.touches && e.touches.length) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    } else {
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
      // limpiar canvas respetando el tamaño actual
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

// Submit handler (usa selectedTableroFiles y selectedFotosFiles)
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

    // usar arrays seleccionadas en lugar de inputs DOM
    const tableroFiles = selectedTableroFiles || []
    const fotosFiles = selectedFotosFiles || []

    console.log('[handleRegistrarSubmit] archivos seleccionados:', { tableroFiles, fotosFiles })

    let firmaPath = null
    const firmaBlob = await getSignatureBlob()
    if (firmaBlob) {
      try {
        const file = new File([firmaBlob], `firma_${vehiculoId}.png`, { type: 'image/png' })
        const { data: firmaData, error: firmaErr } = await supabase.storage
          .from('vehiculos-photos')
          .upload(`${vehiculoId}/firma_${Date.now()}.png`, file, { cacheControl: '3600', upsert: false })
        if (firmaErr) console.warn("No se pudo subir firma:", firmaErr)
        else {
          firmaPath = firmaData.path
          console.log('[handleRegistrarSubmit] firma subida ->', firmaPath)
        }
      } catch (err) { console.warn('Error subiendo firma:', err) }
    }

    // subir tablero
    let tableroPath = null
    if (tableroFiles.length) {
      try {
        console.log('[handleRegistrarSubmit] subiendo foto del tablero...')
        const uploadedTab = await uploadFiles(vehiculoId, tableroFiles)
        console.log('[handleRegistrarSubmit] uploadedTab:', uploadedTab)
        if (uploadedTab && uploadedTab.length) tableroPath = uploadedTab[0].path
      } catch (err) { console.warn('Error subir tablero', err) }
    } else {
      console.log('[handleRegistrarSubmit] no hay archivo de tablero seleccionado')
    }

    // subir fotos
    let fotosPaths = []
    if (fotosFiles.length) {
      try {
        console.log('[handleRegistrarSubmit] subiendo fotos del vehículo...')
        const uploaded = await uploadFiles(vehiculoId, fotosFiles)
        console.log('[handleRegistrarSubmit] uploaded fotos:', uploaded)
        // guardamos únicamente las rutas (strings) o el objeto completo según prefieras
        fotosPaths = uploaded.map(u => ({ path: u.path, name: u.name, publicUrl: u.publicUrl }))
      } catch (err) { console.warn('Error subir fotos', err) }
    } else {
      console.log('[handleRegistrarSubmit] no hay fotos del vehiculo seleccionadas')
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

    // LOG final para depuración: revisa que tableroPath y photos no estén vacíos
    console.log('[handleRegistrarSubmit] payload a guardar en BD:', JSON.stringify(input, null, 2))

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

    // limpiar previews y arrays
    selectedTableroFiles = []
    selectedFotosFiles = []
    const pTab = document.getElementById('preview-tablero')
    const pVeh = document.getElementById('preview-vehiculo')
    if (pTab) pTab.innerHTML = ''
    if (pVeh) pVeh.innerHTML = ''

    // volver a mostrar logout ahora que terminaste el formulario
    const logoutBtn = document.getElementById("logout-btn")
    if (logoutBtn) logoutBtn.style.display = 'inline-block'

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
// LIGHTBOX (visor de imagenes)
// ------------------------
function ensureImageLightbox() {
  if (document.getElementById('img-lightbox')) return;
  const lb = document.createElement('div');
  lb.id = 'img-lightbox';
  lb.style = `
    position:fixed; inset:0; display:flex; align-items:center; justify-content:center;
    background: rgba(0,0,0,0.75); z-index: 10010; padding:20px;
  `;
  lb.setAttribute('aria-hidden', 'true');
  lb.innerHTML = `
    <div style="position:relative;max-width:95%;max-height:95%;">
      <button id="img-lightbox-close" aria-label="Cerrar" style="position:absolute;right:-8px;top:-8px;background:#fff;border-radius:999px;border:none;padding:6px 10px;cursor:pointer;font-weight:700;z-index:10">✕</button>
      <img id="img-lightbox-img" src="" alt="" style="display:block;max-width:100%;max-height:85vh;border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,0.4)" />
    </div>
  `;
  document.body.appendChild(lb);

  document.getElementById('img-lightbox-close').addEventListener('click', closeLightbox);
  lb.addEventListener('click', (e) => { if (e.target === lb) closeLightbox(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });
}

function openLightbox(url, alt = '') {
  try {
    ensureImageLightbox();
    const lb = document.getElementById('img-lightbox');
    const img = document.getElementById('img-lightbox-img');
    if (!lb || !img) return;
    img.src = url || '';
    img.alt = alt || '';
    lb.setAttribute('aria-hidden', 'false');
    lb.style.display = 'flex';
  } catch (err) {
    console.warn('openLightbox error', err);
  }
}

function closeLightbox() {
  const lb = document.getElementById('img-lightbox');
  if (!lb) return;
  lb.setAttribute('aria-hidden', 'true');
  lb.style.display = 'none';
  const img = document.getElementById('img-lightbox-img');
  if (img) img.src = '';
}

// ------------------------
// MODAL / VER registros (abrir, editar, despachar, borrar)
// ------------------------

function openModal() {
  const modal = document.getElementById('modal')
  if (!modal) return
  modal.setAttribute('aria-hidden', 'false')
  document.body.style.overflow = 'hidden'
}

function closeModal() {
  const modal = document.getElementById('modal')
  if (!modal) return
  modal.setAttribute('aria-hidden', 'true')
  document.body.style.overflow = ''
  const logoutBtn = document.getElementById("logout-btn")
  if (logoutBtn) logoutBtn.style.display = 'inline-block'
}

// cerrar modal al click backdrop o botón close
document.addEventListener('click', (e) => {
  if (!e.target) return
  if (e.target.id === 'modal-backdrop' || e.target.id === 'modal-close') {
    closeModal()
  }
})

async function openRegistroModal(registro) {
  // ocultar logout mientras modal abierto
  const logoutBtn = document.getElementById("logout-btn")
  if (logoutBtn) logoutBtn.style.display = 'none'

  // Asegúrate de tener el registro completo: si el objeto no contiene fotos o cliente, intenta recargarlo
  let r = registro
  if (!r || !r.id) {
    alert('Registro inválido')
    return
  }

  // Si no trae cliente completo y trae cliente_id, cargar cliente
  let cliente = null
  if (r.clientes) {
    cliente = Array.isArray(r.clientes) ? r.clientes[0] : r.clientes
  } else if (r.cliente) {
    cliente = r.cliente
  } else if (r.cliente_id) {
    try {
      const { data } = await supabase.from('clientes').select('*').eq('id', r.cliente_id).single()
      cliente = data
    } catch (e) { console.warn('no se pudo cargar cliente', e) }
  }

  renderModalContent(r, cliente)
  openModal()
}

// ------------------------
// Modal render content (MODIFICADO para checkboxes con mismo estilo)
// ------------------------
function renderModalContent(registro, cliente) {
  const body = document.getElementById('modal-body')
  if (!body) return

  // normalizar campos posibles
  const veh = registro || {}
  const nombreCliente = cliente ? (cliente.nombre || '') : (registro.cliente_nombre || '')
  const telefonoCliente = cliente ? (cliente.telefono || '') : (registro.cliente_telefono || '')
  const direccionCliente = cliente ? (cliente.direccion || '') : ''

  // fotos: soporta array de strings o array de objects {path, name, publicUrl}
  const photos = veh.photos || []
  const tablero = veh.tablero_photo_path || veh.tableroPath || ''

  // procesar checklist para mostrar checkboxes
  const checklist = veh.checklist || {}
  const checkboxItems = [
    'bocinas', 'aire_acondicionado', 'radio', 'limpia_vidrios', 'goma_repuesto', 
    'llave_rueda', 'antenas', 'alfombras', 'tapiceria', 'guardalodo', 'ribete', 'espejos', 'documentos'
  ]

  const checkboxHtml = checkboxItems.map(item => {
    const checked = checklist[item] ? 'checked' : ''
    const label = item.replace(/_/g, ' ').split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ')
    return `
      <label style="display: flex; justify-content: space-between; align-items: center;">
        <span>${label}</span>
        <input type="checkbox" name="check" value="${item}" ${checked} disabled>
      </label>
    `
  }).join('')

  body.innerHTML = `
    <div class="modal-body">
      <div class="row">
        <div style="flex:1 1 220px">
          <label>Cliente</label>
          <input readonly id="m_cliente_nombre" value="${escapeHtml(nombreCliente)}" />
        </div>
        <div style="flex:1 1 160px">
          <label>Teléfono</label>
          <input readonly id="m_cliente_telefono" value="${escapeHtml(telefonoCliente)}" />
        </div>
        <div style="flex:1 1 240px">
          <label>Dirección</label>
          <input readonly id="m_cliente_direccion" value="${escapeHtml(direccionCliente)}" />
        </div>
      </div>

      <div class="row">
        <div style="flex:1 1 160px">
          <label>Marca</label>
          <input readonly id="m_veh_marca" value="${escapeHtml(veh.marca || veh.vehiculo_marca || '')}" />
        </div>
        <div style="flex:1 1 160px">
          <label>Modelo</label>
          <input readonly id="m_veh_modelo" value="${escapeHtml(veh.modelo || veh.vehiculo_modelo || '')}" />
        </div>
        <div style="flex:1 1 120px">
          <label>Color</label>
          <input readonly id="m_veh_color" value="${escapeHtml(veh.color || veh.vehiculo_color || '')}" />
        </div>
        <div style="flex:1 1 120px">
          <label>Placa</label>
          <input readonly id="m_veh_placa" value="${escapeHtml(veh.placa || veh.vehiculo_placa || '')}" />
        </div>
        <div style="flex:1 1 120px">
          <label>Kilometraje</label>
          <input readonly id="m_veh_km" value="${escapeHtml(String(veh.kilometraje ?? veh.vehiculo_kilometraje ?? ''))}" />
        </div>
      </div>

      <div class="row">
        <div style="flex:1 1 100%">
          <label>Checklist</label>
          <div class="check-grid" id="m_checklist" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; background: #f8fafc; padding: 12px; border-radius: 8px;">
            ${checkboxHtml}
          </div>
        </div>
      </div>

      <div class="row">
        <div style="flex:1 1 100%">
          <label>Trabajo a realizar</label>
          <textarea readonly id="m_trabajo">${escapeHtml(veh.trabajo || '')}</textarea>
        </div>
      </div>

      <div class="row">
        <div style="flex:1 1 50%">
          <label>Foto tablero</label>
          <div id="m_preview_tablero" class="modal-preview"></div>
        </div>
        <div style="flex:1 1 50%">
          <label>Fotos vehículo</label>
          <div id="m_preview_vehiculo" class="modal-preview"></div>
        </div>
      </div>

      <div class="row">
        <div style="flex:1 1 100%; color:var(--muted); font-size:0.9rem">
          <label>Creado</label>
          <div>${veh.created_at ? new Date(veh.created_at).toLocaleString() : ''}</div>
        </div>
      </div>
    </div>
  `

  // renderizar fotos (intenta obtener public url si photos es array de rutas o de objects)
  const previewTab = document.getElementById('m_preview_tablero')
  const previewVeh = document.getElementById('m_preview_vehiculo')
  if (previewTab) previewTab.innerHTML = ''
  if (previewVeh) previewVeh.innerHTML = ''

  // helper para generar url pública si es posible
  const bucket = 'vehiculos-photos'
  // dentro de renderModalContent --> helper addImg actualizado
  const addImg = (container, pathOrObj) => {
    if (!container || !pathOrObj) return;
    const img = document.createElement('img');
    img.style.cursor = 'zoom-in';
    img.style.width = '120px';
    img.style.height = '80px';
    img.style.objectFit = 'cover';
    img.style.borderRadius = '8px';
    img.style.marginRight = '8px';

    let src = '';
    let alt = '';

    if (typeof pathOrObj === 'string') {
      alt = pathOrObj.split('/').pop() || 'foto';
      src = getPublicUrlSync(pathOrObj);
    } else if (pathOrObj && pathOrObj.publicUrl) {
      src = pathOrObj.publicUrl;
      alt = pathOrObj.name || pathOrObj.path || 'foto';
    } else if (pathOrObj && pathOrObj.path) {
      src = getPublicUrlSync(pathOrObj.path);
      alt = pathOrObj.name || pathOrObj.path || 'foto';
    }

    if (!src) {
      const no = document.createElement('div');
      no.innerText = 'Imagen no disponible';
      no.style.color = 'var(--muted)';
      container.appendChild(no);
      return;
    }

    img.src = src;
    img.alt = alt;
    img.addEventListener('click', () => openLightbox(src, alt));
    container.appendChild(img);
  };


  if (tablero) {
    addImg(previewTab, tablero)
  }
  if (Array.isArray(photos) && photos.length) {
    photos.forEach(p => addImg(previewVeh, p))
  }

  // configurar botones modal (edit, save, despachar, delete)
  const btnEdit = document.getElementById('btn-modal-edit')
  const btnSave = document.getElementById('btn-modal-save')
  const btnDesp = document.getElementById('btn-modal-despachar')
  const btnDel = document.getElementById('btn-modal-delete')

  // guardar registro id y cliente id en data-attributes para referencias
  const modalPanel = document.querySelector('.modal-panel')
  if (modalPanel) {
    modalPanel.dataset.vehId = registro.id || ''
    modalPanel.dataset.clienteId = registro.cliente_id || (cliente ? (cliente.id || '') : '')
  }

  // estado editable
  let isEditing = false

  // asegurar visibilidad inicial
  if (btnSave) btnSave.style.display = 'none'
  if (btnEdit) btnEdit.style.display = 'inline-block'

  // boton editar: pedir contraseña, activar edición
  if (btnEdit) {
    btnEdit.onclick = async () => {
      const ok = await promptPasswordAndVerify()
      if (!ok) return
      toggleModalEditable(true)
      isEditing = true
      btnEdit.style.display = 'none'
      if (btnSave) btnSave.style.display = 'inline-block'
    }
  }

  // boton guardar: recoger campos y actualizar (incluyendo checklist)
  if (btnSave) {
    btnSave.onclick = async () => {
      try {
        btnSave.disabled = true
        const vehId = modalPanel?.dataset?.vehId
        const cliId = modalPanel?.dataset?.clienteId || null

        const updatedCliente = {
          nombre: (document.getElementById('m_cliente_nombre')?.value || '').trim(),
          telefono: (document.getElementById('m_cliente_telefono')?.value || '').trim(),
          direccion: (document.getElementById('m_cliente_direccion')?.value || '').trim()
        }

        // recoger checklist del modal
        const checklistData = {}
        const checkboxes = document.querySelectorAll('#m_checklist input[type="checkbox"]')
        checkboxes.forEach(cb => {
          checklistData[cb.value] = cb.checked
        })

        const updatedVeh = {
          marca: (document.getElementById('m_veh_marca')?.value || '').trim(),
          modelo: (document.getElementById('m_veh_modelo')?.value || '').trim(),
          color: (document.getElementById('m_veh_color')?.value || '').trim(),
          placa: (document.getElementById('m_veh_placa')?.value || '').trim(),
          kilometraje: parseInt(document.getElementById('m_veh_km')?.value || 0, 10),
          trabajo: (document.getElementById('m_trabajo')?.value || '').trim(),
          checklist: checklistData
        }

        if (cliId) {
          await updateCliente(cliId, updatedCliente)
          await updateVehiculo(vehId, updatedVeh)
        } else {
          // crear cliente nuevo y asociar
          const newCli = await crearCliente(updatedCliente)
          await updateVehiculo(vehId, { cliente_id: newCli.id, ...updatedVeh })
        }

        alert('Cambios guardados correctamente')
        toggleModalEditable(false)
        btnSave.style.display = 'none'
        if (btnEdit) btnEdit.style.display = 'inline-block'
        await cargarRegistros()
      } catch (err) {
        console.error('Error guardando cambios', err)
        alert('Error al guardar cambios')
      } finally {
        if (btnSave) btnSave.disabled = false
      }
    }
  }

  // despachar -> pedir password -> marcar status 'despachado'
  if (btnDesp) {
    btnDesp.onclick = async () => {
      const ok = await promptPasswordAndVerify()
      if (!ok) return
      try {
        btnDesp.disabled = true
        const vehId = registro.id
        await updateVehiculo(vehId, { status: 'despachado' })
        alert('Registro marcado como despachado')
        closeModal()
        await cargarRegistros()
      } catch (err) {
        console.error('Error despachando', err)
        alert('Error al despachar')
      } finally {
        btnDesp.disabled = false
      }
    }
  }

  // borrar -> pedir password -> eliminar
  if (btnDel) {
    btnDel.onclick = async () => {
      const ok = await promptPasswordAndVerify()
      if (!ok) return
      if (!confirm('¿Seguro que deseas borrar este registro? Esta acción no se puede deshacer.')) return
      try {
        btnDel.disabled = true
        const vehId = registro.id
        await deleteVehiculo(vehId)
        alert('Registro eliminado')
        closeModal()
        await cargarRegistros()
      } catch (err) {
        console.error('Error borrando registro', err)
        alert('Error al borrar registro')
      } finally {
        btnDel.disabled = false
      }
    }
  }

  // Si ya está despachado, deshabilitar despachar
  if (registro.status === 'despachado' && btnDesp) {
    btnDesp.disabled = true
  } else if (btnDesp) {
    btnDesp.disabled = false
  }
}

// ------------------------
// toggle inputs readonly state (MODIFICADO para checkboxes)
// ------------------------
function toggleModalEditable(editable) {
  const inputs = document.querySelectorAll('#modal-body input:not([type="checkbox"]), #modal-body textarea')
  const checkboxes = document.querySelectorAll('#modal-body input[type="checkbox"]')
  
  inputs.forEach(inp => {
    if (editable) {
      inp.removeAttribute('readonly')
      inp.style.background = '#fff'
      // si es textarea, ampliar un poco
      if (inp.tagName.toLowerCase() === 'textarea') inp.style.minHeight = '80px'
    } else {
      inp.setAttribute('readonly', 'readonly')
      inp.style.background = '#f8fafc'
    }
  })

  // manejar checkboxes por separado
  checkboxes.forEach(cb => {
    cb.disabled = !editable
  })

  // cambiar estilo del contenedor de checklist
  const checklistContainer = document.getElementById('m_checklist')
  if (checklistContainer) {
    if (editable) {
      checklistContainer.style.background = '#fff'
      checklistContainer.style.border = '1px solid #e2e8f0'
    } else {
      checklistContainer.style.background = '#f8fafc'
      checklistContainer.style.border = 'none'
    }
  }
}

// escape simple helper to avoid HTML injection in values
function escapeHtml(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// ------------------------
// Realtime + Notificaciones (pide permiso y suena)
// ------------------------
async function setupRealtimeNotifications() {
  // pedir permiso para notificaciones browser
  if ('Notification' in window && Notification.permission !== 'granted') {
    try {
      await Notification.requestPermission()
    } catch (e) {
      console.warn('No se pudo solicitar permiso de notificaciones', e)
    }
  }

  // crear sonido simple con WebAudioAPI para evitar dependencia de ficheros
  function playNotificationSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = 880
      g.gain.value = 0.0015
      o.connect(g)
      g.connect(ctx.destination)
      o.start()
      // subir volumen ligeramente y detener
      g.gain.exponentialRampToValueAtTime(0.02, ctx.currentTime + 0.02)
      setTimeout(() => {
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12)
        setTimeout(() => { try { o.stop(); ctx.close() } catch(e){} }, 150)
      }, 120)
    } catch (e) {
      console.warn('playNotificationSound error', e)
    }
  }

  // subscribir al canal si no lo hemos hecho
  try {
    // usamos un canal con nombre único
    const channel = supabase.channel('vehiculos_changes_ui')

    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'vehiculos' }, payload => {
      console.log('Realtime vehiculos payload', payload)
      // si es INSERT -> mostrar notificación y reproducir sonido, recargar lista
      if (payload.eventType === 'INSERT') {
        const newRec = payload.new || payload.record || {}
        const title = 'Nuevo registro'
        const body = `${newRec.placa ? ('Placa: ' + newRec.placa + ' · ') : ''}${newRec.marca || ''} ${newRec.modelo || ''}`
        // mostrar notificación si permiso
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            const n = new Notification(title, { body, silent: true })
            // clic abre la app o trae foco
            n.onclick = () => window.focus()
          } catch (e) { console.warn('Notification error', e) }
        }
        // reproducir sonido
        playNotificationSound()
        // recargar registros en UI
        cargarRegistros().catch(e => console.error('Error recargando registros por realtime', e))
      } else if (payload.eventType === 'UPDATE' || payload.eventType === 'DELETE') {
        // recargar para mantener UI sincronizada
        cargarRegistros().catch(e => console.error('Error recargando registros por realtime', e))
      }
    })

    await channel.subscribe()
    console.log('Realtime subscription establecida (vehiculos_changes_ui)')
  } catch (e) {
    console.warn('setupRealtimeNotifications: no se pudo suscribir', e)
  }
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
  let logoutBtn = document.getElementById("logout-btn")
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
      // mostrar logout si login exitoso (se maneja en showMainScreen)
    })
  } else {
    console.warn("No se encontró #login-form en el DOM")
  }

  // asegurar logout listener
  logoutBtn = document.getElementById("logout-btn")
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

  // attach listeners adicionales (modal close btn id might be present)
  const modalClose = document.getElementById('modal-close')
  if (modalClose) modalClose.addEventListener('click', closeModal)

  try { attachMainListeners() } catch (err) { console.warn("attachMainListeners fallo:", err) }
})