import { type Request, type Response, type NextFunction } from 'ultimate-express';
import { ingestCbcPolicyRate } from '@/domains/cbcPolicyRate/service';
import { forceIngestBodySchema } from '@/shared/openapiSchemas';

export const ingestCbcPolicyRateHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = forceIngestBodySchema.safeParse(req.body ?? {});
    if (!validationResult.success) {
      return res.status(400).json({
        message: 'Invalid request body.',
        errors: validationResult.error.format(),
      });
    }

    const result = await ingestCbcPolicyRate(validationResult.data.force);

    if (!result.success) {
      return res.status(502).json({
        message: 'Failed to fetch central bank policy rate data from CBC.',
        error: result.error,
      });
    }

    res.status(200).json({
      message: `Ingested CBC policy rate changes: ${result.fetched} fetched, ${result.skipped} skipped (of ${result.totalPoints} rate-change events total).`,
      ...result,
    });
  } catch (error) {
    console.error('CBC policy rate ingestion failed:', error);
    next(error);
  }
};
