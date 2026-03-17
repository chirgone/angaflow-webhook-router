# Angaflow Webhook Router

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)](https://workers.cloudflare.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)](https://www.typescriptlang.org)

Middleware de routing de webhooks de Mercado Pago para arquitectura multi-producto.

🌐 **[webhooks.angaflow.com](https://webhooks.angaflow.com)** | 📚 [CONTEXT.md](./CONTEXT.md)

---

## 🏗️ Parte del Ecosistema Angaflow

```
                    ┌──────────────┐
                    │ Mercado Pago │
                    └──────┬───────┘
                           │ Webhook
                           ▼
                  ┌─────────────────────┐
                  │  Webhook Router     │  ◄─ Este Repo
                  │  webhooks.anga...   │
                  │  - Valida HMAC      │
                  │  - Rutea por        │
                  │    metadata.product │
                  └──────────┬──────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
     ┌────────────────┐           ┌────────────────┐
     │ CFDI Backend   │           │ Security API   │
     │ backend.anga...│           │ api.angaflow...|
     └────────────────┘           └────────────────┘
```

**Repositorios relacionados:**
- 🔗 [angaflow-security](https://github.com/chirgone/angaflow-security) - Frontend  
- 🔗 [angaflow-security-api](https://github.com/chirgone/angaflow-security-api) - Backend API

---

## 🎯 ¿Por qué un Router de Webhooks?

**Problema:** Múltiples productos (CFDI + Security) usan Mercado Pago, pero los webhooks llegan a una sola URL.

**Solución:** Un router centralizado que:

1. ✅ **Valida la firma HMAC** (single point of truth)
2. ✅ **Fetch del payment completo** desde la API de Mercado Pago
3. ✅ **Extrae metadata.product** para determinar el destino
4. ✅ **Rutea al backend correcto** basado en el producto
5. ✅ **Previene doble-procesamiento** con validación única

---

## 🚀 Flujo de Operación

```
1. Mercado Pago envía webhook
   POST /mercadopago
   Headers:
     x-signature: ts=123,v1=abc...
     x-request-id: xyz-123

2. Router valida HMAC-SHA256
   - Calcula: HMAC(secret, "id:123;request-id:xyz;ts:123;")
   - Compara con timing-safe comparison
   - Si falla → 401 Unauthorized

3. Router fetch payment desde MP API
   GET https://api.mercadopago.com/v1/payments/123
   Authorization: Bearer <MP_ACCESS_TOKEN>

4. Router extrae product de metadata
   payment.metadata.product = "security" | "cfdi"

5. Router reenvía al backend correcto
   POST https://api.angaflow.com/api/payments/webhooks/internal
   Headers:
     X-Internal-Auth: <SHARED_SECRET>
     X-Original-Signature: ...
   Body:
     {
       notification: {...},  # Webhook original
       payment: {...}        # Payment completo ya fetched
     }
```

---

## 📦 Stack Tecnológico

- **Runtime:** Cloudflare Workers
- **Language:** TypeScript
- **Security:** HMAC-SHA256 signature validation
- **API Client:** Fetch API (Web Standards)

---

## 🛠️ Instalación y Desarrollo

### Prerrequisitos

- Node.js 18+
- npm 9+
- Wrangler CLI
- Cloudflare account
- Mercado Pago account

### Setup

```bash
# Clonar el repositorio
git clone https://github.com/chirgone/angaflow-webhook-router.git
cd angaflow-webhook-router

# Instalar dependencias
npm install

# Configurar secrets
wrangler secret put MERCADOPAGO_ACCESS_TOKEN       # Para fetch de payments
wrangler secret put MERCADOPAGO_WEBHOOK_SECRET     # Para validación HMAC
wrangler secret put INTERNAL_WEBHOOK_SECRET        # Para auth interna

# Opcional: URLs custom de backends
wrangler secret put CFDI_BACKEND_URL
wrangler secret put SECURITY_BACKEND_URL

# Iniciar servidor de desarrollo
npm run dev
```

El router estará disponible en `http://localhost:8787`

---

## 📂 Estructura del Proyecto

```
angaflow-webhook-router/
├── src/
│   └── index.ts              # Router logic + HMAC validation
├── wrangler.toml             # Cloudflare config
├── CONTEXT.md                # Documentación exhaustiva
├── package.json
└── tsconfig.json
```

**¡Solo ~200 líneas de código!** Diseñado para ser simple, auditable y mantenible.

---

## 🔐 Seguridad

### HMAC-SHA256 Signature Validation

El router valida **cada webhook** usando HMAC según el spec de Mercado Pago:

```typescript
const template = `id:${dataId};request-id:${requestId};ts:${ts};`
const computedSignature = HMAC-SHA256(secret, template)

// Timing-safe comparison
crypto.subtle.timingSafeEqual(computedBytes, signatureBytes)
```

**Fail-closed:** Si la firma no coincide, se rechaza con `401 Unauthorized`.

### Shared Secret para Backends

Los backends validan que el request viene del router usando:

```typescript
const internalAuth = request.headers.get('X-Internal-Auth')
if (internalAuth !== env.INTERNAL_WEBHOOK_SECRET) {
  return new Response('Unauthorized', { status: 401 })
}
```

---

## 🌍 Deployment

### Deploy a producción

```bash
# Verificar secrets
wrangler secret list

# Deploy
npm run deploy

# Verificar health check
curl https://webhooks.angaflow.com/health
```

### Configurar Webhook en Mercado Pago

1. Ir a [Mercado Pago Dashboard](https://www.mercadopago.com.mx/developers/panel)
2. Configurar webhook URL: `https://webhooks.angaflow.com/mercadopago`
3. Seleccionar eventos: **Pagos** (payment)
4. Copiar el **Webhook Secret** y configurarlo: `wrangler secret put MERCADOPAGO_WEBHOOK_SECRET`

---

## 🔧 Comandos Disponibles

```bash
npm run dev            # Dev server local
npm run deploy         # Deploy a producción
wrangler tail          # Ver logs en vivo
wrangler secret list   # Listar secrets
```

---

## 🌐 Endpoints

### `GET /health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "angaflow-webhook-router",
  "version": "1.0.0",
  "timestamp": "2026-03-17T12:00:00.000Z"
}
```

### `POST /mercadopago`

Endpoint para webhooks de Mercado Pago.

**Headers requeridos:**
- `x-signature`: Firma HMAC de MP
- `x-request-id`: Request ID único de MP

**Body:**
```json
{
  "type": "payment",
  "data": {
    "id": "123456789"
  }
}
```

**Response:**
- `200 OK` - Webhook procesado y enviado al backend
- `400 Bad Request` - JSON inválido o evento no soportado
- `401 Unauthorized` - Firma HMAC inválida
- `500 Internal Server Error` - Error al fetch payment o al enviar al backend

---

## 🧩 Metadata de Payments

Para que el router funcione, los payments deben incluir `metadata.product`:

```typescript
// Al crear el payment en Mercado Pago
{
  // ... otros campos
  metadata: {
    product: "security",  // o "cfdi"
    // ... otros campos
  }
}
```

**Routing:**
- `product: "security"` → `https://api.angaflow.com/api/payments/webhooks/internal`
- `product: "cfdi"` (default) → `https://backend.angaflow.mx/api/payments/webhooks/mercadopago`

---

## 🐛 Debugging

### Ver logs en vivo

```bash
wrangler tail
```

### Probar webhook localmente

```bash
# Tunnel local con ngrok o cloudflared
cloudflared tunnel --url http://localhost:8787

# Configurar URL de tunnel en MP dashboard
# Enviar test webhook desde MP dashboard
```

### Errores comunes

**401 Unauthorized:**
- Verificar `MERCADOPAGO_WEBHOOK_SECRET` configurado
- Confirmar que el signature header está presente
- Revisar que el timestamp no está expirado (> 5 min)

**500 al fetch payment:**
- Verificar `MERCADOPAGO_ACCESS_TOKEN` configurado
- Confirmar que el token tiene permisos de lectura
- Revisar que el payment ID existe

**500 al enviar a backend:**
- Verificar que el backend está accesible
- Confirmar `INTERNAL_WEBHOOK_SECRET` compartido
- Revisar logs del backend

---

## 📊 Idempotencia

El router **NO maneja idempotencia** directamente. Eso es responsabilidad de cada backend:

- **CFDI Backend:** Implementa su propia lógica de idempotencia
- **Security API:** Usa `security_payment_logs.payment_id` UNIQUE constraint

El router **sí garantiza**:
- Un solo punto de validación HMAC
- Payment ya fetched (backends no lo re-fetch)
- Headers originales preservados para auditoría

---

## 📚 Documentación Completa

Para documentación exhaustiva sobre arquitectura, base de datos, flujos de pago, y más, ver:

📖 **[CONTEXT.md](./CONTEXT.md)** - Documento completo del ecosistema

---

## 🤝 Contribuir

Este es un proyecto privado. Para reportar issues o sugerencias, contactar a:

📧 [email protected]  
💬 WhatsApp: +52 55 5157 5041

---

## 📄 Licencia

© 2026 ANGA Mexico. Todos los derechos reservados.

---

**Made with ❤️ in Mexico** 🇲🇽
