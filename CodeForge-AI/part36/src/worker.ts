import { logger } from './utils/logger';
import { env } from './config/env';
import { registerAggregationWorker } from './events/handlers';

registerAggregationWorker();
logger.info({ queueProvider: env.QUEUE_PROVIDER }, 'Cohort aggregation worker started.');
