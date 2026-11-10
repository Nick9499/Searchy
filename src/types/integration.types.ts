export interface OAuthErrorResponse {
  response?: {
    data?: {
      error?: string;
      error_description?: string;
    };
  };
  message?: string;
}
