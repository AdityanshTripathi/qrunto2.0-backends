import { Router, Request, Response, NextFunction } from 'express';
import { WhatsAppService } from '../services/whatsapp.service';
import { logSafeError, logStructured } from '../lib/safe-error';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { ConsentService } from '../services/crm/consent.service';
import { normalizeGuestPhone } from '../services/crm/phone-verification.service';

const router = Router();

/**
 * GET /api/webhook/whatsapp
 * Meta WhatsApp Webhook Verification Handshake
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const mode = req.query['hub.mode'] as string;
    const token = req.query['hub.verify_token'] as string;
    const challenge = req.query['hub.challenge'] as string;

    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

    logStructured('info', 'whatsapp', 'webhook.verify', 'received', 'WhatsApp verification request received', { mode });

    if (mode && token) {
      if (verifyToken && mode === 'subscribe' && token === verifyToken) {
        logStructured('info', 'whatsapp', 'webhook.verify', 'completed', 'WhatsApp webhook verified');
        res.type('text/plain').send(challenge);
        return;
      } else {
        logStructured('warn', 'whatsapp', 'webhook.verify', 'rejected', 'WhatsApp webhook verification rejected');
        res.sendStatus(403);
        return;
      }
    }

    res.sendStatus(400);
  } catch (error) {
    logSafeError('webhook.verify', error, 'whatsapp');
    res.sendStatus(500);
  }
});

/**
 * POST /api/webhook/whatsapp
 * Meta WhatsApp Webhook Event Listener (Incoming messages & status updates)
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const secret = process.env.WHATSAPP_APP_SECRET;
    if (!secret) { res.status(503).json({ error: 'Webhook verification is not configured' }); return; }
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const signature = req.header('x-hub-signature-256');
    const expected = rawBody ? `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}` : '';
    if (!signature || signature.length !== expected.length ||
        !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      res.sendStatus(403); return;
    }
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry ?? []) for (const change of entry.changes ?? []) {
        for (const status of change.value?.statuses ?? []) {
          if (typeof status.id !== 'string') continue;
          const next = status.status === 'read' ? 'READ' : status.status === 'delivered' ? 'DELIVERED' : status.status === 'failed' ? 'FAILED' : null;
          if (!next) continue;
          await prisma.campaignLog.updateMany({
            where: { providerMessageId: status.id },
            data: { status: next, ...(next === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
              ...(next === 'READ' ? { readAt: new Date() } : {}) },
          });
        }
        for (const message of change.value?.messages ?? []) {
          if (typeof message.from !== 'string' || typeof message.text?.body !== 'string') continue;
          if (!/^(stop|unsubscribe|opt.?out)$/i.test(message.text.body.trim())) continue;
          let phone: string;
          try { phone = normalizeGuestPhone(message.from); }
          catch { continue; }
          const senderId = change.value?.metadata?.phone_number_id;
          if (typeof senderId !== 'string') continue;
          const connection = await prisma.brandWhatsAppConnection.findUnique({ where: { phoneNumberId: senderId }, select: { brandId: true } });
          if (!connection) continue;
          const customers = await prisma.customer.findMany({ where: { phone, crmGeneration: 2, brandId: connection.brandId }, select: { id: true } });
          for (const customer of customers) {
            await new ConsentService().recordWhatsAppMarketing(customer.id, false, `WEBHOOK:${message.id || randomUUID()}`);
          }
        }
      }
      logStructured('info', 'whatsapp', 'webhook.event', 'received', 'WhatsApp webhook event received',
        { object: typeof body.object === 'string' ? body.object : 'unknown' });
      res.status(200).send('EVENT_RECEIVED');
      return;
    }

    res.sendStatus(404);
  } catch (error) {
    logSafeError('webhook.event', error, 'whatsapp');
    res.sendStatus(500);
  }
});

const requireSendTestEnabled = (req: Request, res: Response, next: NextFunction): void => {
  const environmentAllowsTest = ['development', 'test'].includes(process.env.NODE_ENV ?? '');
  const explicitlyEnabled = process.env.ENABLE_WHATSAPP_SEND_TEST === 'true';

  if (!environmentAllowsTest || !explicitlyEnabled) {
    res.sendStatus(404);
    return;
  }

  next();
};

/**
 * POST /api/webhook/whatsapp/send-test
 * Trigger a test message to a WhatsApp number
 */
router.post('/send-test', requireSendTestEnabled, async (req: Request, res: Response) => {
  try {
    const { phone, message, templateName } = req.body;
    if (typeof phone !== 'string' || (!templateName && typeof message !== 'string')) {
      res.status(400).json({ success: false, error: 'Phone and message or templateName are required' });
      return;
    }

    if (templateName) {
      await WhatsAppService.sendTemplateMessage(phone, templateName);
    } else {
      await WhatsAppService.sendTextMessage(phone, message);
    }

    res.status(200).json({
      success: true,
      message: 'WhatsApp test message sent successfully!'
    });
  } catch (error) {
    logSafeError('send-test', error, 'whatsapp');
    res.status(500).json({
      success: false,
      error: 'Failed to send test message'
    });
  }
});

export default router;
