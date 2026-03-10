export function shouldDisconnectForBackpressure(
  bufferedAmount: number,
  maxBufferedAmountBytes: number
): boolean {
  if (!Number.isFinite(maxBufferedAmountBytes) || maxBufferedAmountBytes < 0) {
    return false;
  }
  return bufferedAmount > maxBufferedAmountBytes;
}
