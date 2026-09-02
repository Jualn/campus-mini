import * as reportService from '../services/report';
import type { ReportCreateRequest } from '../types/api';

export const submitReport = (options: ReportCreateRequest): Promise<void> =>
  reportService.report(options);
