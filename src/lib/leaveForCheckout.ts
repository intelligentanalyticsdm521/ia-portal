// lib/leaveForCheckout.ts — the one place a billing control sends the browser
// to a payment page that is not ours (the checkout Re-subscribe opens).
// Its own module so a rendered test can see WHERE the click went.
export function leaveForCheckout(url: string): void {
  window.location.assign(url);
}
