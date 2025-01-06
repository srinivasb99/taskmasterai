export interface CheckoutSessionRequest {
  priceId: string;
  userId: string;
}

export interface CheckoutSessionResponse {
  sessionId: string;
}

export interface StripeError {
  error: string;
}
