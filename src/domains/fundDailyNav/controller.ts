import { type Request, type Response, type NextFunction } from 'ultimate-express';
import { ingestFundDailyNav } from '@/domains/fundDailyNav/service';
import { forceIngestBodySchema } from '@/shared/openapiSchemas';

export const ingestFundDailyNavController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = forceIngestBodySchema.safeParse(req.body ?? {});
    if (!validationResult.success) {
      return res.status(400).json({
        message: 'Invalid request body.',
        errors: validationResult.error.format(),
      });
    }

    const result = await ingestFundDailyNav(validationResult.data.force);

    if (!result.success) {
      return res.status(502).json({
        message: 'Failed to fetch fund daily NAV data from SITCA.',
        error: result.error,
      });
    }

    res.status(200).json({
      message: `Ingested fund daily NAV data: ${result.fetched} fetched, ${result.skipped} skipped (of ${result.totalPoints} points total).`,
      ...result,
    });
  } catch (error) {
    console.error('Fund daily NAV ingestion failed:', error);
    next(error);
  }
};
