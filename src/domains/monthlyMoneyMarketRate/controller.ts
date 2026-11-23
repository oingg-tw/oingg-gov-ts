import { type Request, type Response, type NextFunction } from 'ultimate-express';
import { ingestMonthlyMoneyMarketRate } from '@/domains/monthlyMoneyMarketRate/service';
import { forceIngestBodySchema } from '@/shared/openapiSchemas';

export const ingestMonthlyMoneyMarketRateController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = forceIngestBodySchema.safeParse(req.body ?? {});
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid request body.', errors: validationResult.error.format() });
    }

    const result = await ingestMonthlyMoneyMarketRate(validationResult.data.force);
    if (!result.success) {
      return res.status(502).json({ message: 'Failed to fetch money market interest rates from CBC.', error: result.error });
    }

    res.status(200).json({
      message: `Ingested money market interest rates: ${result.fetched} fetched, ${result.skipped} skipped (of ${result.totalPoints} rows total).`,
      ...result,
    });
  } catch (error) {
    console.error('Money market rate ingestion failed:', error);
    next(error);
  }
};
