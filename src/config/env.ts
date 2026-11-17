import {z} from 'zod';

export type AppEnvironment = 'development' | 'test' | 'production';

export const clientEnvSchema = z.object({
  VITE_APP_NAME: z.string().trim().min(1).default('SHE-VALLEY'),
  VITE_DEFAULT_LOCALE: z.enum(['en', 'bn']).default('en'),
  VITE_SUPPORTED_LOCALES: z.string().trim().default('en,bn'),
  VITE_CURRENCY: z.literal('BDT').default('BDT'),
});

export const serverEnvSchema = clientEnvSchema.extend({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().trim().optional(),
  SQL_HOST: z.string().trim().optional(),
  SQL_DB_NAME: z.string().trim().optional(),
  SQL_USER: z.string().trim().optional(),
  SQL_PASSWORD: z.string().trim().optional(),
  SQL_ADMIN_USER: z.string().trim().optional(),
  SQL_ADMIN_PASSWORD: z.string().trim().optional(),
  AUTH_SECRET: z.string().trim().min(16).optional(),
  GEMINI_API_KEY: z.string().trim().optional(),
  PAYMENT_WEBHOOK_SECRET: z.string().trim().optional(),
  BKASH_APP_KEY: z.string().trim().optional(),
  BKASH_APP_SECRET: z.string().trim().optional(),
  NAGAD_MERCHANT_ID: z.string().trim().optional(),
  SSLCOMMERZ_STORE_ID: z.string().trim().optional(),
  SSLCOMMERZ_STORE_PASSWD: z.string().trim().optional(),
  COURIER_WEBHOOK_SECRET: z.string().trim().optional(),
  PATHAO_CLIENT_ID: z.string().trim().optional(),
  STEADFAST_API_KEY: z.string().trim().optional(),
  REDX_API_TOKEN: z.string().trim().optional(),
  META_APP_SECRET: z.string().trim().optional(),
  META_VERIFY_TOKEN: z.string().trim().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().trim().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().trim().optional(),
  META_CAPI_ACCESS_TOKEN: z.string().trim().optional(),
  META_PIXEL_ID: z.string().trim().optional(),
  N8N_WEBHOOK_URL: z.string().trim().optional(),
  N8N_WEBHOOK_SECRET: z.string().trim().optional(),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export interface EnvironmentProfile {
  env: AppEnvironment;
  isDevelopment: boolean;
  isTest: boolean;
  isProduction: boolean;
  enableDiagnostics: boolean;
  strictSecretValidation: boolean;
  logLevel: 'debug' | 'info' | 'warn';
}

export function getEnvironmentProfile(nodeEnv: AppEnvironment = 'development'): EnvironmentProfile {
  switch (nodeEnv) {
    case 'production':
      return {
        env: 'production',
        isDevelopment: false,
        isTest: false,
        isProduction: true,
        enableDiagnostics: false,
        strictSecretValidation: true,
        logLevel: 'warn',
      };
    case 'test':
      return {
        env: 'test',
        isDevelopment: false,
        isTest: true,
        isProduction: false,
        enableDiagnostics: false,
        strictSecretValidation: false,
        logLevel: 'warn',
      };
    case 'development':
    default:
      return {
        env: 'development',
        isDevelopment: true,
        isTest: false,
        isProduction: false,
        enableDiagnostics: true,
        strictSecretValidation: false,
        logLevel: 'debug',
      };
  }
}

export function parseClientEnv(raw: Record<string, unknown>): ClientEnv {
  const result = clientEnvSchema.safeParse(raw);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid client environment configuration: ${formatted}`);
  }
  return result.data;
}

export function parseServerEnv(raw: Record<string, unknown>): ServerEnv {
  const result = serverEnvSchema.safeParse(raw);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid server environment configuration: ${formatted}`);
  }
  return result.data;
}

function readRuntimeClientRawEnv(): Record<string, unknown> {
  const metaEnv = (import.meta as ImportMeta & {env?: Record<string, unknown>}).env;
  if (metaEnv) {
    return {
      VITE_APP_NAME: metaEnv.VITE_APP_NAME,
      VITE_DEFAULT_LOCALE: metaEnv.VITE_DEFAULT_LOCALE,
      VITE_SUPPORTED_LOCALES: metaEnv.VITE_SUPPORTED_LOCALES,
      VITE_CURRENCY: metaEnv.VITE_CURRENCY,
    };
  }
  return {};
}

export const clientEnv: ClientEnv = parseClientEnv(readRuntimeClientRawEnv());
