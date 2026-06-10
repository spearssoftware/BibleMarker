/**
 * Transactional email for sign-in codes.
 *
 * The send is behind an `EmailSender` interface so the provider is swappable and
 * unit tests use a fake. `PostmarkSender` is the production adapter — BibleMarker
 * shares Postmark with spearssoftware.com (already a verified sending domain).
 */

export interface EmailSender {
  sendOtp(to: string, code: string): Promise<void>;
}

export class PostmarkSender implements EmailSender {
  constructor(
    private readonly token: string,
    private readonly from: string
  ) {}

  async sendOtp(to: string, code: string): Promise<void> {
    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Postmark-Server-Token': this.token,
      },
      body: JSON.stringify({
        From: this.from,
        To: to,
        Subject: 'Your BibleMarker sign-in code',
        TextBody:
          `Your BibleMarker verification code is ${code}\n\n` +
          `It expires in 10 minutes. If you didn't request it, you can ignore this email.`,
        MessageStream: 'outbound',
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Postmark send failed (${res.status}): ${detail.slice(0, 200)}`);
    }
  }
}
