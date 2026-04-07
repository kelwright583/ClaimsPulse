import type { ClassificationResult } from './classifier';

export interface RoutingAction {
  type: 'move_folder' | 'flag_urgent' | 'notify_team_leader' | 'auto_acknowledge';
  folderId?: string;
  folderName?: string;
  teamLeaderEmail?: string;
  acknowledgeTemplate?: string;
  assignedTo?: string;
}

export interface RoutingRuleInput {
  destinationFolderId?: string | null;
  destinationFolderName?: string | null;
  alwaysUrgent: boolean;
  notifyTeamLeader: boolean;
  autoAcknowledge: boolean;
  acknowledgeTemplate?: string | null;
  useRoundRobin: boolean;
  fixedAssigneeEmail?: string | null;
}

export interface MailboxStaffInput {
  email: string;
  isTeamLeader: boolean;
  isInRoundRobin: boolean;
  roundRobinOrder?: number | null;
}

export function applyRoutingRule(
  classification: ClassificationResult,
  rule: RoutingRuleInput,
  staff: MailboxStaffInput[],
  roundRobinIndex: number = 0
): RoutingAction[] {
  const actions: RoutingAction[] = [];

  // Move to folder
  if (rule.destinationFolderId) {
    actions.push({
      type: 'move_folder',
      folderId: rule.destinationFolderId,
      folderName: rule.destinationFolderName ?? undefined,
    });
  }

  // Flag urgent
  if (rule.alwaysUrgent || classification.isUrgent) {
    actions.push({ type: 'flag_urgent' });
  }

  // Notify team leader
  if (rule.notifyTeamLeader) {
    const leader = staff.find(s => s.isTeamLeader);
    if (leader) {
      actions.push({ type: 'notify_team_leader', teamLeaderEmail: leader.email });
    }
  }

  // Auto-acknowledge
  if (rule.autoAcknowledge && rule.acknowledgeTemplate) {
    // Determine assignee for template
    let assignedTo: string | undefined;
    if (rule.useRoundRobin) {
      const pool = staff
        .filter(s => s.isInRoundRobin)
        .sort((a, b) => (a.roundRobinOrder ?? 0) - (b.roundRobinOrder ?? 0));
      if (pool.length > 0) {
        assignedTo = pool[roundRobinIndex % pool.length].email;
      }
    } else if (rule.fixedAssigneeEmail) {
      assignedTo = rule.fixedAssigneeEmail;
    }

    actions.push({
      type: 'auto_acknowledge',
      acknowledgeTemplate: rule.acknowledgeTemplate,
      assignedTo,
    });
  }

  return actions;
}

export function resolveAssignee(
  rule: RoutingRuleInput,
  staff: MailboxStaffInput[],
  roundRobinIndex: number
): string | undefined {
  if (rule.useRoundRobin) {
    const pool = staff
      .filter(s => s.isInRoundRobin)
      .sort((a, b) => (a.roundRobinOrder ?? 0) - (b.roundRobinOrder ?? 0));
    if (pool.length > 0) {
      return pool[roundRobinIndex % pool.length].email;
    }
  }
  return rule.fixedAssigneeEmail ?? undefined;
}
