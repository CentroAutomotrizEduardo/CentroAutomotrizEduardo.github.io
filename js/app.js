import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// 🔹 URL correcta de tu proyecto Supabase
const SUPABASE_URL = 'https://tsxojomiriruedjvnsgj.supabase.co' // ❌ NO usar /dashboard/project/...
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeG9qb21pcmlydWVkanZuc2dqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYyMTcyOTksImV4cCI6MjA3MTc5MzI5OX0.4dgZ-dMXgrWlgh9vjkaY0n1yv0aInWIwn51kboLM_6k'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// 🔹 Login
async function login(usuario, contrasena) {
  console.log("Intentando login con:", usuario, contrasena)

  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('usuario', usuario)
    .eq('contrasena', contrasena)
    .single()

  console.log("Data:", data)
  console.log("Error:", error)

  if (error || !data) {
    document.getElementById('login-error').textContent = "Usuario o contraseña incorrectos"
    return null
  } else {
    localStorage.setItem("usuario", data.usuario)
    document.getElementById("login-screen").hidden = true
    document.getElementById("main-screen").hidden = false
    cargarRegistros() // carga inicial de registros
    return data
  }
}

window.login = login // necesario para que HTML pueda llamar login()

// 🔹 Subida de fotos
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

// 🔹 Crear registro de vehículo
async function crearRegistro(payload) {
  const { data, error } = await supabase
    .from('vehiculos')
    .insert([ payload ])
    .select()
  if (error) throw error
  return data[0]
}

// 🔹 Listar registros
async function listarRegistros() {
  const { data, error } = await supabase
    .from('vehiculos')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

// 🔹 Cargar registros en el DOM
async function cargarRegistros() {
  const registros = await listarRegistros()
  const contenedor = document.getElementById("content")
  contenedor.innerHTML = ""
  registros.forEach(r => {
    const div = document.createElement("div")
    div.className = "registro"
    div.innerHTML = `
      <h3>${r.cliente_nombre} - ${r.vehiculo_marca} ${r.vehiculo_modelo}</h3>
      <p>Placa: ${r.vehiculo_placa}</p>
      <p>Fecha: ${r.created_at}</p>
    `
    contenedor.appendChild(div)
  })
}

// 🔹 Logout
document.getElementById("logout-btn").addEventListener("click", () => {
  localStorage.removeItem("usuario")
  document.getElementById("login-screen").hidden = false
  document.getElementById("main-screen").hidden = true
})
