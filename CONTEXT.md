# 📋 DOCUMENTO DE CONTEXTO COMPLETO - ANGAFLOW / ANGA SECURITY

---

## **1. RESUMEN EJECUTIVO**

**Anga Security** (https://angaflow.com) es una plataforma SaaS de seguridad web especializada en auditoría y simulación de ataques para sitios protegidos por Cloudflare®. El proyecto consiste en un ecosistema de microservicios desplegados en Cloudflare Workers.

**Propuesta de valor:**
- Análisis de 38+ controles de seguridad en < 60 segundos
- Simulación de 75+ ataques reales (XSS, SQLi, DDoS, bots, malware)
- Reportes profesionales con score A-F y recomendaciones priorizadas
- Sistema de créditos prepagados (sin suscripciones obligatorias)
- Mercado objetivo: LATAM (México principalmente)

---

## **2. ARQUITECTURA DEL SISTEMA**

### **2.1 Componentes principales**

```
┌─────────────────────────────────────────────────────────────┐
│                    CLOUDFLARE ECOSYSTEM                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────┐      ┌──────────────────┐             │
│  │  Frontend (SSR) │◄────►│   API Worker     │             │
│  │  Astro + React  │      │   Hono + TS      │             │
│  │  angaflow.com   │      │ api.angaflow.com │             │
│  └─────────────────┘      └──────────────────┘             │
│                                    │                         │
│                                    │                         │
│                           ┌────────▼─────────┐              │
│                           │  Webhook Router  │              │
│                           │   (Middleware)   │              │
│                           │webhooks.anga...  │              │
│                           └──────────────────┘              │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
              ┌──────────┐  ┌──────────┐  ┌──────────┐
              │ Supabase │  │ Mercado  │  │ Workers  │
              │   (DB)   │  │   Pago   │  │    AI    │
              └──────────┘  └──────────┘  └──────────┘
```

---

## **3. PROYECTOS Y ESTRUCTURA**

### **3.1 angaflow-security (Frontend)**
- **Repositorio:** Este proyecto
- **Framework:** Astro 5.17.1 + React 19 + Tailwind CSS 4.2
- **Deployment:** Cloudflare Pages con adapter `@astrojs/cloudflare`
- **URL:** https://angaflow.com (www.angaflow.com)
- **i18n:** Español (default) + Inglés

**Estructura de páginas principales:**
```
/es (español - default)
  ├── /                      # Landing page
  ├── /login                 # Autenticación
  ├── /registro              # Registro + selección de plan
  ├── /dashboard             # Panel de usuario (reportes, créditos)
  ├── /checkout/*            # Proceso de pago
  ├── /pago/*                # Estados de pago (éxito/pendiente/fallo)
  ├── /admin                 # Panel administrativo
  ├── /terminos              # Términos de servicio
  ├── /privacidad            # Aviso de privacidad
  ├── /cancelacion           # Política de cancelación
  ├── /reembolsos            # Política de reembolsos
  ├── /recuperar-password    # Reset password
  └── /actualizar-password   # Update password

/en (inglés)
  └── (mismas rutas traducidas)
```

**Componentes React clave:**
- `Dashboard.tsx` - Panel principal del usuario
- `AuthForm.tsx` - Login/registro
- `CheckoutPage.tsx` - Proceso de compra
- `AuditReportView.tsx` - Visualización de auditorías
- `ComplianceReportView.tsx` - Reportes de compliance
- `AIChat.tsx` - Consultor IA integrado
- `AuditCharts.tsx` - Gráficas de score
- `SubscribeButton.tsx` - Botón para planes Watch/Guard/Shield

**Dependencias críticas:**
- `@supabase/supabase-js` - Cliente de base de datos
- `jspdf` - Generación de PDFs
- `lucide-react` - Iconos

---

### **3.2 angaflow-security-api (Backend)**
- **Repositorio:** https://github.com/chirgone/angaflow-security-api
- **Framework:** Hono 4.7 (API framework para Workers)
- **Deployment:** Cloudflare Worker
- **URL:** https://api.angaflow.com

**Estructura de rutas:**
```
/api
  ├── /health                     # Health check
  ├── /account                    # Gestión de cuentas
  ├── /credits                    # Consulta/gestión de créditos
  ├── /scan                       # Quick Scan gratuito
  ├── /audit                      # Auditorías de seguridad
  ├── /compliance                 # Reportes de compliance
  ├── /remediation                # Correcciones de vulnerabilidades
  ├── /ai                         # Consultor IA
  ├── /admin                      # Endpoints administrativos
  ├── /leads                      # Gestión de leads
  └── /payments/webhooks/internal # Webhook de pagos (post-router)
```

**Middleware:**
- `auth.ts` - Autenticación JWT (Supabase)
- `admin.ts` - Protección de rutas admin

**Workflows:**
- `simulation-workflow.ts` - Cloudflare Workflow para simulación de ataques (cada paso = 30s CPU budget)

**Bindings de Cloudflare:**
- `AI` - Workers AI para consultor IA
- `SIMULATION_WORKFLOW` - Workflow binding

**Secrets requeridos (vía `wrangler secret put`):**
```bash
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
MERCADOPAGO_ACCESS_TOKEN
MERCADOPAGO_PUBLIC_KEY
MERCADOPAGO_WEBHOOK_SECRET
INTERNAL_WEBHOOK_SECRET
```

---

### **3.3 angaflow-webhook-router (Middleware)**
- **Repositorio:** https://github.com/chirgone/angaflow-webhook-router
- **Propósito:** Router de webhooks de Mercado Pago hacia backend correcto
- **Deployment:** Cloudflare Worker
- **URL:** https://webhooks.angaflow.com

**Flujo de operación:**
1. Recibe webhook de Mercado Pago en `/mercadopago`
2. **Valida firma HMAC** (seguridad critical path)
3. Fetch del payment completo desde MP API
4. Extrae `payment.metadata.product` para routing
5. Rutea a backend correcto:
   - `product: "security"` → `https://api.angaflow.com/api/payments/webhooks/internal`
   - `product: "cfdi"` (default) → `https://backend.angaflow.mx/api/payments/webhooks/mercadopago`

**Secrets requeridos:**
```bash
MERCADOPAGO_ACCESS_TOKEN      # Para fetch de payment
MERCADOPAGO_WEBHOOK_SECRET    # Para validación HMAC
INTERNAL_WEBHOOK_SECRET       # Shared secret para auth interna
```

**Health check:** `GET /health` retorna status OK

---

## **4. BASE DE DATOS (SUPABASE POSTGRESQL)**

**Instancia:** Compartida con angaflow.mx (CFDI)

**Schema principal:** `database/001_security_schema.sql`

### **4.1 Tablas principales**

**`security_accounts`** (Cuentas de usuario)
```sql
- id (UUID, PK)
- user_id (UUID, FK a auth.users)
- email (TEXT, NOT NULL)
- display_name (TEXT)
- plan_type (free | standard | pro | enterprise) DEFAULT 'free'
- credit_balance (DECIMAL) DEFAULT 0.00
- free_scans_used (INT) DEFAULT 0
- free_scans_lifetime (INT) DEFAULT 0
- first_reload_bonus_claimed (BOOL) DEFAULT FALSE
- status (active | suspended) DEFAULT 'active'
- created_at, updated_at (TIMESTAMPTZ)
```

**`security_credit_transactions`** (Movimientos de créditos)
```sql
- id (UUID, PK)
- account_id (UUID, FK)
- type (recharge | deduction | bonus | refund)
- amount (DECIMAL)
- bonus (DECIMAL) DEFAULT 0.00
- total_credits (DECIMAL)
- balance_before, balance_after (DECIMAL)
- description (TEXT)
- payment_id (TEXT, nullable)
- report_id (UUID, nullable)
- status (pending | completed | failed | refunded)
- created_at (TIMESTAMPTZ)
- metadata (JSONB)
```

**`security_payment_logs`** (Auditoría de pagos - idempotency)
```sql
- id (UUID, PK)
- payment_id (TEXT, NOT NULL, UNIQUE)
- status, status_detail (TEXT)
- amount (DECIMAL)
- currency (TEXT) DEFAULT 'MXN'
- payer_email (TEXT)
- external_reference (TEXT)
- payment_type (credit_recharge | subscription | consulting)
- metadata, raw_data (JSONB)
- created_at (TIMESTAMPTZ)
```

**`security_subscriptions`** (Planes Watch/Guard/Shield)
```sql
- id (UUID, PK)
- account_id (UUID, FK)
- plan_id (watch | guard | shield)
- status (active | cancelled | expired | pending)
- payment_id (TEXT)
- started_at, expires_at, next_billing_date (TIMESTAMPTZ)
- cancelled_at (TIMESTAMPTZ, nullable)
- created_at, updated_at (TIMESTAMPTZ)
```

**`security_reports`** (Reportes de auditoría)
```sql
- id (UUID, PK)
- account_id (UUID, FK)
- domain (TEXT)
- report_type (quick_scan | audit | simulation | assessment)
- score (INT 0-100)
- grade (A | B | C | D | F)
- status (pending | running | completed | failed)
- credits_charged (DECIMAL)
- data (JSONB) -- Resultados completos
- created_at, completed_at (TIMESTAMPTZ)
```

### **4.2 Migraciones adicionales**

**`migration_unique_payment_id.sql`** (API project)
- Agrega constraint UNIQUE a `payment_id` en `security_payment_logs`

**`migration_remediation_logs.sql`** (API project)
- Nueva tabla `security_remediation_logs` para tracking de correcciones aplicadas

---

## **5. SISTEMA DE CRÉDITOS**

**Modelo de negocio:** Prepago sin suscripción obligatoria

### **5.1 Paquetes de créditos**

| Plan | Precio | Créditos | USD equiv | Incluye |
|------|--------|----------|-----------|---------|
| **Quick Scan** | Gratis | 0 | - | 1 scan/mes, score general, 3 recomendaciones |
| **Starter** | $749 MXN | 1,500 | ~$44 | Auditoría Básica, PDF, recomendaciones |
| **Pro** | $3,299 MXN | 4,500 | ~$197 | 38 controles, roadmap, soporte prioritario |
| **Business** | $5,999 MXN | 9,000 | ~$359 | Assessment, simulación, compliance |
| **Enterprise** | $9,999 MXN | 16,000 | ~$599 | TODOS los reportes, Quick Call 30min |

**Oferta de lanzamiento:** Starter a mitad de precio ($1,499 → $749)

### **5.2 Costo de servicios**

**Reportes:**
- Quick Scan: Gratis (limitado)
- Auditoría Básica: 1,500 créditos
- Auditoría Pro: 3,000 créditos
- Assessment Completo: 5,000 créditos
- Simulación de ataques: Variable según cantidad de ataques

**Compliance (addons):**
- PCI DSS 4.0: 800 créditos
- ISO 27001: 800 créditos
- SOC 2 Type II: 800 créditos
- GDPR: 800 créditos
- LFPDPPP (México): 500 créditos
- Bundle completo (5 frameworks): 2,500 créditos (ahorro 900)

**Consultoría:**
- Quick Call (30min): $1,499 MXN (~1,000 créditos equiv)
- Config Review (60min): $2,999 MXN
- Security Workshop (2hrs): $4,999 MXN
- Asesor Mensual (4hrs/mes): $9,999 MXN

### **5.3 Planes de monitoreo continuo (Próximamente)**

| Plan | Precio/mes | Features |
|------|------------|----------|
| **Watch** | $499 MXN (~$29 USD) | Re-scan semanal, alertas, historial 90 días |
| **Guard** | $1,499 MXN (~$89 USD) | Todo Watch + Trust Badge + simulación mensual |
| **Shield** | $3,999 MXN (~$239 USD) | Todo Guard + Auto-Fix + 1hr consultoría/mes |

---

## **6. FLUJO DE PAGOS (MERCADO PAGO)**

### **6.1 Arquitectura de pagos**

```
┌──────────────┐
│ Mercado Pago │
└──────┬───────┘
       │
       ▼ Webhook
┌─────────────────────┐
│  Webhook Router     │  ◄─ Validación HMAC única
│webhooks.angaflow.com│  ◄─ Fetch payment completo
└─────────┬───────────┘
          │
          │ Routing por metadata.product
          │
    ┌─────┴─────┐
    ▼           ▼
┌───────┐   ┌─────────┐
│ CFDI  │   │Security │
│Backend│   │   API   │
└───────┘   └─────────┘
```

### **6.2 Metadata de pagos**

**Para Security:**
```json
{
  "product": "security",
  "service_type": "credit_recharge",
  "plan": "starter",
  "account_id": "uuid-here",
  "email": "user@example.com"
}
```

**External reference:** `security-{account_id}-{timestamp}`

### **6.3 Estados de pago**

- `approved` → Acreditar créditos inmediatamente
- `pending` → Esperar confirmación (OXXO, SPEI)
- `in_process` → En revisión
- `rejected` → No acreditar
- `cancelled` → No acreditar
- `refunded` → Crear transacción de tipo `refund`

### **6.4 Idempotencia**

Garantizada por:
1. Constraint UNIQUE en `security_payment_logs.payment_id`
2. Check antes de procesar: `SELECT * FROM security_payment_logs WHERE payment_id = ?`
3. Si existe y status != 'pending', skip processing
4. Atomicidad: Transaction en Supabase para INSERT log + UPDATE account

---

## **7. CONTROLES DE SEGURIDAD ANALIZADOS**

**8 categorías principales:**

1. **SSL/TLS** (score 0-100)
   - Versiones de TLS habilitadas
   - Cipher suites
   - HSTS configuración
   - Certificate transparency

2. **WAF (Web Application Firewall)**
   - Rules activas vs Log Only
   - Coverage de OWASP Top 10
   - Custom rules
   - Rate limiting

3. **DDoS Protection**
   - HTTP DDoS rules
   - L7 attack protection
   - Challenge threshold

4. **DNS Security**
   - DNSSEC
   - CAA records
   - DNS Firewall

5. **Bot Management**
   - Bot score threshold
   - Challenge type
   - JavaScript detections
   - Known bots handling

6. **API Security**
   - Schema validation
   - Rate limiting
   - JWT validation
   - mTLS

7. **Access Control**
   - IP allowlist/blocklist
   - Geo-blocking
   - Zero Trust policies

8. **Performance & Headers**
   - Cache configuration
   - Security headers (CSP, X-Frame-Options, etc.)
   - Early Hints
   - HTTP/3

**Output:** Score A-F general + score individual por categoría

---

## **8. SIMULACIÓN DE ATAQUES (75+)**

**Categorías de ataques simulados:**

1. **XSS (Cross-Site Scripting)**
   - Reflected XSS
   - Stored XSS
   - DOM-based XSS

2. **SQL Injection**
   - Classic SQLi
   - Blind SQLi
   - Time-based SQLi

3. **DDoS Simulation**
   - HTTP flood
   - Slowloris
   - GET/POST floods

4. **Bot Attacks**
   - Scraping bots
   - Credential stuffing
   - Account takeover attempts

5. **Malware/Phishing**
   - Malicious payload upload
   - Phishing page detection

6. **API Attacks**
   - GraphQL introspection
   - REST API fuzzing
   - Broken authentication

**Ejecución:** Cloudflare Workflow (30s CPU budget por step)

---

## **9. COMPLIANCE FRAMEWORKS**

**70 controles automáticos mapeados a:**

- **PCI DSS 4.0** (19 controles) - Payment Card Industry
- **ISO 27001** (15 controles) - Information Security Management
- **SOC 2 Type II** (12 controles) - Trust Service Criteria
- **GDPR** (12 controles) - Data Protection (EU)
- **LFPDPPP** (12 controles) - Protección de Datos (México)

**Output:**
- Reporte unificado con evidencia
- Gap analysis
- Recomendaciones de remediación por control

---

## **10. COMANDOS ESENCIALES**

### **Frontend (angaflow-security)**
```bash
cd ~/angaflow-security
npm install              # Instalar dependencias
npm run dev              # Dev server localhost:4321
npm run build            # Build para producción
npm run preview          # Preview del build
```

### **API (angaflow-security-api)**
```bash
cd ~/angaflow-security-api
npm install
wrangler dev             # Dev local
wrangler deploy          # Deploy a production
wrangler tail            # Ver logs en vivo
wrangler secret put NAME # Configurar secrets
```

### **Webhook Router**
```bash
cd ~/angaflow-webhook-router
wrangler dev
wrangler deploy
wrangler tail
```

---

## **11. VARIABLES DE ENTORNO**

### **Frontend (.env)**
```bash
# Variables públicas (expuestas en cliente)
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
PUBLIC_API_URL=https://api.angaflow.com
PUBLIC_MERCADOPAGO_PUBLIC_KEY=
```

### **API (Secrets via Wrangler)**
```bash
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
MERCADOPAGO_ACCESS_TOKEN
MERCADOPAGO_PUBLIC_KEY
MERCADOPAGO_WEBHOOK_SECRET
INTERNAL_WEBHOOK_SECRET
```

### **Webhook Router (Secrets via Wrangler)**
```bash
MERCADOPAGO_ACCESS_TOKEN
MERCADOPAGO_WEBHOOK_SECRET
INTERNAL_WEBHOOK_SECRET
CFDI_BACKEND_URL          # Optional, default: https://backend.angaflow.mx
SECURITY_BACKEND_URL      # Optional, default: https://api.angaflow.com
```

---

## **12. DOMINIOS Y ROUTING**

| Dominio | Tipo | Target | Cloudflare Service |
|---------|------|--------|-------------------|
| `angaflow.com` | Frontend | Astro app | Pages |
| `www.angaflow.com` | Frontend | Astro app | Pages |
| `api.angaflow.com` | API | Hono Worker | Workers (custom route) |
| `webhooks.angaflow.com` | Webhook | Router Worker | Workers (custom route) |

**Configuración en `wrangler.toml`:**
```toml
[[routes]]
pattern = "api.angaflow.com/*"
zone_name = "angaflow.com"
```

---

## **13. OBSERVABILIDAD Y LOGGING**

**Cloudflare Workers:**
- `wrangler tail` para logs en tiempo real
- Observability habilitado en API worker (wrangler.toml)
- Logs de Workflow para debugging

**Supabase:**
- Query logs en dashboard
- RLS (Row Level Security) habilitado en todas las tablas
- Auditoría de transacciones en `security_credit_transactions`

**Mercado Pago:**
- Webhook logs en `security_payment_logs` (raw_data JSONB)
- Idempotency check previene doble-procesamiento

---

## **14. SEGURIDAD**

### **14.1 Autenticación**
- Supabase Auth (JWT)
- Magic link email
- Password reset flow
- Admin middleware en API (`/admin/*` routes)

### **14.2 Protección de secrets**
- `.env` NO commitear (en .gitignore)
- Secrets en Cloudflare via `wrangler secret put`
- `INTERNAL_WEBHOOK_SECRET` compartido entre router y API

### **14.3 Validación de webhooks**
- HMAC-SHA256 signature validation
- Timing-safe comparison para prevenir timing attacks
- Fail-closed: si validación falla, rechazar request (401)

### **14.4 RLS (Row Level Security)**
- Todas las tablas `security_*` tienen políticas RLS
- Usuario solo accede a sus propios datos
- Admin tiene acceso global (role check)

---

## **15. INTEGRACIONES EXTERNAS**

### **15.1 Supabase**
- **Uso:** Database + Auth
- **Cliente:** `@supabase/supabase-js`
- **Auth:** JWT en header `Authorization: Bearer <token>`

### **15.2 Mercado Pago**
- **Uso:** Procesamiento de pagos (México/LATAM)
- **Integración:** Checkout Pro (hosted)
- **Webhooks:** Via router en `webhooks.angaflow.com`
- **Métodos:** Tarjeta, OXXO, SPEI, débito

### **15.3 Workers AI**
- **Uso:** Consultor IA para explicar vulnerabilidades
- **Binding:** `AI` en API worker
- **Modelo:** (Por definir - posiblemente @cf/meta/llama-3-8b-instruct)

### **15.4 Cloudflare Workflows**
- **Uso:** Simulación de ataques (long-running tasks)
- **Binding:** `SIMULATION_WORKFLOW`
- **Ventaja:** 30s CPU budget por step (vs 10ms/50ms de Workers)

---

## **16. ROADMAP Y FEATURES PRÓXIMAS**

**Próximamente (según landing):**
- Trust Badge (sello verificado para sitios)
- Benchmarks (comparación con industria/región)
- Planes de monitoreo continuo (Watch/Guard/Shield)
- Auto-Fix de configuraciones (Shield plan)
- Paquetes anuales con descuento

**Fase actual:** MVP con sistema de créditos operativo

---

## **17. STACK TECNOLÓGICO COMPLETO**

**Frontend:**
- Astro 5.17.1 (SSR + SSG)
- React 19.2
- Tailwind CSS 4.2
- Lucide React (icons)
- jsPDF (generación de reportes)

**Backend:**
- Cloudflare Workers (runtime)
- Hono 4.7 (framework API)
- TypeScript 5.7
- Cloudflare Workflows
- Workers AI

**Base de datos:**
- Supabase (PostgreSQL managed)
- Row Level Security
- JSONB para metadatos flexibles

**Pagos:**
- Mercado Pago (México/LATAM)
- Webhook routing multi-producto

**DevOps:**
- Wrangler CLI
- Cloudflare Pages (frontend)
- Cloudflare Workers (backend + router)
- Git + GitHub

**Testing:**
- (Por implementar - no hay setup visible)

---

## **18. CONTACTO Y SOPORTE**

**Email:** hello@angaflow.com  
**WhatsApp:** +52 55 5157 5041  
**Sitio web:** https://angaflow.com

**Horarios de consultoría:** Remoto vía Google Meet (agendado por WhatsApp)

---

## **19. INFORMACIÓN LEGAL**

**Entidad:** ANGA Mexico  
**Ubicación:** 🇲🇽 Hecho en México  
**Disclaimers:**
- Cloudflare® es marca registrada de Cloudflare, Inc.
- Anga Security NO está afiliado, patrocinado ni respaldado por Cloudflare, Inc.
- Reportes son de carácter consultivo (no sustituyen auditoría formal certificada)

**Documentos legales en sitio:**
- Aviso de Privacidad
- Términos de Servicio
- Política de Cookies
- Política de Reembolsos
- Política de Cancelación

---

## **20. NOTAS PARA CONTINUIDAD**

### **20.1 Para retomar desarrollo:**
1. Verificar que todos los secrets estén configurados (`wrangler secret list`)
2. Confirmar conexión a Supabase (probar queries desde API)
3. Validar webhook de Mercado Pago en sandbox
4. Revisar logs de Workers con `wrangler tail`

### **20.2 Debugging común:**
- **500 en API:** Verificar secrets (SUPABASE_URL, etc.)
- **Webhook no funciona:** Revisar HMAC signature en router
- **Créditos no se acreditan:** Check `security_payment_logs` para idempotency
- **Frontend no se conecta:** Verificar CORS en API (`CORS_ORIGIN` var)

### **20.3 Tareas pendientes probables:**
- [ ] Implementar tests (unit + integration)
- [ ] Configurar CI/CD
- [ ] Documentar API (OpenAPI/Swagger)
- [ ] Implementar rate limiting en API
- [ ] Setup de monitoring/alerting (Sentry, etc.)
- [ ] Backup strategy para Supabase

---

## **21. PREGUNTAS FRECUENTES TÉCNICAS**

**¿Por qué un router de webhooks separado?**
- Centraliza validación HMAC (single point of truth)
- Permite rutear a múltiples backends (CFDI + Security)
- Evita duplicar lógica de validación

**¿Por qué Cloudflare Workflows para simulación?**
- Workers tienen límite de 10ms (free) / 50ms (paid) CPU
- Simulación de 75+ ataques requiere más tiempo
- Workflows dan 30s CPU por step + state management

**¿Por qué JSONB en reportes?**
- Flexibilidad para distintos tipos de reportes (audit, simulation, compliance)
- Evita schema migrations constantes
- Permite queries avanzados con Postgres JSONB operators

**¿Por qué Astro en vez de Next.js?**
- Mejor performance (less JavaScript shipped)
- SSR + SSG híbrido
- Integración nativa con Cloudflare Pages
- Menor complejidad para landing + dashboard

---

## **FIN DEL DOCUMENTO DE CONTEXTO**

**Última actualización:** 2026-03-17  
**Versión:** 1.0  
**Autor:** Compilado automáticamente por análisis de proyectos

---

**Este documento debe permitir que cualquier sesión futura o desarrollador pueda:**
1. Entender la arquitectura completa
2. Navegar los 3 proyectos sin perderse
3. Debuggear problemas comunes
4. Retomar desarrollo desde cualquier punto
5. Onboarding de nuevos miembros del equipo
