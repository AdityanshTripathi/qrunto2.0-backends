import { Router, Request, Response, NextFunction } from 'express';
import { WhatsAppService } from '../services/whatsapp.service';
import { logSafeError, logStructured } from '../lib/safe-error';

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
router.post('/', (req: Request, res: Response) => {
  try {
    const body = req.body;

    if (body.object) {
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
