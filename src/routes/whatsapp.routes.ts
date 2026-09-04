import { Router, Request, Response, NextFunction } from 'express';
import { WhatsAppService } from '../services/whatsapp.service';

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

    console.log('[WhatsApp Webhook GET] Verification request received:', { mode });

    if (mode && token) {
      if (verifyToken && mode === 'subscribe' && token === verifyToken) {
        console.log('[WhatsApp Webhook] Verification successful!');
        res.type('text/plain').send(challenge);
        return;
      } else {
        console.error('[WhatsApp Webhook] Verification failed. Token mismatch.');
        res.sendStatus(403);
        return;
      }
    }

    res.sendStatus(400);
  } catch (error) {
    console.error('[WhatsApp Webhook GET Error]:', error);
    res.sendStatus(500);
  }
});

/**
 * POST /api/webhook/whatsapp
 * Meta WhatsApp Webhook Event Listener (Incoming messages & status updates)
 */
router.post('/', (req: Request, res: Response) => {
  try {
    const body = req.body;

    if (body.object) {
      console.log('[WhatsApp Webhook POST] Received event payload:', JSON.stringify(body, null, 2));
      res.status(200).send('EVENT_RECEIVED');
      return;
    }

    res.sendStatus(404);
  } catch (error) {
    console.error('[WhatsApp Webhook POST Error]:', error);
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
    const targetPhone = phone || '917489844089';

    let result;
    if (templateName) {
      result = await WhatsAppService.sendTemplateMessage(targetPhone, templateName);
    } else {
      const textMsg = message || '🎉 Hello from Ordio WhatsApp Business API integration!';
      result = await WhatsAppService.sendTextMessage(targetPhone, textMsg);
    }

    res.status(200).json({
      success: true,
      message: 'WhatsApp test message sent successfully!'
    });
  } catch {
    console.error('[WhatsApp Test Endpoint Error]');
    res.status(500).json({
      success: false,
      error: 'Failed to send test message'
    });
  }
});

export default router;
