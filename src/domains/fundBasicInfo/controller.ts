import { type Request, type Response, type NextFunction } from 'ultimate-express';
import { ingestFundBasicInfo } from '@/domains/fundBasicInfo/service';
import { forceIngestBodySchema } from '@/shared/openapiSchemas';

export const ingestFundBasicInfoController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = forceIngestBodySchema.safeParse(req.body ?? {});
    if (!validationResult.success) {
      return res.status(400).json({
        message: 'Invalid request body.',
        errors: validationResult.error.format(),
      });
    }

    const result = await ingestFundBasicInfo(validationResult.data.force);

    if (!result.success) {
      return res.status(502).json({
        message: 'Failed to fetch fund basic info data from SITCA.',
        error: result.error,
      });
    }

    res.status(200).json({
      message: `Ingested fund basic info data: ${result.fetched} fetched, ${result.skipped} skipped (of ${result.totalPoints} points total).`,
      ...result,
    });
  } catch (error) {
    console.error('Fund basic info ingestion failed:', error);
    next(error);
  }
};
