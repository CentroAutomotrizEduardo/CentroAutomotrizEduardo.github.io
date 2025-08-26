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
  document.getElementById("login-screen").hidden = true
  document.getElementById("main-screen").hidden = false
}

function showLoginScreen() {
  document.getElementById("login-screen").hidden = false
  document.getElementById("main-screen").hidden = true
}

// ------------------------
// INICIALIZACIÓN
// ------------------------
document.addEventListener('DOMContentLoaded', async () => {
  // Atar listener del formulario de login
  const loginForm = document.getElementById("login-form")
  const loginError = document.getElementById("login-error")
  loginError.textContent = ""

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault()
      loginError.textContent = ""
      const usuario = document.getElementById("usuario").value.trim()
      const contrasena = document.getElementById("contrasena").value
      if (!usuario || !contrasena) {
        loginError.textContent = "Ingresa usuario y contraseña"
        return
      }
      await login(usuario, contrasena)
    })
  } else {
    console.warn("No se encontró #login-form en el DOM")
  }

  // Atar logout (si existe)
  const logoutBtn = document.getElementById("logout-btn")
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("usuario")
      showLoginScreen()
    })
  }

  // Si ya hay usuario en localStorage, saltar al main
  const saved = localStorage.getItem("usuario")
  if (saved) {
    console.log("Usuario en localStorage:", saved)
    showMainScreen()
    await cargarRegistros()
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

  // (Opcional) suscripción realtime para actualizar lista automáticamente
  try {
    supabase.channel('vehiculos-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehiculos' }, payload => {
        console.log("Realtime payload:", payload)
        // recarga lista cada vez que detectamos un cambio
        cargarRegistros().catch(e => console.error(e))
      })
      .subscribe()
  } catch (err) {
    console.warn("Realtime: no se pudo subscribir", err)
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
  // quitar atributo hidden si aún existe
  main.hidden = false
  // asegurar que el contenedor de acciones exista y tenga botones
  let actions = document.querySelector(".actions")
  if (!actions) {
    actions = document.createElement("div")
    actions.className = "actions"
    // insertar antes del content
    const content = document.getElementById("content")
    main.insertBefore(actions, content)
  }

  // crear botones si no existen
  if (!document.getElementById("btn-registrar")) {
    const btn1 = document.createElement("button")
    btn1.id = "btn-registrar"
    btn1.textContent = "Registrar vehículo"
    actions.appendChild(btn1)
  }
  if (!document.getElementById("btn-ver")) {
    const btn2 = document.createElement("button")
    btn2.id = "btn-ver"
    btn2.textContent = "Ver registros"
    actions.appendChild(btn2)
  }

  // forzar estilo visible (evita CSS inesperado)
  actions.style.display = "flex"
  actions.style.gap = "8px"

  // atar listeners (solo una vez)
  attachMainListeners()
}

function attachMainListeners() {
  const btnRegistrar = document.getElementById("btn-registrar")
  const btnVer = document.getElementById("btn-ver")
  if (btnRegistrar && !btnRegistrar._attached) {
    btnRegistrar.addEventListener("click", () => {
      // aquí pones tu lógica para abrir formulario de registro
      document.getElementById("content").innerHTML = "<p>Formulario de registrar vehículo (a implementar)</p>"
    })
    btnRegistrar._attached = true
  }
  if (btnVer && !btnVer._attached) {
    btnVer.addEventListener("click", async () => {
      // mostrar registros
      document.getElementById("content").innerHTML = "<p>Cargando registros...</p>"
      await cargarRegistros()
    })
    btnVer._attached = true
  }

  // asegurar logout
  const logoutBtn = document.getElementById("logout-btn")
  if (logoutBtn && !logoutBtn._attached) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("usuario")
      document.getElementById("login-screen").hidden = false
      document.getElementById("main-screen").hidden = true
      document.getElementById("content").innerHTML = ""
    })
    logoutBtn._attached = true
  }
}

// actualizar showMainScreen para usar ensureMainUI
function showMainScreen() {
  const login = document.getElementById("login-screen")
  const main = document.getElementById("main-screen")
  if (login) login.hidden = true
  if (main) main.hidden = false
  ensureMainUI()
}

