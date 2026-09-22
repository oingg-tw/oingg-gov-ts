import { type Request, type Response, type NextFunction } from 'ultimate-express';
import { ingestQuarterlyUsGnpDeflator } from '@/domains/quarterlyUsGnpDeflator/service';

export const ingestQuarterlyUsGnpDeflatorHandler = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ingestQuarterlyUsGnpDeflator();

    if (!result.success) {
      return res.status(502).json({ message: 'Failed to fetch GNP deflator data from FRED.', error: result.error });
    }

    res.status(200).json({ message: `Rebuilt US GNP deflator series: ${result.totalPoints} quarters.`, ...result });
  } catch (error) {
    console.error('US GNP deflator ingestion failed:', error);
    next(error);
  }
};
