import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import {
  ActiveWhatsAppTemplateSnapshot,
  WhatsAppConnectionErrorCode,
  WhatsAppConnectionService,
} from './whatsapp-connection.service';
import {
  parseParameterSchema,
  TemplateParameterDefinition,
  TemplateParameterSchema,
} from './whatsapp-template-validation.service';

const DEFAULT_GRAPH_VERSION = 'v26.0';
const MAX_PAGES = 20;

export interface CachedWhatsAppTemplate {
  id?: string;
  brandId: string;
  wabaId: string;
  metaTemplateId: string | null;
  templateName: string;
  languageCode: string;
  category: string | null;
  approvalStatus: string;
  componentsJson: unknown;
  parameterSchema: TemplateParameterSchema;
  lastSyncedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

interface TemplateConnection {
  getActiveTemplateSnapshot(brandId: string): Promise<ActiveWhatsAppTemplateSnapshot>;
  markTemplatesSynced(brandId: string, identity: { connectionVersion: string }): Promise<boolean>;
  markNeedsReauth(brandId: string, identity: { connectionVersion: string }, code?: WhatsAppConnectionErrorCode): Promise<boolean>;
  recordSafeError(brandId: string, identity: { connectionVersion: string }, code?: WhatsAppConnectionErrorCode): Promise<boolean>;
}

interface TemplateRepository {
  replaceSnapshot(snapshot: ActiveWhatsAppTemplateSnapshot, templates: CachedWhatsAppTemplate[]): Promise<boolean>;
  list(brandId: string, wabaId?: string): Promise<CachedWhatsAppTemplate[]>;
}

export class WhatsAppTemplateSyncError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) {
    super(message);
  }
}

function graphVersion(): string {
  const value = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || DEFAULT_GRAPH_VERSION;
  if (!/^v\d+\.\d+$/.test(value)) {
    throw new WhatsAppTemplateSyncError('WHATSAPP_GRAPH_CONFIG_INVALID', 503, 'WhatsApp template synchronization is not configured');
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeNext(value: unknown, expectedPath: string): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string') throw new WhatsAppTemplateSyncError(
    'META_TEMPLATE_RESPONSE_INVALID', 502, 'WhatsApp template provider returned an invalid response',
  );
  let url: URL;
  try { url = new URL(value); } catch {
    throw new WhatsAppTemplateSyncError('META_TEMPLATE_RESPONSE_INVALID', 502, 'WhatsApp template provider returned an invalid response');
  }
  if (url.protocol !== 'https:' || url.hostname !== 'graph.facebook.com' || url.port || url.username || url.password ||
      url.hash || url.pathname !== expectedPath) {
    throw new WhatsAppTemplateSyncError('META_TEMPLATE_RESPONSE_INVALID', 502, 'WhatsApp template provider returned an invalid response');
  }
  // Meta has historically echoed credentials into paging URLs. Authentication is
  // always supplied from the server snapshot, so credential query keys are removed.
  url.searchParams.delete('access_token');
  url.searchParams.delete('appsecret_proof');
  return url.toString();
}

function placeholderDefinitions(text: string, prefix: string, component: TemplateParameterDefinition['component'], buttonIndex?: number) {
  const definitions: TemplateParameterDefinition[] = [];
  const seen = new Set<string>();
  const expression = /{{\s*([A-Za-z_][A-Za-z0-9_.-]*|\d+)\s*}}/g;
  let match: RegExpExecArray | null;
  let ordinal = 0;
  while ((match = expression.exec(text)) !== null) {
    const placeholder = match[1]!;
    if (seen.has(placeholder)) continue;
    seen.add(placeholder);
    ordinal++;
    const position = /^\d+$/.test(placeholder) ? Number(placeholder) : ordinal;
    definitions.push({
      name: `${prefix}.${placeholder}`, component, index: position, type: 'text',
      ...(buttonIndex === undefined ? {} : { buttonIndex }),
    });
  }
  return definitions;
}

function deriveSchema(components: unknown[]): TemplateParameterSchema {
  const parameters: TemplateParameterDefinition[] = [];
  for (const componentValue of components) {
    if (!isRecord(componentValue) || typeof componentValue['type'] !== 'string') continue;
    const type = componentValue['type'].toUpperCase();
    if ((type === 'HEADER' || type === 'BODY') && typeof componentValue['text'] === 'string') {
      parameters.push(...placeholderDefinitions(
        componentValue['text'], type.toLowerCase(), type as 'HEADER' | 'BODY',
      ));
    }
    if (type === 'BUTTONS' && Array.isArray(componentValue['buttons'])) {
      componentValue['buttons'].forEach((button, buttonIndex) => {
        if (isRecord(button) && typeof button['url'] === 'string') {
          parameters.push(...placeholderDefinitions(button['url'], `button.${buttonIndex}`, 'BUTTON', buttonIndex));
        }
      });
    }
  }
  return { version: 1, parameters };
}

function parseTemplate(value: unknown, snapshot: ActiveWhatsAppTemplateSnapshot, syncedAt: Date): CachedWhatsAppTemplate | null {
  if (!isRecord(value) || typeof value['name'] !== 'string' || !/^[a-z0-9_]{1,512}$/.test(value['name']) ||
      typeof value['language'] !== 'string' || value['language'].length > 35 ||
      typeof value['category'] !== 'string' || value['category'].length > 64 ||
      typeof value['status'] !== 'string' || value['status'].length > 64 ||
      !Array.isArray(value['components'])) return null;
  if (value['id'] !== undefined && typeof value['id'] !== 'string') return null;
  return {
    brandId: snapshot.brandId, wabaId: snapshot.wabaId,
    metaTemplateId: typeof value['id'] === 'string' ? value['id'] : null,
    templateName: value['name'], languageCode: value['language'],
    category: value['category'],
    approvalStatus: value['status'].toUpperCase(), componentsJson: value['components'],
    parameterSchema: deriveSchema(value['components']), lastSyncedAt: syncedAt,
  };
}

class PrismaTemplateRepository implements TemplateRepository {
  async replaceSnapshot(snapshot: ActiveWhatsAppTemplateSnapshot, templates: CachedWhatsAppTemplate[]): Promise<boolean> {
    return prisma.$transaction(async tx => {
      // Lock the identity row through the cache mutation. A reconnect/rotation
      // either wins before this check (and the sync aborts) or waits until the
      // old snapshot finishes, so stale work cannot overwrite the new identity.
      const current = await tx.$queryRaw<Array<{ brand_id: string }>>(Prisma.sql`
        SELECT "brand_id" FROM "public"."brand_whatsapp_connections"
        WHERE "brand_id" = ${snapshot.brandId}
          AND "waba_id" = ${snapshot.wabaId}
          AND "connection_version" = ${snapshot.connectionVersion}::uuid
          AND "status" = 'CONNECTED'
          AND "source" = 'EMBEDDED_SIGNUP'
        FOR UPDATE
      `);
      if (current.length !== 1) return false;
      const currentIds: string[] = [];
      for (const template of templates) {
        const data = {
          metaTemplateId: template.metaTemplateId, category: template.category,
          approvalStatus: template.approvalStatus,
          componentsJson: template.componentsJson as Prisma.InputJsonValue,
          parameterSchema: template.parameterSchema as unknown as Prisma.InputJsonValue,
          lastSyncedAt: template.lastSyncedAt,
        };
        const row = await tx.brandWhatsAppTemplate.upsert({
          where: { brandId_wabaId_templateName_languageCode: {
            brandId: snapshot.brandId, wabaId: snapshot.wabaId,
            templateName: template.templateName, languageCode: template.languageCode,
          } },
          create: {
            brandId: snapshot.brandId, wabaId: snapshot.wabaId,
            templateName: template.templateName, languageCode: template.languageCode, ...data,
          },
          update: data,
          select: { id: true },
        });
        currentIds.push(row.id);
      }
      await tx.brandWhatsAppTemplate.updateMany({
        where: {
          brandId: snapshot.brandId, wabaId: snapshot.wabaId,
          ...(currentIds.length ? { id: { notIn: currentIds } } : {}),
        },
        data: { approvalStatus: 'SYNC_REMOVED', lastSyncedAt: new Date() },
      });
      return true;
    });
  }

  async list(brandId: string, wabaId?: string): Promise<CachedWhatsAppTemplate[]> {
    return prisma.brandWhatsAppTemplate.findMany({
      where: { brandId, ...(wabaId ? { wabaId } : {}) },
      orderBy: [{ templateName: 'asc' }, { languageCode: 'asc' }],
    }) as unknown as Promise<CachedWhatsAppTemplate[]>;
  }
}

function providerFailure(status: number, body: unknown): { code: WhatsAppConnectionErrorCode; httpStatus: number; message: string } {
  const metaCode = isRecord(body) && isRecord(body['error']) && typeof body['error']['code'] === 'number'
    ? body['error']['code'] : null;
  if (status === 401 || metaCode === 190) return {
    code: 'META_AUTHENTICATION_FAILED', httpStatus: 401, message: 'WhatsApp authentication requires reconnection',
  };
  if (status === 403 || metaCode === 10 || metaCode === 200) return {
    code: 'META_PERMISSION_DENIED', httpStatus: 403, message: 'WhatsApp template permissions are unavailable',
  };
  return { code: 'META_TEMPLATE_SYNC_FAILED', httpStatus: 502, message: 'WhatsApp template synchronization failed' };
}

export function filterEligibleTemplates<T extends { brandId: string; wabaId: string; approvalStatus: string; category?: unknown; parameterSchema?: unknown }>(
  rows: T[], brandId: string, wabaId: string,
): T[] {
  return rows.filter(row => row.brandId === brandId && row.wabaId === wabaId && row.approvalStatus === 'APPROVED' &&
    typeof row.category === 'string' && row.category.length > 0 && parseParameterSchema(row.parameterSchema) !== null);
}

export class WhatsAppTemplateSyncService {
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly connections: TemplateConnection = new WhatsAppConnectionService(),
    private readonly repository: TemplateRepository = new PrismaTemplateRepository(),
  ) {}

  async sync(brandId: string): Promise<{ synced: number; skipped: number }> {
    const snapshot = await this.connections.getActiveTemplateSnapshot(brandId);
    const identity = { connectionVersion: snapshot.connectionVersion };
    const version = graphVersion();
    const expectedPath = `/${version}/${encodeURIComponent(snapshot.wabaId)}/message_templates`;
    const initial = new URL(`https://graph.facebook.com${expectedPath}`);
    initial.searchParams.set('fields', 'id,name,language,category,status,components');
    initial.searchParams.set('limit', '100');
    let next: string | null = initial.toString();
    const seen = new Set<string>();
    const templates: CachedWhatsAppTemplate[] = [];
    let skipped = 0;
    const syncedAt = new Date();

    try {
      for (let page = 0; next; page++) {
        if (page >= MAX_PAGES || seen.has(next)) {
          throw new WhatsAppTemplateSyncError('META_TEMPLATE_RESPONSE_INVALID', 502, 'WhatsApp template provider returned invalid pagination');
        }
        seen.add(next);
        const response = await this.fetchImpl(next, {
          headers: { Authorization: `Bearer ${snapshot.accessToken}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(15_000),
        });
        let body: unknown;
        try { body = await response.json(); } catch {
          throw new WhatsAppTemplateSyncError('META_TEMPLATE_RESPONSE_INVALID', 502, 'WhatsApp template provider returned an invalid response');
        }
        if (!response.ok) {
          const failure = providerFailure(response.status, body);
          if (failure.code === 'META_AUTHENTICATION_FAILED') {
            await this.connections.markNeedsReauth(brandId, identity, failure.code);
          } else {
            await this.connections.recordSafeError(brandId, identity, failure.code);
          }
          throw new WhatsAppTemplateSyncError(failure.code, failure.httpStatus, failure.message);
        }
        if (!isRecord(body) || !Array.isArray(body['data']) ||
            (body['paging'] !== undefined && !isRecord(body['paging']))) {
          throw new WhatsAppTemplateSyncError('META_TEMPLATE_RESPONSE_INVALID', 502, 'WhatsApp template provider returned an invalid response');
        }
        for (const item of body['data']) {
          const parsed = parseTemplate(item, snapshot, syncedAt);
          if (parsed) templates.push(parsed); else skipped++;
        }
        next = safeNext(isRecord(body['paging']) ? body['paging']['next'] : undefined, expectedPath);
      }
      if (!await this.repository.replaceSnapshot(snapshot, templates)) {
        throw new WhatsAppTemplateSyncError('WHATSAPP_CONNECTION_ROTATED', 409, 'WhatsApp connection changed during synchronization');
      }
      if (!await this.connections.markTemplatesSynced(brandId, identity)) {
        throw new WhatsAppTemplateSyncError('WHATSAPP_CONNECTION_ROTATED', 409, 'WhatsApp connection changed during synchronization');
      }
      return { synced: templates.length, skipped };
    } catch (error) {
      if (error instanceof WhatsAppTemplateSyncError) {
        if (!['META_AUTHENTICATION_FAILED', 'META_PERMISSION_DENIED', 'META_TEMPLATE_SYNC_FAILED', 'WHATSAPP_CONNECTION_ROTATED'].includes(error.code)) {
          await this.connections.recordSafeError(brandId, identity, 'META_TEMPLATE_SYNC_FAILED');
        }
        throw error;
      }
      await this.connections.recordSafeError(brandId, identity, 'META_TEMPLATE_SYNC_FAILED');
      throw new WhatsAppTemplateSyncError('META_TEMPLATE_SYNC_FAILED', 502, 'WhatsApp template synchronization failed');
    }
  }

  async listCurrent(brandId: string, eligibleOnly = false): Promise<CachedWhatsAppTemplate[]> {
    const snapshot = await this.connections.getActiveTemplateSnapshot(brandId);
    const rows = await this.repository.list(brandId, snapshot.wabaId);
    return eligibleOnly ? filterEligibleTemplates(rows, brandId, snapshot.wabaId) : rows;
  }
}
