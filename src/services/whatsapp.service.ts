import 'dotenv/config';

export class WhatsAppService {
  private static get config() {
    return {
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '1263351703520274',
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
      graphApiUrl: 'https://graph.facebook.com/v20.0'
    };
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
      const url = `${this.config.graphApiUrl}/${this.config.phoneNumberId}/messages`;

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
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('[WhatsApp API Send Text Failed]:', data);
        throw new Error(data.error?.message || 'Failed to send WhatsApp message');
      }

      console.log('[WhatsApp API Send Text Success]:', data);
      return data;
    } catch (error: any) {
      console.error('[WhatsAppService Error]:', error.message || error);
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
      const url = `${this.config.graphApiUrl}/${this.config.phoneNumberId}/messages`;

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
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('[WhatsApp API Send Template Failed]:', data);
        throw new Error(data.error?.message || 'Failed to send WhatsApp template message');
      }

      console.log('[WhatsApp API Send Template Success]:', data);
      return data;
    } catch (error: any) {
      console.error('[WhatsAppService Template Error]:', error.message || error);
      throw error;
    }
  }
}
