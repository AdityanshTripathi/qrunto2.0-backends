import { prisma } from '../../lib/prisma';
import {
  ActiveWhatsAppTemplateSnapshot,
  WhatsAppConnectionService,
} from './whatsapp-connection.service';

export interface TemplateParameterDefinition {
  name: string;
  component: 'HEADER' | 'BODY' | 'BUTTON';
  index: number;
  type: 'text';
  buttonIndex?: number;
}

export interface TemplateParameterSchema {
  version: 1;
  parameters: TemplateParameterDefinition[];
}

export interface WhatsAppCampaignSelection {
  whatsappTemplateId?: string | null;
  whatsappTemplateLanguage?: string | null;
  whatsappTemplateCategory?: string | null;
  whatsappTemplateParameters?: unknown;
  whatsappConnectionVersion?: string | null;
}

export interface CachedTemplateForValidation {
  id: string;
  brandId: string;
  wabaId: string;
  templateName: string;
  languageCode: string;
  category: string | null;
  approvalStatus: string;
  parameterSchema: unknown;
}

export class WhatsAppTemplateValidationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

function fail(code: string, message: string): never {
  throw new WhatsAppTemplateValidationError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseParameterSchema(value: unknown): TemplateParameterSchema | null {
  if (!isRecord(value) || value['version'] !== 1 || !Array.isArray(value['parameters'])) return null;
  const parameters: TemplateParameterDefinition[] = [];
  for (const entry of value['parameters']) {
    if (!isRecord(entry) || typeof entry['name'] !== 'string' ||
        !['HEADER', 'BODY', 'BUTTON'].includes(String(entry['component'])) ||
        !Number.isInteger(entry['index']) || Number(entry['index']) < 1 || entry['type'] !== 'text') return null;
    const component = entry['component'] as TemplateParameterDefinition['component'];
    const buttonIndex = entry['buttonIndex'];
    if (component === 'BUTTON' && (!Number.isInteger(buttonIndex) || Number(buttonIndex) < 0)) return null;
    parameters.push({
      name: entry['name'], component, index: Number(entry['index']), type: 'text',
      ...(component === 'BUTTON' ? { buttonIndex: Number(buttonIndex) } : {}),
    });
  }
  if (new Set(parameters.map(parameter => parameter.name)).size !== parameters.length) return null;
  return { version: 1, parameters };
}

function parameterValues(value: unknown, schema: TemplateParameterSchema): Record<string, string> {
  if (!isRecord(value)) fail('WHATSAPP_TEMPLATE_PARAMETERS_INVALID', 'WhatsApp template parameters are invalid');
  const expected = schema.parameters.map(parameter => parameter.name).sort();
  const supplied = Object.keys(value).sort();
  if (expected.length !== supplied.length || expected.some((name, index) => name !== supplied[index])) {
    fail('WHATSAPP_TEMPLATE_PARAMETERS_INVALID', 'WhatsApp template parameters do not match the selected template');
  }
  const normalized: Record<string, string> = {};
  for (const name of expected) {
    const item = value[name];
    if (typeof item !== 'string' || item.length === 0 || item.length > 1024) {
      fail('WHATSAPP_TEMPLATE_PARAMETERS_INVALID', 'WhatsApp template parameter values are invalid');
    }
    normalized[name] = item;
  }
  return normalized;
}

export function validateWhatsAppCampaignSelection(
  brandId: string,
  selection: WhatsAppCampaignSelection,
  template: CachedTemplateForValidation | null,
  current: Pick<ActiveWhatsAppTemplateSnapshot, 'brandId' | 'wabaId' | 'connectionVersion'>,
): { template: CachedTemplateForValidation; schema: TemplateParameterSchema; parameterValues: Record<string, string> } {
  if (!selection.whatsappTemplateId || !selection.whatsappTemplateLanguage ||
      !selection.whatsappTemplateCategory || !selection.whatsappConnectionVersion) {
    fail('WHATSAPP_TEMPLATE_SELECTION_REQUIRED', 'A verified WhatsApp template selection is required');
  }
  if (!template || template.id !== selection.whatsappTemplateId || template.brandId !== brandId ||
      current.brandId !== brandId || template.wabaId !== current.wabaId || template.approvalStatus !== 'APPROVED') {
    fail('WHATSAPP_TEMPLATE_UNAVAILABLE', 'The selected WhatsApp template is unavailable');
  }
  if (selection.whatsappConnectionVersion !== current.connectionVersion) {
    fail('WHATSAPP_TEMPLATE_STALE', 'The WhatsApp template selection must be refreshed');
  }
  if (selection.whatsappTemplateLanguage !== template.languageCode ||
      selection.whatsappTemplateCategory !== template.category) {
    fail('WHATSAPP_TEMPLATE_MISMATCH', 'WhatsApp template language or category does not match');
  }
  const schema = parseParameterSchema(template.parameterSchema);
  if (!schema) fail('WHATSAPP_TEMPLATE_UNAVAILABLE', 'The selected WhatsApp template schema is unavailable');
  return { template, schema, parameterValues: parameterValues(selection.whatsappTemplateParameters, schema) };
}

export function buildTemplateComponents(
  schemaValue: unknown,
  valuesValue: unknown,
): Array<Record<string, unknown>> {
  const schema = parseParameterSchema(schemaValue);
  if (!schema) fail('WHATSAPP_TEMPLATE_UNAVAILABLE', 'The selected WhatsApp template schema is unavailable');
  const values = parameterValues(valuesValue, schema);
  const groups = new Map<string, TemplateParameterDefinition[]>();
  for (const parameter of schema.parameters) {
    const key = parameter.component === 'BUTTON' ? `BUTTON:${parameter.buttonIndex}` : parameter.component;
    groups.set(key, [...(groups.get(key) ?? []), parameter]);
  }
  return [...groups.entries()].map(([key, parameters]) => {
    const ordered = [...parameters].sort((a, b) => a.index - b.index);
    const metaParameters = ordered.map(parameter => {
      const prefix = parameter.component === 'BUTTON'
        ? `button.${parameter.buttonIndex}.`
        : `${parameter.component.toLowerCase()}.`;
      const placeholder = parameter.name.startsWith(prefix) ? parameter.name.slice(prefix.length) : '';
      return {
        type: 'text',
        ...(!/^\d+$/.test(placeholder) && placeholder ? { parameter_name: placeholder } : {}),
        text: values[parameter.name]!,
      };
    });
    if (key.startsWith('BUTTON:')) {
      return { type: 'button', sub_type: 'url', index: key.split(':')[1]!, parameters: metaParameters };
    }
    return { type: key.toLowerCase(), parameters: metaParameters };
  });
}

export class WhatsAppTemplateValidationService {
  constructor(private readonly connections: Pick<WhatsAppConnectionService, 'getActiveTemplateSnapshot'> = new WhatsAppConnectionService()) {}

  private async template(brandId: string, templateId: string | null | undefined) {
    return templateId
      ? prisma.brandWhatsAppTemplate.findFirst({
          where: { id: templateId, brandId },
          select: {
            id: true, brandId: true, wabaId: true, templateName: true, languageCode: true,
            category: true, approvalStatus: true, parameterSchema: true,
          },
        })
      : null;
  }

  async prepareNew(brandId: string, selection: WhatsAppCampaignSelection) {
    const current = await this.connections.getActiveTemplateSnapshot(brandId);
    const verifiedSelection = { ...selection, whatsappConnectionVersion: current.connectionVersion };
    return {
      ...validateWhatsAppCampaignSelection(brandId, verifiedSelection, await this.template(brandId, selection.whatsappTemplateId), current),
      connectionVersion: current.connectionVersion, current,
    };
  }

  async validate(brandId: string, selection: WhatsAppCampaignSelection) {
    const current = await this.connections.getActiveTemplateSnapshot(brandId);
    return {
      ...validateWhatsAppCampaignSelection(
        brandId, selection, await this.template(brandId, selection.whatsappTemplateId), current,
      ),
      current,
    };
  }
}
