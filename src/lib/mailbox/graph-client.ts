export interface GraphEmail {
  id: string;
  subject: string;
  from: string;
  body: string;
  receivedAt: Date;
  isRead: boolean;
}

const STUB_EMAILS: GraphEmail[] = [
  {
    id: 'stub-001',
    subject: 'Urgent: Third Party Claim — Vehicle Collision on N1',
    from: 'attorney@legalfirm.co.za',
    body: 'Dear Claims Team,\n\nWe represent the third party involved in the collision on the N1 on 14 March 2026. Our client sustained significant vehicle damage and personal injury. We require an urgent response regarding claim C-2026-04512.\n\nPlease treat this matter with urgency.\n\nKind regards,\nAdv. J. Nkosi',
    receivedAt: new Date(Date.now() - 1000 * 60 * 30),
    isRead: false,
  },
  {
    id: 'stub-002',
    subject: 'RE: Claim C-2026-03891 — Salvage Vehicle Query',
    from: 'salvage@autoauctions.co.za',
    body: 'Hi,\n\nFollowing up on the salvage vehicle for claim C-2026-03891. The vehicle has been assessed and we can offer R 28,500 for the write-off. Please confirm if we should proceed with the sale.\n\nRegards,\nPieter van Wyk\nAuto Auctions SA',
    receivedAt: new Date(Date.now() - 1000 * 60 * 90),
    isRead: false,
  },
  {
    id: 'stub-003',
    subject: 'New Claim Notification — Fire Damage, Commercial Property',
    from: 'broker@sunbirdinsurance.co.za',
    body: 'Good morning,\n\nPlease be advised that our client, ABC Trading (Pty) Ltd, has experienced a fire at their warehouse premises in Johannesburg. Estimated damage is R 1.2 million. Policy number: SEB-CP-20245512.\n\nPlease register this claim urgently.\n\nThank you,\nSamantha Dlamini\nSunbird Insurance Brokers',
    receivedAt: new Date(Date.now() - 1000 * 60 * 150),
    isRead: false,
  },
  {
    id: 'stub-004',
    subject: 'Acknowledgement Request — Claim C-2026-04100 Documents Submitted',
    from: 'insured@smallbiz.co.za',
    body: 'Hi,\n\nI submitted all required documents for my claim last week (C-2026-04100) and have not received acknowledgement. Could you please confirm receipt and advise on next steps?\n\nMany thanks,\nFatima Moosa',
    receivedAt: new Date(Date.now() - 1000 * 60 * 240),
    isRead: false,
  },
];

export class GraphClient {
  private readonly stub: boolean;

  constructor() {
    this.stub = !process.env.AZURE_CLIENT_ID;
  }

  isStubMode(): boolean {
    return this.stub;
  }

  private async getAccessToken(): Promise<string> {
    if (this.stub) return 'stub-token';

    const tenantId = process.env.AZURE_TENANT_ID!;
    const clientId = process.env.AZURE_CLIENT_ID!;
    const clientSecret = process.env.AZURE_CLIENT_SECRET!;

    const resp = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'https://graph.microsoft.com/.default',
        }),
      }
    );

    if (!resp.ok) {
      throw new Error(`Failed to get Graph token: ${resp.statusText}`);
    }

    const data = await resp.json() as { access_token: string };
    return data.access_token;
  }

  async getUnreadEmails(mailboxAddress: string): Promise<GraphEmail[]> {
    if (this.stub) return STUB_EMAILS;

    const token = await this.getAccessToken();
    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxAddress)}/mailFolders/inbox/messages?$filter=isRead eq false&$select=id,subject,from,body,receivedDateTime,isRead&$top=50`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!resp.ok) throw new Error(`Graph getUnreadEmails failed: ${resp.statusText}`);

    const data = await resp.json() as { value: Array<{
      id: string;
      subject: string;
      from: { emailAddress: { address: string } };
      body: { content: string };
      receivedDateTime: string;
      isRead: boolean;
    }> };

    return data.value.map(m => ({
      id: m.id,
      subject: m.subject ?? '(no subject)',
      from: m.from?.emailAddress?.address ?? '',
      body: m.body?.content ?? '',
      receivedAt: new Date(m.receivedDateTime),
      isRead: m.isRead,
    }));
  }

  async moveEmailToFolder(mailboxAddress: string, emailId: string, folderId: string): Promise<void> {
    if (this.stub) return;

    const token = await this.getAccessToken();
    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxAddress)}/messages/${emailId}/move`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinationId: folderId }),
      }
    );

    if (!resp.ok) throw new Error(`Graph moveEmailToFolder failed: ${resp.statusText}`);
  }

  async markAsRead(mailboxAddress: string, emailId: string): Promise<void> {
    if (this.stub) return;

    const token = await this.getAccessToken();
    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxAddress)}/messages/${emailId}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead: true }),
      }
    );

    if (!resp.ok) throw new Error(`Graph markAsRead failed: ${resp.statusText}`);
  }

  async flagAsUrgent(mailboxAddress: string, emailId: string): Promise<void> {
    if (this.stub) return;

    const token = await this.getAccessToken();
    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxAddress)}/messages/${emailId}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ importance: 'high', flag: { flagStatus: 'flagged' } }),
      }
    );

    if (!resp.ok) throw new Error(`Graph flagAsUrgent failed: ${resp.statusText}`);
  }

  async sendReply(mailboxAddress: string, emailId: string, replyBody: string): Promise<void> {
    if (this.stub) return;

    const token = await this.getAccessToken();
    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxAddress)}/messages/${emailId}/reply`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {},
          comment: replyBody,
        }),
      }
    );

    if (!resp.ok) throw new Error(`Graph sendReply failed: ${resp.statusText}`);
  }

  async sendEmail(mailboxAddress: string, to: string, subject: string, body: string): Promise<void> {
    if (this.stub) return;

    const token = await this.getAccessToken();
    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxAddress)}/sendMail`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            subject,
            body: { contentType: 'Text', content: body },
            toRecipients: [{ emailAddress: { address: to } }],
          },
        }),
      }
    );

    if (!resp.ok) throw new Error(`Graph sendEmail failed: ${resp.statusText}`);
  }

  async createFolder(mailboxAddress: string, folderName: string, parentFolderId?: string): Promise<string> {
    if (this.stub) return `stub-folder-${folderName.toLowerCase().replace(/\s+/g, '-')}`;

    const token = await this.getAccessToken();
    const parentPath = parentFolderId
      ? `/mailFolders/${parentFolderId}/childFolders`
      : '/mailFolders';

    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxAddress)}${parentPath}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: folderName }),
      }
    );

    if (!resp.ok) throw new Error(`Graph createFolder failed: ${resp.statusText}`);
    const data = await resp.json() as { id: string };
    return data.id;
  }
}

export const graphClient = new GraphClient();
