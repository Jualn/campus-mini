import { reportService } from '../services/index';
import type { ReportCreateRequest } from '../types/api';

export const submitReport = (options: ReportCreateRequest): Promise<void> =>
  reportService.report(options);
