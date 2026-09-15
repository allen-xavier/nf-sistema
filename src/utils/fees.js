const MINIMUM_FEE_VALUE = 11;
const SMALL_FEE_THRESHOLD = 50;
const SMALL_FEE_SURCHARGE = 1;

function calculateInvoiceFee(totalAmount, feePercent) {
  const calculated = (Number(totalAmount) * Number(feePercent)) / 100;
  const withMinimum = Math.max(calculated, MINIMUM_FEE_VALUE);
  const withSurcharge = calculated < SMALL_FEE_THRESHOLD
    ? withMinimum + SMALL_FEE_SURCHARGE
    : withMinimum;

  return Number(withSurcharge.toFixed(2));
}

module.exports = {
  calculateInvoiceFee,
  MINIMUM_FEE_VALUE,
  SMALL_FEE_THRESHOLD,
  SMALL_FEE_SURCHARGE,
};
