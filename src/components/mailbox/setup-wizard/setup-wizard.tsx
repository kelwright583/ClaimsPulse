'use client';

import { useState } from 'react';
import { Step1Mailbox } from './step-1-mailbox';
import { Step2Categories } from './step-2-categories';
import { Step3Folders } from './step-3-folders';
import { Step4Staff } from './step-4-staff';
import { Step5RoundRobin } from './step-5-round-robin';
import { Step6Rules } from './step-6-rules';
import { Step7Templates } from './step-7-templates';
import { Step8Keywords } from './step-8-keywords';
import { Step9Activate } from './step-9-activate';

const STEPS = [
  'Mailbox',
  'Categories',
  'Folders',
  'Staff',
  'Round Robin',
  'Rules',
  'Templates',
  'Keywords',
  'Activate',
];

export function SetupWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [mailboxId, setMailboxId] = useState<string | null>(null);

  function handleNext() {
    setCurrentStep(s => Math.min(STEPS.length - 1, s + 1));
  }

  function handleBack() {
    setCurrentStep(s => Math.max(0, s - 1));
  }

  const sharedProps = {
    mailboxId,
    onNext: handleNext,
    onBack: handleBack,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0D2761]">Mailbox Setup</h1>
        <p className="text-sm text-[#6B7280]">Configure your mailbox triage system in {STEPS.length} steps</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-0 overflow-x-auto pb-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center flex-shrink-0">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  i < currentStep
                    ? 'bg-green-500 text-white'
                    : i === currentStep
                    ? 'bg-[#1E5BC6] text-white'
                    : 'bg-[#E8EEF8] text-[#6B7280]'
                }`}
              >
                {i < currentStep ? '✓' : i + 1}
              </div>
              <span className={`text-[10px] font-medium whitespace-nowrap ${i === currentStep ? 'text-[#0D2761]' : 'text-[#6B7280]'}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-8 mx-1 flex-shrink-0 mt-[-14px] ${i < currentStep ? 'bg-green-500' : 'bg-[#E8EEF8]'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="bg-white border border-[#E8EEF8] rounded-xl p-6">
        {currentStep === 0 && (
          <Step1Mailbox
            mailboxId={mailboxId}
            onMailboxCreated={setMailboxId}
            onNext={handleNext}
            onBack={handleBack}
          />
        )}
        {currentStep === 1 && <Step2Categories {...sharedProps} mailboxId={mailboxId!} />}
        {currentStep === 2 && <Step3Folders {...sharedProps} mailboxId={mailboxId!} />}
        {currentStep === 3 && <Step4Staff {...sharedProps} mailboxId={mailboxId!} />}
        {currentStep === 4 && <Step5RoundRobin {...sharedProps} mailboxId={mailboxId!} />}
        {currentStep === 5 && <Step6Rules {...sharedProps} mailboxId={mailboxId!} />}
        {currentStep === 6 && <Step7Templates {...sharedProps} mailboxId={mailboxId!} />}
        {currentStep === 7 && <Step8Keywords {...sharedProps} mailboxId={mailboxId!} />}
        {currentStep === 8 && <Step9Activate {...sharedProps} mailboxId={mailboxId!} />}
      </div>
    </div>
  );
}
