import { type Request, type Response, type NextFunction } from 'ultimate-express';
import { ingestQuarterlyGdpExpenditure } from '@/domains/quarterlyGdpExpenditure/service';
import { forceIngestBodySchema } from '@/shared/openapiSchemas';

export const ingestQuarterlyGdpExpenditureController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = forceIngestBodySchema.safeParse(req.body ?? {});
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid request body.', errors: validationResult.error.format() });
    }

    const result = await ingestQuarterlyGdpExpenditure(validationResult.data.force);
    if (!result.success) {
      return res.status(502).json({ message: 'Failed to fetch GDP by expenditure from DGBAS.', error: result.error });
    }

    res.status(200).json({
      message: `Ingested GDP by expenditure: ${result.fetched} fetched, ${result.skipped} skipped (of ${result.totalPoints} rows total).`,
      ...result,
    });
  } catch (error) {
    console.error('GDP by expenditure ingestion failed:', error);
    next(error);
  }
};
