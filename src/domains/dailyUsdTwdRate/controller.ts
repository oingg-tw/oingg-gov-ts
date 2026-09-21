import { type Request, type Response, type NextFunction } from 'ultimate-express';
import { ingestDailyUsdTwdRate } from '@/domains/dailyUsdTwdRate/service';
import { forceIngestBodySchema } from '@/shared/openapiSchemas';

export const ingestDailyUsdTwdRateHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = forceIngestBodySchema.safeParse(req.body ?? {});
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid request body.', errors: validationResult.error.format() });
    }

    const result = await ingestDailyUsdTwdRate(validationResult.data.force);

    if (!result.success) {
      return res.status(502).json({ message: 'Failed to fetch USD/TWD exchange rate data from CBC.', error: result.error });
    }

    res.status(200).json({
      message: `Ingested USD/TWD daily rates: ${result.fetched} fetched, ${result.skipped} skipped (of ${result.totalPoints} trading days total).`,
      ...result,
    });
  } catch (error) {
    console.error('USD/TWD rate ingestion failed:', error);
    next(error);
  }
};
