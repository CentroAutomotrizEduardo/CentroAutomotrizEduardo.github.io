# Usar Node.js versión 18 como base
FROM node:18

# Crear carpeta para la app dentro del contenedor
WORKDIR /usr/src/app

# Copiar package.json y package-lock.json (si existe)
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código
COPY . .

# Exponer el puerto donde corre la app
EXPOSE 3000

# Comando para arrancar la app
CMD ["npm", "start"]
