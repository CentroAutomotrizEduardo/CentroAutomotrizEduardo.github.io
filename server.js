const express = require("express")
const http = require("http")
const { Server } = require("socket.io")

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.static("public"))

// Manejo de conexiones socket
io.on("connection", (socket) => {
  console.log("Cliente conectado")

  socket.on("sendNotification", (msg) => {
    console.log("Notificación recibida:", msg)
    io.emit("notification", msg) // reenvía a todos
  })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`)
})
