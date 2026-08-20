/**
 * Transactional email for sign-in codes.
 *
 * The send is behind an `EmailSender` interface so the provider is swappable and
 * unit tests use a fake. `CloudflareEmailSender` is the production adapter — it
 * uses the `send_email` Worker binding (Cloudflare Email Sending), so there is no
 * API token to rotate and `biblemarker.app` is the onboarded sending domain.
 */

export interface EmailSender {
  sendOtp(to: string, code: string): Promise<void>;
}

export class CloudflareEmailSender implements EmailSender {
  constructor(
    private readonly binding: SendEmail,
    private readonly from: string
  ) {}

  async sendOtp(to: string, code: string): Promise<void> {
    try {
      await this.binding.send({
        from: { name: 'BibleMarker', email: this.from },
        to,
        subject: 'Your BibleMarker sign-in code',
        text:
          `Your BibleMarker verification code is ${code}\n\n` +
          `It expires in 10 minutes. If you didn't request it, you can ignore this email.`,
      });
    } catch (err) {
      // The binding throws with an `E_*` code (e.g. E_RATE_LIMIT_EXCEEDED,
      // E_RECIPIENT_SUPPRESSED). Surface it so the Worker logs say why.
      const code = (err as { code?: string }).code ?? 'unknown';
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Email send failed (${code}): ${message.slice(0, 200)}`);
    }
  }
}
