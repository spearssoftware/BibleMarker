import { describe, it, expect } from 'vitest';
import { CloudflareEmailSender } from './email';

type SendMessage = Parameters<SendEmail['send']>[0];

describe('CloudflareEmailSender', () => {
  it('sends the code from the configured address', async () => {
    const calls: SendMessage[] = [];
    const binding = {
      send: async (message: SendMessage) => {
        calls.push(message);
        return {} as EmailSendResult;
      },
    } as unknown as SendEmail;

    await new CloudflareEmailSender(binding, 'noreply@biblemarker.app').sendOtp(
      'user@example.com',
      '123456'
    );

    expect(calls).toHaveLength(1);
    const message = calls[0] as { from: { email: string }; to: string; text: string };
    expect(message.from.email).toBe('noreply@biblemarker.app');
    expect(message.to).toBe('user@example.com');
    expect(message.text).toContain('123456');
  });

  it('rethrows binding failures with the E_* code attached', async () => {
    const binding = {
      send: async () => {
        throw Object.assign(new Error('recipient suppressed'), {
          code: 'E_RECIPIENT_SUPPRESSED',
        });
      },
    } as unknown as SendEmail;

    await expect(
      new CloudflareEmailSender(binding, 'noreply@biblemarker.app').sendOtp('a@b.com', '000000')
    ).rejects.toThrow('E_RECIPIENT_SUPPRESSED');
  });
});
