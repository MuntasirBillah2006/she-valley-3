import {appLogger, type Logger} from '@/src/lib/logger';
import {generateRequestId} from '@/src/lib/errors';

export interface ServiceContext {
  requestId: string;
  actorUserId?: string;
  locale: 'en' | 'bn';
  logger: Logger;
}

export function createServiceContext(
  partial?: Partial<Omit<ServiceContext, 'logger'>> & {module?: string},
): ServiceContext {
  const requestId = partial?.requestId ?? generateRequestId();
  const locale = partial?.locale ?? 'en';
  const logger = appLogger.child({
    requestId,
    ...(partial?.module ? {module: partial.module} : {}),
  });

  return {
    requestId,
    actorUserId: partial?.actorUserId,
    locale,
    logger,
  };
}
