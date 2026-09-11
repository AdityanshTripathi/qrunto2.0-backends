import 'dotenv/config';
import { logSafeError, logStructured } from '../lib/safe-error';

export class WhatsAppService {
  private static get config() {
    return {
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
      graphApiUrl: 'https://graph.facebook.com/v20.0'
    };
  }

  private static providerConfig(): { phoneNumberId: string; accessToken: string; graphApiUrl: string } {
    const config = this.config;
    if (!config.phoneNumberId || !config.accessToken) {
      throw Object.assign(new Error('WhatsApp provider configuration missing'), { code: 'WHATSAPP_CONFIG_MISSING' });
    }
    return config;
  }

  /**
   * Format phone number to international standard (E.164 without leading +)
   * Example: "+91 74898 44089" -> "917489844089"
   */
  private static formatPhoneNumber(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    // If 10 digits without country code, default to India (91)
    if (cleaned.length === 10) {
      cleaned = '91' + cleaned;
    }
    return cleaned;
  }

  /**
   * Send a direct text message via WhatsApp Business Cloud API
   */
  static async sendTextMessage(toPhone: string, messageText: string): Promise<any> {
    try {
      const formattedPhone = this.formatPhoneNumber(toPhone);
      const config = this.providerConfig();
      const url = `${config.graphApiUrl}/${config.phoneNumberId}/messages`;

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'text',
        text: {
          preview_url: false,
          body: messageText
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });

      const data = await response.json();

      if (!response.ok) {
        throw Object.assign(new Error('WhatsApp provider rejected message'), { code: `HTTP_${response.status}` });
      }

      logStructured('info', 'whatsapp', 'message.text', 'completed', 'WhatsApp text message accepted');
      return data;
    } catch (error) {
      logSafeError('message.text', error, 'whatsapp');
      throw error;
    }
  }

  /**
   * Send a pre-approved Meta Template message (Required for business-initiated chats)
   */
  static async sendTemplateMessage(
    toPhone: string,
    templateName: string = 'hello_world',
    languageCode: string = 'en_US',
    components: any[] = []
  ): Promise<any> {
    try {
      const formattedPhone = this.formatPhoneNumber(toPhone);
      const config = this.providerConfig();
      const url = `${config.graphApiUrl}/${config.phoneNumberId}/messages`;

      const payload = {
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: 'template',
        template: {
          name: templateName,
          language: {
            code: languageCode
          },
          ...(components.length > 0 && { components })
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });

      const data = await response.json();

      if (!response.ok) {
        throw Object.assign(new Error('WhatsApp provider rejected template'), { code: `HTTP_${response.status}` });
      }

      logStructured('info', 'whatsapp', 'message.template', 'completed', 'WhatsApp template accepted');
      return data;
    } catch (error) {
      logSafeError('message.template', error, 'whatsapp');
      throw error;
    }
  }
}
