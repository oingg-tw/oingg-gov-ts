import { type Request, type Response, type NextFunction } from 'ultimate-express';
import { ingestMonthlyFiveMajorBankRate } from '@/domains/monthlyFiveMajorBankRate/service';
import { forceIngestBodySchema } from '@/shared/openapiSchemas';

export const ingestFiveMajorBankRate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = forceIngestBodySchema.safeParse(req.body ?? {});
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid request body.', errors: validationResult.error.format() });
    }

    const result = await ingestMonthlyFiveMajorBankRate(validationResult.data.force);

    if (!result.success) {
      return res.status(502).json({ message: 'Failed to fetch five-major-bank deposit and base lending rates from CBC.', error: result.error });
    }

    res.status(200).json({
      message: `Ingested five-major-bank rates: ${result.fetched} fetched, ${result.skipped} skipped (of ${result.totalPoints} months total).`,
      ...result,
    });
  } catch (error) {
    console.error('Five major bank rate ingestion failed:', error);
    next(error);
  }
};
