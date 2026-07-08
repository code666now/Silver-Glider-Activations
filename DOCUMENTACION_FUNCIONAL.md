# Documentación Funcional — Silver Glider Activations (Microservicio)

> Microservicio independiente de **votación de stands en festivales** ("Best Booth Award").
> Los vendedores registran su stand y obtienen un código QR; los asistentes escanean y votan
> por su favorito. Construido para **Thrift Fest 2026** (~4.000 escáneres, ~20.000 interacciones).
>
> Es un **backend autónomo**, extraído del repositorio de *Silver Glider Tickets*. **No depende
> de ningún código de ticketing.** Comparte la misma base de datos PostgreSQL (tablas con prefijo
> `sg_`), pero sus tablas no tienen ninguna relación (FK) con las del ticketing.

---

## 1. Resumen ejecutivo

| Aspecto | Detalle |
|---|---|
| **Runtime** | Node.js + Express **5** (CommonJS, sin build) |
| **Base de datos** | PostgreSQL (driver `pg` directo, **sin ORM**, SQL plano) |
| **Auth admin** | JWT (`jsonwebtoken`) con secreto propio (`ACTIVATIONS_ADMIN_SECRET`), expiración **7 días** |
| **Votantes** | Sin login — identificados por *browser fingerprint* (localStorage) |
| **Imágenes** | Cloudinary (subida de fotos de stand) |
| **Email** | Resend (degradación silenciosa si falta `RESEND_API_KEY`) |
| **QR** | Librería `qrcode` (data-URL PNG en caliente) |
| **Uploads** | `multer` (memoria, límite 10 MB) |
| **Puerto** | `process.env.PORT || 3000` |
| **Prefijo API** | `/activations` (+ rutas de ops sin prefijo) |
| **Arranque** | `npm start` → `node src/index.js` · `npm run dev` (watch) |
| **Migraciones** | Automáticas al arranque (idempotentes) |
| **Prefijo de tablas** | `sg_` (`sg_activations`, `sg_participants`, `sg_activation_votes`, `sg_activation_optins`) |

### Diferencia con el backend de Ticketing

| | **Silver Glider Tickets** | **Este servicio (Activations)** |
|---|---|---|
| Dominio | Emisión y validación de entradas | Votación de stands en festival |
| Usuarios internos | `admin` / `staff` (JWT con `JWT_SECRET`) | `activations_admin` (JWT con `ACTIVATIONS_ADMIN_SECRET`) |
| Usuarios externos | Compradores (magic link) | Asistentes anónimos (fingerprint) |
| Integraciones | Resend, qrcode | Resend, qrcode, **Cloudinary**, **multer** |
| Tablas | `sg_users/events/orders/tickets` | `sg_activations/participants/votes/optins` |
| Acoplamiento | — | **Ninguno** (BD compartida, sin FKs cruzadas) |

### Arquitectura por capas

```
Request → index.js → Router (routes/activations.js) → DB layer (db/activationsDB.js) → PostgreSQL
                            │                                   │
             Middleware (requireActivationsAdmin)   Integraciones: Cloudinary · Resend · qrcode
```

Las páginas de cara al público (landing, votación, perfil, ganador, QR) se **renderizan como
HTML en el servidor** desde funciones dentro de `routes/activations.js` (no hay framework de
frontend). Las vistas de admin son archivos estáticos en `src/views/`.

---

## 2. Punto de entrada (`src/index.js`)

Flujo de arranque:

1. Carga variables de entorno (`dotenv`).
2. **Ejecuta migraciones** (`runBaseMigrations`): lee y aplica los `.sql` de `src/migrations/`
   en orden. Idempotente (`CREATE TABLE IF NOT EXISTS`). Se ejecuta **antes** de montar las rutas.
3. `express.json()` — parser JSON.
4. Sirve estáticos desde `/public` (fondos, logo).
5. Monta el router de votación en `/activations`.
6. Sirve rutas de operación:
   - `GET /activations-login` → panel de login de admin (HTML).
   - `GET /unsubscribe?email=` → baja de la lista de emails.
   - `GET /health` → `{ status: "ok", sha }` (chequeo de salud + verificación de BD).
7. Registra el `errorHandler` global.
8. Levanta el servidor en `PORT`.

> Al requerir el router, se dispara también `runMigrations()` de `db/activationsDB.js` (ALTERs
> idempotentes de columnas). Por eso las migraciones base de `CREATE TABLE` corren primero.

---

## 3. Modelo de datos

Definido en [src/migrations/001_activations.sql](src/migrations/001_activations.sql). Prefijo `sg_`.

### `sg_activations` — la activación / concurso
| Campo | Tipo | Notas |
|---|---|---|
| `id` | SERIAL PK | |
| `name` | VARCHAR | Nombre del concurso |
| `slug` | VARCHAR UNIQUE | Identificador en URL |
| `description` | TEXT | |
| `active` | BOOLEAN | default `true` |
| `voting_closed` | BOOLEAN | default `false` |
| `voting_ends_at` | TIMESTAMPTZ | cierre automático programado |
| `created_at` | TIMESTAMP | |

### `sg_participants` — stands participantes
| Campo | Tipo | Notas |
|---|---|---|
| `id` | SERIAL PK | |
| `activation_id` | INT FK → `sg_activations` | ON DELETE CASCADE |
| `name` | VARCHAR | |
| `slug` | VARCHAR | UNIQUE por `(activation_id, slug)` |
| `description` | TEXT | |
| `image_url` | TEXT | foto en Cloudinary |
| `status` | VARCHAR | `approved` (default) / `pending` |
| `contact_email`, `contact_phone` | TEXT | contacto del vendedor |
| `instagram_handle`, `booth_song_url` | TEXT | opcionales |
| `created_at` | TIMESTAMP | |

### `sg_activation_votes` — votos
| Campo | Tipo | Notas |
|---|---|---|
| `id` | SERIAL PK | |
| `participant_id` | INT FK → `sg_participants` | ON DELETE CASCADE |
| `activation_id` | INT FK → `sg_activations` | ON DELETE CASCADE |
| `vote` | VARCHAR | CHECK: `rules` / `hell_yeah` / `no_thanks` |
| `browser_fingerprint` | TEXT | identidad del dispositivo |
| `created_at` | TIMESTAMP | |

**Índices:**
- `uq_votes_participant_fingerprint` **UNIQUE** `(participant_id, browser_fingerprint)` → un voto
  por stand por dispositivo, a prueba de carreras (dedup a nivel de BD).
- `idx_votes_activation_fingerprint` `(activation_id, browser_fingerprint)` → conteo rápido de votos por dispositivo.

### `sg_activation_optins` — suscripciones de email
| Campo | Tipo | Notas |
|---|---|---|
| `id` | SERIAL PK | |
| `activation_id` | INT FK → `sg_activations` | |
| `participant_id` | INT FK → `sg_participants` | |
| `email` | TEXT NOT NULL | |
| `unsubscribed` | BOOLEAN | default `false` |
| `created_at` | TIMESTAMP | |

### Relaciones
```
sg_activations 1─N sg_participants 1─N sg_activation_votes
sg_activations 1─N sg_activation_optins
```
No hay ninguna FK hacia las tablas del ticketing.

---

## 4. Autenticación y autorización

### Admin — [src/middleware/auth.js](src/middleware/auth.js)
- `POST /activations/admin/login`: valida `password` contra `ACTIVATIONS_ADMIN_PASS`, firma un JWT
  `{ role: 'activations_admin' }` con `ACTIVATIONS_ADMIN_SECRET`, `expiresIn: '7d'`.
- `requireActivationsAdmin`: lee `Authorization: Bearer <token>`, verifica firma y exige
  `role === 'activations_admin'`. Independiente del JWT del ticketing.

### Votantes — sin login
Los asistentes **no se autentican**. Se identifican por un *fingerprint* aleatorio guardado en
`localStorage` (`sg_fp`), enviado en cada voto. La deduplicación real la garantiza el índice
UNIQUE de la BD, no el cliente.

### Mapa de protección por ruta

| Grupo | Auth |
|---|---|
| `/activations/admin/*` (data, create, participants, approve, reject, results, close-voting, reset-votes, set-voting-ends, upload-image) | **admin** |
| `POST /activations/admin/login` | público |
| Páginas públicas (landing, votación, perfil, ganador, QR, join) | público |
| `POST .../vote`, `POST .../optin`, `POST .../join` | público (con rate-limit) |
| `GET /health`, `GET /unsubscribe`, `GET /activations-login` | público |

---

## 5. Flujos funcionales por dominio

### 5.1 Registro de stand (auto-alta del vendedor)
- `GET /activations/:slug/join` → página de registro (HTML renderizado).
- `POST /activations/:slug/join` (multipart, `multer`):
  1. Valida que la activación exista y esté `active`.
  2. Sube la foto a Cloudinary si viene (`image` field).
  3. Genera `slug` a partir del nombre; rechaza si ya existe (nombre duplicado).
  4. Crea el participante con `status='approved'` (alta directa, sin moderación previa).
  5. Si hay `contact_email`: envía **confirmación al vendedor** (`sendBoothConfirmation`) y
     **notificación al admin** (`sendAdminBoothNotification`). Ambos con enlace al perfil/QR.

### 5.2 Votación (asistente)
- `GET /activations/:slug` → **landing** con el leaderboard de stands (cacheada 30 s en memoria).
- `GET /activations/:slug/:booth` → **página de votación** de un stand.
- `POST /activations/:slug/:booth/vote` (rate-limited) body `{ vote, fingerprint }`:
  - Tipos: `rules` ("This Booth Rules" — voto fuerte), `hell_yeah` ("Hell Yeah" — voto positivo),
    `no_thanks` ("Not My Vibe" — **neutral**: se registra pero no gasta boleta ni cuenta para ganar).
  - Tope: **5 votos positivos por dispositivo** (`MAX_BALLOTS`), validado en servidor con
    `countPositiveVotes`.
  - Inserción idempotente con `ON CONFLICT (participant_id, browser_fingerprint) DO NOTHING`
    → si ya votó ese stand, devuelve `duplicate`.
  - Respuesta incluye `votesLeft` y `maxVotes` para actualizar la UI.
- `GET /activations/:slug/votes-left?fp=` → consulta ligera de votos restantes (la landing está
  cacheada y compartida, así que cada dispositivo personaliza su contador con esta llamada).
- `POST /activations/:slug/:booth/optin` (rate-limited) → alta de email para "picks" semanales;
  si el email ya existe, responde éxito sin duplicar ni reenviar el welcome.

### 5.3 Perfil de stand y códigos QR
- `GET /activations/:slug/:booth/profile` → **página del vendedor** con su QR (para imprimir/guardar).
- `GET /activations/:slug/qr` → **Master QR** de la activación (para la entrada del festival).
- Ambos QR se generan en caliente con `qrcode`, codificando la URL basada en `RAILWAY_BASE_URL`.

### 5.4 Ganador
- `GET /activations/:slug/winner` → página del ganador. El ganador se calcula por **votos
  positivos únicamente** (`getWinner`: `COUNT ... FILTER (WHERE vote IN ('rules','hell_yeah'))`).

### 5.5 Panel de administración — [src/views/activations-admin.html](src/views/activations-admin.html)
Login en `GET /activations-login`; panel en `GET /activations/admin/activations`. Endpoints:

| Endpoint | Acción |
|---|---|
| `GET /admin/activations/data` | lista de activaciones |
| `POST /admin/activations/create` | crear activación |
| `POST /admin/upload-image` | subir imagen suelta a Cloudinary |
| `POST /admin/activations/:id/participants` | crear stand (admin) |
| `PUT /admin/activations/participants/:id` | editar stand |
| `GET /admin/activations/:id/pending` | stands pendientes de aprobar |
| `POST /admin/activations/participants/:id/approve` | aprobar stand |
| `POST /admin/activations/participants/:id/reject` | rechazar (borra) stand |
| `GET /admin/activations/:id/participants` | stands de la activación |
| `GET /admin/activations/:id/results` | resultados + opt-ins |
| `POST /admin/activations/:id/close-voting` | cerrar votación ya |
| `POST /admin/activations/:id/set-voting-ends` | programar cierre (`voting_ends_at`) |
| `POST /admin/activations/:id/reset-votes` | **borrar todos los votos** (limpiar test antes del evento) |

*(Todos con prefijo `/activations` y `requireActivationsAdmin`.)*

### 5.6 Cierre automático de votación
Un `setInterval` cada **60 s** ejecuta `autoCloseExpired`: pone `voting_closed=TRUE` en toda
activación cuyo `voting_ends_at` ya pasó.

---

## 6. Reglas de votación (tal como está construido)

- **5 votos positivos** por asistente y activación, forzados en servidor por fingerprint.
- **"Not My Vibe"** se registra para analítica pero **no gasta boleta ni cuenta para ganar**.
- El **ganador se decide solo por votos positivos**.
- Dedup = restricción **UNIQUE** en BD (un voto por stand por dispositivo), a prueba de carreras.
- Contador de votos restantes visible en landing y en cada página de votación.
- La votación cierra automáticamente en `voting_ends_at` (chequeo cada 60 s) o con el botón admin.
- El botón "Reset All Votes" borra el concurso — **usar la mañana del evento** para limpiar datos de prueba.
- El HTML de la landing se cachea en memoria 30 s para sobrevivir a ráfagas de escaneo.

---

## 7. Rendimiento y protección

| Mecanismo | Detalle |
|---|---|
| **Caché de landing** | En memoria, TTL 30 s por slug → ~95% menos consultas en picos. |
| **Rate limit por dispositivo** | 150 votos/hora por `(IP + fingerprint)`. |
| **Rate limit por IP** | 800 votos/hora por IP (alto: WiFi de festival y NAT ponen cientos de móviles tras una IP; solo frena un script). |
| **Rate limit de opt-in** | 10 altas/hora por IP. |
| **Pool `pg`** | 20 conexiones. |

Los rate limiters son **en memoria** (se reinician al reiniciar el proceso) y barren sus mapas cada minuto.

---

## 8. Integraciones externas

| Servicio | Uso | Config (env) |
|---|---|---|
| **PostgreSQL** | Persistencia (SQL plano) | `DATABASE_URL` |
| **Cloudinary** | Subida y transformación de fotos de stand | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
| **Resend** | Emails (confirmación de stand, aviso al admin, welcome) | `RESEND_API_KEY`, `RESEND_FROM` |
| **qrcode** | Generación de QR (in-process) | — |
| **JWT** | Auth de admin | `ACTIVATIONS_ADMIN_SECRET`, `ACTIVATIONS_ADMIN_PASS` |
| **URL pública** | Construcción de URLs de QR y enlaces de email | `RAILWAY_BASE_URL`, `RAILWAY_PUBLIC_DOMAIN` |

Emails (en [src/lib/mailer.js](src/lib/mailer.js)):

| Función | Disparador | Destinatario |
|---|---|---|
| `sendBoothConfirmation` | El vendedor registra su stand | Email del vendedor |
| `sendAdminBoothNotification` | El vendedor registra su stand | `ACTIVATIONS_ADMIN_NOTIFY_EMAIL` |
| `sendWelcomeEmail` | El asistente se suscribe | Email del asistente |

> Todos los envíos degradan silenciosamente si falta `RESEND_API_KEY`.

---

## 9. Contrato de API (resumen)

| Método | Ruta | Auth | Body / Query | Respuesta |
|---|---|---|---|---|
| POST | `/activations/admin/login` | — | `{ password }` | `{ token }` |
| GET | `/activations/admin/activations/data` | admin | — | `[activaciones]` |
| POST | `/activations/admin/activations/create` | admin | `{ name, slug, description }` | `activación` |
| POST | `/activations/admin/upload-image` | admin | `image` (multipart) | `{ url }` |
| POST | `/activations/admin/activations/:id/participants` | admin | campos de stand (+`image`) | `participante` |
| PUT | `/activations/admin/activations/participants/:id` | admin | idem | `participante` |
| GET | `/activations/admin/activations/:id/pending` | admin | — | `[pendientes]` |
| POST | `/activations/admin/activations/participants/:id/approve` | admin | — | `participante` |
| POST | `/activations/admin/activations/participants/:id/reject` | admin | — | `participante` |
| GET | `/activations/admin/activations/:id/participants` | admin | — | `[participantes]` |
| GET | `/activations/admin/activations/:id/results` | admin | — | `{ results, optins }` |
| POST | `/activations/admin/activations/:id/close-voting` | admin | — | `activación` |
| POST | `/activations/admin/activations/:id/set-voting-ends` | admin | `{ voting_ends_at }` | `activación` |
| POST | `/activations/admin/activations/:id/reset-votes` | admin | — | `{ deleted }` |
| GET | `/activations/:slug` | — | — | HTML (landing) |
| GET | `/activations/:slug/join` · POST | — | multipart | HTML / `{ success, participant }` |
| GET | `/activations/:slug/:booth` | — | — | HTML (votación) |
| POST | `/activations/:slug/:booth/vote` | — | `{ vote, fingerprint }` | `{ duplicate?, votesLeft, maxVotes }` |
| POST | `/activations/:slug/:booth/optin` | — | `{ email }` | `{ success }` |
| GET | `/activations/:slug/votes-left?fp=` | — | — | `{ votesLeft, maxVotes }` |
| GET | `/activations/:slug/:booth/profile` | — | — | HTML (QR del vendedor) |
| GET | `/activations/:slug/qr` | — | — | HTML (Master QR) |
| GET | `/activations/:slug/winner` | — | — | HTML (ganador) |
| GET | `/health` | — | — | `{ status, sha }` |
| GET | `/unsubscribe?email=` | — | — | HTML |

---

## 10. Despliegue (Railway)

1. Apuntar el servicio Railway a este repositorio.
2. Configurar las variables de entorno (ver [.env.example](.env.example)); asegurar
   `RESEND_API_KEY`, `RESEND_FROM`, `RAILWAY_BASE_URL`, `RAILWAY_PUBLIC_DOMAIN`.
3. Añadir dominio propio (`activations.silverglidertickets.com`) y actualizar
   `RAILWAY_BASE_URL` / `RAILWAY_PUBLIC_DOMAIN`.
4. Verificar `GET /health` → `{ status: "ok" }`.
5. Ajustar la RAM del contenedor a ≥ 1 GB antes del día del evento.

> ⚠️ **Regla crítica de secuencia:** los QR codifican la URL. **No imprimir QRs** hasta que el
> dominio final esté activo y `RAILWAY_BASE_URL` apunte a él, o los códigos quedarán muertos.

**Checklist previo al evento:** registrar un stand de prueba, confirmar que aparece en la landing,
votar, revisar el panel admin, probar opt-in, cargar un QR y escanearlo, confirmar el email de confirmación.

---

## 11. Observaciones y deuda técnica

1. **Email semanal de "picks" (viernes) NO implementado** — los opt-ins se recogen pero no existe
   mecanismo de envío. Pendiente de construir.
2. **Rate limiters en memoria** — se reinician al reiniciar el proceso y no se comparten entre
   réplicas. Suficiente para un evento de una réplica; para escalar horizontalmente habría que
   mover el conteo a la BD o a Redis.
3. **Secreto/clave de admin con fallback** — `ACTIVATIONS_ADMIN_SECRET`/`ACTIVATIONS_ADMIN_PASS`
   tienen valores por defecto para desarrollo local; en producción **deben** venir de env.
4. **Alta de stands sin moderación** — el auto-registro crea `status='approved'` directo. Existe
   flujo de `pending`/`approve` en admin, pero el `join` público no lo usa.
5. **Migraciones en dos lugares** — el `.sql` de `migrations/` (esquema base) y los `ALTER`
   idempotentes de `db/activationsDB.js`. Conviven sin problema, pero conviene consolidar a futuro.
6. **BD compartida con el ticketing** — hoy comparten `DATABASE_URL`. Sin acoplamiento de datos
   (sin FKs cruzadas), pero para aislamiento total podría migrarse a una base propia.

---

*Documento funcional del microservicio Silver Glider Activations — Express 5 + `pg` + PostgreSQL,
con Cloudinary, Resend y `qrcode` como integraciones. Backend de votación de stands desacoplado
del ticketing.*
