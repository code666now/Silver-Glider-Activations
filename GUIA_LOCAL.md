# Guía: Levantar y probar el proyecto localmente

> Silver Glider Activations — microservicio de votación de stands (Express 5 + `pg` + PostgreSQL).
> Esta guía asume Windows, pero los comandos `npm`/`node` son idénticos en Mac/Linux.

---

## 1. Requisitos previos

| Herramienta | Versión recomendada | Verificar |
|---|---|---|
| **Node.js** | ≥ 18 (por `node --watch`) | `node -v` |
| **npm** | viene con Node | `npm -v` |
| **PostgreSQL** | ≥ 13 | `psql --version` |

Integraciones **opcionales** para pruebas locales (degradan silenciosamente si faltan):
- **Cloudinary** — solo si vas a subir fotos de stands.
- **Resend** — solo si quieres que se envíen emails de verdad. Sin `RESEND_API_KEY` no se envía nada y no rompe nada.

---

## 2. Instalar dependencias

Desde la raíz del proyecto (`silver-glider-activations`):

```powershell
npm install
```

---

## 3. Preparar la base de datos PostgreSQL

Las tablas se crean **solas al arrancar** (migraciones idempotentes en `backend/migrations/` + ALTERs en `backend/db/activationsDB.js`). Solo necesitas una base de datos **vacía**.

Crea una base local:

```powershell
# Abre psql como el superusuario postgres
psql -U postgres

# Dentro de psql:
CREATE DATABASE silverglider;
\q
```

> La app usa tablas con prefijo `sg_`, así que puedes reutilizar una base compartida sin colisiones — pero para probar en local, una base propia es lo más limpio.

---

## 4. Crear el archivo `.env`

Copia la plantilla y edítala:

```powershell
Copy-Item .env.example .env
```

Para **desarrollo local** deja el `.env` así (lo importante marcado 👇):

```dotenv
# Apunta a tu Postgres local (ajusta usuario/clave/puerto/nombre de base)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/silverglider

PORT=3000

# ⚠️ IMPORTANTE: NO poner "production" en local.
# Con NODE_ENV=production, el pool exige SSL y tu Postgres local lo rechazará.
NODE_ENV=development

# URL pública — en local apunta a localhost (los QR codificarán esta URL)
FRONTEND_URL=http://localhost:3000

# Auth de admin (puedes usar estos valores para probar)
ACTIVATIONS_ADMIN_PASS=activations2026
ACTIVATIONS_ADMIN_SECRET=un-string-largo-y-aleatorio-para-local

# Opcionales — déjalos vacíos si no vas a probar imágenes/emails
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
RESEND_API_KEY=
RESEND_FROM=activations@localhost
```

### Puntos críticos del `.env` en local
- **`NODE_ENV`**: en `backend/config/db.js`, si es `production` se activa SSL (`rejectUnauthorized: false`). Un Postgres local normal **no** tiene SSL, así que ponlo en `development` (o cualquier valor que no sea `production`) para desactivarlo.
- **`FRONTEND_URL`**: en local ponlo en `http://localhost:3000` para que los QR y enlaces apunten a tu máquina.
- **`ACTIVATIONS_ADMIN_PASS`** / **`ACTIVATIONS_ADMIN_SECRET`**: si no los defines, el código usa defaults (`activations2026` / `activations-secret`), pero es mejor fijarlos.

---

## 5. Arrancar el servidor

```powershell
# Modo desarrollo (recarga al guardar cambios)
npm run dev

# o modo normal
npm start
```

Si todo va bien, en consola verás algo como:

```
[migrations] applied 001_activations.sql
Silver Glider Activations running on port 3000
```

> Si ves un error de conexión a la BD aquí, revisa `DATABASE_URL` y que Postgres esté corriendo. Si ves un error de SSL, casi seguro tienes `NODE_ENV=production` en el `.env`.

---

## 6. Verificar que está vivo

```powershell
# Health check (también valida la conexión a la BD)
curl http://localhost:3000/health
```

Respuesta esperada:

```json
{ "status": "ok", "sha": "unknown" }
```

---

## 7. Probar el flujo completo

### 7.1 Login de admin (obtener token)

Panel de login en el navegador:
```
http://localhost:3000/activations-login
```

O por API:

```powershell
curl -X POST http://localhost:3000/activations/admin/login `
  -H "Content-Type: application/json" `
  -d '{\"password\":\"activations2026\"}'
```

Devuelve `{ "token": "..." }`. Guarda ese token; va en la cabecera `Authorization: Bearer <token>` para todas las rutas de admin.

### 7.2 Crear una activación (concurso)

```powershell
$TOKEN = "pega-aqui-el-token"

curl -X POST http://localhost:3000/activations/admin/activations/create `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $TOKEN" `
  -d '{\"name\":\"Thrift Fest 2026\",\"slug\":\"thrift-fest\",\"description\":\"Best Booth Award\"}'
```

### 7.3 Registrar un stand de prueba (auto-alta pública)

En el navegador abre la página de registro:
```
http://localhost:3000/activations/thrift-fest/join
```
Rellena el formulario (la foto es opcional si no configuraste Cloudinary).

### 7.4 Ver la landing y votar

- **Landing / leaderboard:** `http://localhost:3000/activations/thrift-fest`
- **Página de votación de un stand:** `http://localhost:3000/activations/thrift-fest/<slug-del-stand>`
- Vota desde la UI, o por API:

```powershell
curl -X POST http://localhost:3000/activations/thrift-fest/<slug-del-stand>/vote `
  -H "Content-Type: application/json" `
  -d '{\"vote\":\"hell_yeah\",\"fingerprint\":\"test-device-1\"}'
```

Tipos de voto: `rules`, `hell_yeah` (positivos, cuentan) · `no_thanks` (neutral, no cuenta).
Límite: 5 votos positivos por `fingerprint`.

### 7.5 Otras páginas públicas útiles

| Página | URL |
|---|---|
| Perfil + QR del stand | `/activations/thrift-fest/<slug>/profile` |
| Master QR del festival | `/activations/thrift-fest/qr` |
| Ganador | `/activations/thrift-fest/winner` |

### 7.6 Ver resultados en admin

```powershell
# obtén el id de la activación
curl http://localhost:3000/activations/admin/activations/data -H "Authorization: Bearer $TOKEN"

# resultados + opt-ins
curl http://localhost:3000/activations/admin/activations/1/results -H "Authorization: Bearer $TOKEN"
```

---

## 8. Checklist rápido de prueba (previo a un evento)

1. `GET /health` → `{ status: "ok" }`
2. Registrar un stand de prueba y confirmar que aparece en la landing.
3. Votar y ver que el contador de votos restantes baja.
4. Revisar resultados en el panel admin.
5. Probar opt-in de email.
6. Abrir un QR (perfil o master) y escanearlo con el móvil.
7. (Antes del evento real) usar **"Reset All Votes"** para limpiar los datos de prueba.

---

## 9. Problemas comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| Error SSL al arrancar | `NODE_ENV=production` con Postgres local | Poner `NODE_ENV=development` |
| `ECONNREFUSED` / timeout de BD | Postgres apagado o `DATABASE_URL` mal | Arrancar Postgres, revisar credenciales/puerto |
| No se suben fotos | Cloudinary sin configurar | Rellenar `CLOUDINARY_*` (o probar sin foto) |
| No llegan emails | Sin `RESEND_API_KEY` | Normal en local; degrada silenciosamente |
| `401 Unauthorized` en rutas admin | Falta/expiró el token | Volver a hacer login y usar el `Bearer` |
| Los QR apuntan a Railway | `FRONTEND_URL` no es localhost | Poner `FRONTEND_URL=http://localhost:3000` |

---

## 10. Referencia de scripts

| Comando | Qué hace |
|---|---|
| `npm start` | Arranca el servidor (`node backend/index.js`) |
| `npm run dev` | Igual pero con recarga automática (`node --watch`) |

> Las migraciones se aplican automáticamente en cada arranque; no hay comando separado.
