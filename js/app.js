import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://supabase.com/dashboard/project/tsxojomiriruedjvnsgj'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeG9qb21pcmlydWVkanZuc2dqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYyMTcyOTksImV4cCI6MjA3MTc5MzI5OX0.4dgZ-dMXgrWlgh9vjkaY0n1yv0aInWIwn51kboLM_6k' // la anon key

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)


const loginForm = document.getElementById("login-form")
const errorDiv = document.getElementById("login-error")

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault()
  const usuario = document.getElementById("usuario").value
  const contrasena = document.getElementById("contrasena").value

  // ejemplo de verificación contra supabase
  const { data, error } = await supabase
    .from("usuarios")
    .select("*")
    .eq("usuario", usuario)
    .eq("contrasena", contrasena)
    .single()

  if (error || !data) {
    errorDiv.textContent = "Usuario o contraseña incorrectos"
  } else {
    document.getElementById("login-screen").hidden = true
    document.getElementById("main-screen").hidden = false
  }
})

// fileInput es <input type="file" multiple>
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
  const { data, error } = await supabase
    .from('vehiculos')
    .insert([ payload ])
    .select()
  if (error) throw error
  return data[0]
}

async function listarRegistros() {
  const { data, error } = await supabase
    .from('vehiculos')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

window.login = login