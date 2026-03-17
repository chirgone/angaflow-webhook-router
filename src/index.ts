/**
 * Angaflow Webhook Router
 * Routes Mercado Pago webhooks to correct backend based on metadata.product
 * 
 * Architecture:
 * - Receives webhook from Mercado Pago
 * - Validates HMAC signature (single point of validation)
 * - Fetches full payment details from MP API
 * - Routes to correct backend based on payment.metadata.product
 * - Forwards payment object to avoid backend re-fetching
 */

interface Env {
  MERCADOPAGO_ACCESS_TOKEN: string;
  MERCADOPAGO_WEBHOOK_SECRET: string;
  INTERNAL_WEBHOOK_SECRET: string;
  CFDI_BACKEND_URL?: string;
  SECURITY_BACKEND_URL?: string;
  ENVIRONMENT: string;
}

// ============================================================
// HMAC-SHA256 Webhook Signature Validation
// Based on Mercado Pago spec: id:{data.id};request-id:{x-request-id};ts:{ts};
// ============================================================
async function validateWebhookSignature(
  secret: string,
  dataId: string,
  requestId: string,
  ts: string,
  signature: string
): Promise<boolean> {
  try {
    const template = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(template));
    const computedSignature = Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Timing-safe comparison to prevent timing attacks
    const encoder2 = new TextEncoder();
    const computedBytes = encoder2.encode(computedSignature);
    const signatureBytes2 = encoder2.encode(signature);
    
    if (computedBytes.length !== signatureBytes2.length) {
      return false;
    }
    
    return crypto.subtle.timingSafeEqual(computedBytes, signatureBytes2);
  } catch (error) {
    console.error('❌ HMAC validation error:', error);
    return false;
  }
}

// ============================================================
// Router Handler
// ============================================================
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // Health check endpoint
    if (url.pathname === '/health' && request.method === 'GET') {
      return new Response(JSON.stringify({ 
        status: 'ok', 
        service: 'angaflow-webhook-router',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    
    // Only handle POST /mercadopago
    if (url.pathname !== '/mercadopago' || request.method !== 'POST') {
      return new Response('Not Found', { status: 404 });
    }
    
    // ==============================================
    // Step 1: Parse webhook payload
    // ==============================================
    let payload: any;
    try {
      payload = await request.json();
    } catch {
      console.error('❌ Invalid JSON payload');
      return new Response('Invalid JSON', { status: 400 });
    }
    
    const eventType = payload.type || payload.topic;
    const dataId = payload.data?.id;
    
    console.log(`📨 Webhook received: type=${eventType}, dataId=${dataId}`);
    
    // Only process payment events
    if (eventType !== 'payment' || !dataId) {
      console.log('⏭️ Skipping non-payment event');
      return new Response('OK', { status: 200 });
    }
    
    // ==============================================
    // Step 2: Validate HMAC signature (fail-closed)
    // ==============================================
    if (!env.MERCADOPAGO_WEBHOOK_SECRET) {
      console.error('🚨 MERCADOPAGO_WEBHOOK_SECRET not configured');
      return new Response('Server configuration error', { status: 500 });
    }
    
    const xSignature = request.headers.get('x-signature');
    const xRequestId = request.headers.get('x-request-id');
    
    if (!xSignature || !xRequestId) {
      console.error('❌ Missing signature headers');
      return new Response('Missing signature headers', { status: 401 });
    }
    
    // Parse signature components
    const signatureParts: Record<string, string> = {};
    xSignature.split(',').forEach((part) => {
      const [key, value] = part.split('=');
      if (key && value) signatureParts[key.trim()] = value.trim();
    });
    
    const ts = signatureParts['ts'];
    const hash = signatureParts['v1'];
    
    if (!ts || !hash) {
      console.error('❌ Invalid signature format (missing ts or v1)');
      return new Response('Invalid signature format', { status: 401 });
    }
    
    const isValid = await validateWebhookSignature(
      env.MERCADOPAGO_WEBHOOK_SECRET,
      String(dataId),
      xRequestId,
      ts,
      hash
    );
    
    if (!isValid) {
      console.error('❌ Invalid HMAC signature');
      return new Response('Invalid signature', { status: 401 });
    }
    
    console.log('✅ HMAC signature valid');
    
    // ==============================================
    // Step 3: Fetch payment from MP to get metadata
    // (Webhook payload only has payment ID, not metadata)
    // ==============================================
    if (!env.MERCADOPAGO_ACCESS_TOKEN) {
      console.error('🚨 MERCADOPAGO_ACCESS_TOKEN not configured');
      return new Response('Server configuration error', { status: 500 });
    }
    
    let payment: any;
    try {
      const mpResponse = await fetch(
        `https://api.mercadopago.com/v1/payments/${dataId}`,
        {
          headers: { 
            'Authorization': `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          },
        }
      );
      
      if (!mpResponse.ok) {
        console.error(`❌ Failed to fetch payment from MP: ${mpResponse.status}`);
        // Return 500 so MP retries — without payment data we cannot process credits
        return new Response('Failed to fetch payment data', { status: 500 });
      }
      
      payment = await mpResponse.json();
      console.log(`✅ Payment fetched: ${payment.id}, status=${payment.status}`);
    } catch (error) {
      console.error('❌ Error fetching payment:', error);
      // Return 500 so MP retries on network errors
      return new Response('Error fetching payment data', { status: 500 });
    }
    
    // Extract product from metadata for routing
    const product = payment.metadata?.product || 'cfdi'; // Default to CFDI for backward compatibility
    console.log(`📦 Routing decision: product="${product}"`);
    
    // ==============================================
    // Step 4: Route to correct backend
    // ==============================================
    const cfdiBackendUrl = env.CFDI_BACKEND_URL || 'https://backend.angaflow.mx';
    const securityBackendUrl = env.SECURITY_BACKEND_URL || 'https://api.angaflow.com';
    
    let targetUrl: string;
    if (product === 'security') {
      targetUrl = `${securityBackendUrl}/api/payments/webhooks/internal`;
    } else {
      // Default to CFDI for backward compatibility (existing payments without product field)
      targetUrl = `${cfdiBackendUrl}/api/payments/webhooks/mercadopago`;
    }
    
    console.log(`🚀 Forwarding to: ${targetUrl}`);
    
    // Forward webhook to target backend
    try {
      const forwardResponse = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Auth': env.INTERNAL_WEBHOOK_SECRET,
          'X-Original-Signature': xSignature,
          'X-Original-Request-Id': xRequestId,
        },
        body: JSON.stringify({
          notification: payload,  // Original webhook notification
          payment: payment,       // Full payment object (already fetched)
        }),
      });
      
      if (!forwardResponse.ok) {
        const errBody = await forwardResponse.text().catch(() => '');
        console.error(`❌ Backend returned ${forwardResponse.status}: ${errBody}`);
        // Return 500 so MP retries — backend failed to process the payment
        return new Response(`Backend error: ${forwardResponse.status}`, { status: 500 });
      }
      
      console.log(`✅ Successfully forwarded to ${product} backend`);
      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error(`❌ Failed to forward webhook:`, error);
      // Return 500 so MP retries on network errors
      return new Response('Error forwarding webhook', { status: 500 });
    }
  },
};
