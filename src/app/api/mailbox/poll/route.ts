import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { prisma } from '@/lib/prisma';
import { graphClient } from '@/lib/mailbox/graph-client';
import { classifyEmail } from '@/lib/mailbox/classifier';
import { applyRoutingRule, resolveAssignee } from '@/lib/mailbox/router';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    // Auth: either CRON_SECRET header or valid session
    const authHeader = request.headers.get('Authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      // Cron auth OK
    } else {
      const ctx = await getSessionContext();
      if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all active, configured mailboxes
    const mailboxes = await prisma.mailboxConfig.findMany({
      where: { active: true, isConfigured: true },
      include: {
        categories: true,
        staff: { where: { active: true } },
        rules: { where: { active: true } },
      },
    });

    const results: Array<{ mailboxId: string; processed: number; errors: string[] }> = [];
    let totalProcessed = 0;

    for (const mailbox of mailboxes) {
      const errors: string[] = [];
      let processedCount = 0;

      // Get existing email IDs to avoid re-processing
      const existingIds = new Set(
        (await prisma.emailRecord.findMany({
          where: { mailboxId: mailbox.id },
          select: { graphEmailId: true },
        })).map(r => r.graphEmailId)
      );

      // Build round robin counter from recent records
      const recentCount = await prisma.emailRecord.count({ where: { mailboxId: mailbox.id } });

      try {
        const emails = await graphClient.getUnreadEmails(mailbox.mailboxAddress);

        for (const email of emails) {
          if (existingIds.has(email.id)) continue;

          try {
            // Classify
            const classification = await classifyEmail({
              subject: email.subject,
              body: email.body,
              from: email.from,
              categories: mailbox.categories,
              urgentKeywords: mailbox.urgentKeywords,
              classificationInstructions: mailbox.classificationInstructions,
            });

            // Find matching rule
            const rule = mailbox.rules.find(r => r.categoryName === classification.categoryName);

            // Compute TAT deadline
            const tatMinutes = rule?.tatMinutes ?? 1440;
            const tatDeadline = new Date(email.receivedAt.getTime() + tatMinutes * 60 * 1000);

            // Resolve assignee
            const assignedTo = rule
              ? resolveAssignee(
                  {
                    useRoundRobin: rule.useRoundRobin,
                    fixedAssigneeEmail: rule.fixedAssigneeEmail,
                    destinationFolderId: rule.destinationFolderId,
                    destinationFolderName: rule.destinationFolderName,
                    alwaysUrgent: rule.alwaysUrgent,
                    notifyTeamLeader: rule.notifyTeamLeader,
                    autoAcknowledge: rule.autoAcknowledge,
                    acknowledgeTemplate: rule.acknowledgeTemplate,
                  },
                  mailbox.staff,
                  recentCount + processedCount
                )
              : undefined;

            // Save EmailRecord
            await prisma.emailRecord.create({
              data: {
                mailboxId: mailbox.id,
                graphEmailId: email.id,
                subject: email.subject,
                categoryName: classification.categoryName,
                senderType: classification.senderType,
                urgent: classification.isUrgent || (rule?.alwaysUrgent ?? false),
                confidence: classification.confidence,
                receivedAt: email.receivedAt,
                tatDeadline,
                respondedTo: false,
                assignedToEmail: assignedTo ?? null,
              },
            });

            // Determine actions taken
            const actions = rule
              ? applyRoutingRule(classification, {
                  destinationFolderId: rule.destinationFolderId,
                  destinationFolderName: rule.destinationFolderName,
                  alwaysUrgent: rule.alwaysUrgent,
                  notifyTeamLeader: rule.notifyTeamLeader,
                  autoAcknowledge: rule.autoAcknowledge,
                  acknowledgeTemplate: rule.acknowledgeTemplate,
                  useRoundRobin: rule.useRoundRobin,
                  fixedAssigneeEmail: rule.fixedAssigneeEmail,
                }, mailbox.staff, recentCount + processedCount)
              : [];

            const actionNames = actions.map(a => a.type).join(', ');

            // Execute Graph actions
            for (const action of actions) {
              if (action.type === 'move_folder' && action.folderId) {
                await graphClient.moveEmailToFolder(mailbox.mailboxAddress, email.id, action.folderId);
              } else if (action.type === 'flag_urgent') {
                await graphClient.flagAsUrgent(mailbox.mailboxAddress, email.id);
              } else if (action.type === 'auto_acknowledge' && action.acknowledgeTemplate) {
                const body = action.acknowledgeTemplate
                  .replace('{sender_name}', email.from)
                  .replace('{subject}', email.subject)
                  .replace('{assigned_to}', assignedTo ?? 'a team member')
                  .replace('{date_received}', email.receivedAt.toLocaleDateString('en-ZA'));
                await graphClient.sendReply(mailbox.mailboxAddress, email.id, body);
              }
            }

            // Mark as read
            await graphClient.markAsRead(mailbox.mailboxAddress, email.id);

            // Save audit log
            await prisma.mailboxAuditLog.create({
              data: {
                mailboxId: mailbox.id,
                graphEmailId: email.id,
                subject: email.subject,
                categoryName: classification.categoryName,
                urgent: classification.isUrgent || (rule?.alwaysUrgent ?? false),
                senderType: classification.senderType,
                confidence: classification.confidence,
                reasoning: classification.reasoning,
                actionTaken: actionNames || null,
                assignedTo: assignedTo ?? null,
                claimId: null,
              },
            });

            processedCount++;
          } catch (emailErr) {
            errors.push(`Email ${email.id}: ${emailErr instanceof Error ? emailErr.message : String(emailErr)}`);
          }
        }
      } catch (mailboxErr) {
        errors.push(`Mailbox error: ${mailboxErr instanceof Error ? mailboxErr.message : String(mailboxErr)}`);
      }

      totalProcessed += processedCount;
      results.push({ mailboxId: mailbox.id, processed: processedCount, errors });
    }

    return Response.json({ processed: totalProcessed, results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
