-- Make checkout order creation safe to retry.
--
-- A browser, proxy, or user double-click can repeat POST /billing/create-order.
-- Keep the client-generated key with the local payment reservation so the
-- repeated request returns the original Razorpay order instead of creating a
-- second order.

ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_user_idempotency_key
    ON payments (user_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- A provider payment belongs to exactly one provider order. Enforce the same
-- invariant locally so concurrent callback/webhook processing cannot attach a
-- captured payment to multiple purchases.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_razorpay_payment_id
    ON payments (razorpay_payment_id)
    WHERE razorpay_payment_id IS NOT NULL;
