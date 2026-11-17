import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { HubApiClient } from '../../api/client';
import { useMembers, useSession } from '../../features/identity/hooks';
import { useGroups } from '../../features/pm/hooks';
import { useI18n } from '../../i18n';
import { GroupLeadConfirm } from '../settings/GroupLeadConfirm';
import { WhoStep } from './WhoStep';
import { RosterStep } from './RosterStep';

type Step = 'who' | 'roster' | 'leads';
const ORDER: readonly Step[] = ['who', 'roster', 'leads'];
export function BootstrapGate({ client, onDone }: { client: HubApiClient; onDone: () => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('who');
  const sessionQuery = useSession(client);
  const loggedIn = Boolean(sessionQuery.data?.session);
  const membersQuery = useMembers(client, 'bootstrap-gate', loggedIn);
  const groupsQuery = useGroups(client, 'bootstrap-gate', loggedIn);
  const members = useMemo(() => membersQuery.data?.members ?? [], [membersQuery.data]);
  const groups = useMemo(() => groupsQuery.data?.groups ?? [], [groupsQuery.data]);
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['session'] });
    void queryClient.invalidateQueries({ queryKey: ['members'] });
    void queryClient.invalidateQueries({ queryKey: ['groups'] });
  };
  const next = (nextStep: Step) => setStep(nextStep);
  return <div className="setup-wizard setup-wizard--center"><div className="setup-wizard__inner setup-wizard__inner--qa">
    <header className="setup-wizard__head"><p className="eyebrow">{t('toolbar.eyebrow')}</p>
      <h1 className="setup-wizard__title">{t('gate.title')}</h1><p className="setup-wizard__subtitle">{t('gate.subtitle')}</p>
      <p>{t('gate.progress', { n: ORDER.indexOf(step) + 1, total: ORDER.length, name: t(`gate.step.${step}`) })}</p>
    </header>
    <div className="setup-qa"><div className="setup-qa__main">
      {step === 'who' ? <WhoStep client={client} members={members} groups={groups} onDone={() => { invalidate(); next('roster'); }} /> : null}
      {step === 'roster' ? <RosterStep client={client} groups={groups} onNext={() => next('leads')} /> : null}
      {step === 'leads' ? <section className="setup-card setup-card--primary"><h2 className="setup-card__title">{t('gate.step.leads')}</h2>
        <GroupLeadConfirm client={client} members={members} groups={groups} onConfirmed={onDone} />
        <button type="button" className="btn btn--secondary" onClick={onDone}>{t('gate.leads.skip')}</button>
      </section> : null}
      {step !== 'who' ? <div className="setup-wizard__nav"><button type="button" className="btn btn--secondary" onClick={() => setStep(ORDER[ORDER.indexOf(step) - 1])}>{t('gate.back')}</button></div> : null}
    </div></div>
  </div></div>;
}
