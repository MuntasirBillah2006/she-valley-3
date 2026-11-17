export type Locale = 'en' | 'bn';

export interface ApiPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
    pagination?: ApiPaginationMeta;
  };
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: ApiErrorDetail[];
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export type CommandPhase = 'CMD-01' | 'CMD-02' | 'CMD-03' | 'CMD-04';

export interface DomainModuleDescriptor {
  id: string;
  name: string;
  responsibility: string;
  targetCommand: CommandPhase;
}
