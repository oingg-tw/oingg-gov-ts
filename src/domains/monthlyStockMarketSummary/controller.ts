import { type Request, type Response, type NextFunction } from 'ultimate-express';
import { ingestMonthlyStockMarketSummary } from '@/domains/monthlyStockMarketSummary/service';
import { forceIngestBodySchema } from '@/shared/openapiSchemas';

export const ingestMonthlyStockMarketSummaryHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = forceIngestBodySchema.safeParse(req.body ?? {});
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid request body.', errors: validationResult.error.format() });
    }

    const result = await ingestMonthlyStockMarketSummary(validationResult.data.force);

    if (!result.success) {
      return res.status(502).json({ message: 'Failed to fetch stock market summary data from CBC.', error: result.error });
    }

    res.status(200).json({
      message: `Ingested monthly stock market summary: ${result.fetched} fetched, ${result.skipped} skipped (of ${result.totalPoints} months total).`,
      ...result,
    });
  } catch (error) {
    console.error('Stock market summary ingestion failed:', error);
    next(error);
  }
};
