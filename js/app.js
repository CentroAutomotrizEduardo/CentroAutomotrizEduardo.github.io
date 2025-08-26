import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://supabase.com/dashboard/project/tsxojomiriruedjvnsgj/settings/api-keys'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeG9qb21pcmlydWVkanZuc2dqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYyMTcyOTksImV4cCI6MjA3MTc5MzI5OX0.4dgZ-dMXgrWlgh9vjkaY0n1yv0aInWIwn51kboLM_6k' // la anon key

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)


async function login(usuario, contrasena) {
  let { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('usuario', usuario)
    .eq('contrasena', contrasena)
    .single()

  if (error || !data) {
    alert("Usuario o contraseña incorrectos")
    return null
  } else {
    alert("Login exitoso: " + data.usuario)
    // aquí guardas en localStorage que está logueado
    localStorage.setItem("usuario", data.usuario)
    return data
  }
}
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
