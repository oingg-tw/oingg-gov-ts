import { type Request, type Response, type NextFunction } from 'ultimate-express';
import { ingestMonthlyMonetaryAggregate } from '@/domains/monthlyMonetaryAggregate/service';
import { forceIngestBodySchema } from '@/shared/openapiSchemas';

export const ingestMonthlyMonetaryAggregateHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = forceIngestBodySchema.safeParse(req.body ?? {});
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid request body.', errors: validationResult.error.format() });
    }

    const result = await ingestMonthlyMonetaryAggregate(validationResult.data.force);

    if (!result.success) {
      return res.status(502).json({ message: 'Failed to fetch monetary aggregate data from CBC.', error: result.error });
    }

    res.status(200).json({
      message: `Ingested monetary aggregates (M1A/M1B/M2): ${result.fetched} fetched, ${result.skipped} skipped (of ${result.totalPoints} months total).`,
      ...result,
    });
  } catch (error) {
    console.error('Monetary aggregate ingestion failed:', error);
    next(error);
  }
};
