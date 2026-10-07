import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { QrCode } from '@/components/shared/qr-code';
import { useToast } from '@/components/ui/toast';
import type { HouseholdMemberRow } from '@/types';
import {
  createGiftListInviteCode,
  fetchGiftListInviteSummary,
  giftInviteLink,
  revokeGiftListInviteCode,
  sendGiftListInviteEmail,
  type GiftListInviteSummary,
} from '../api';
import { GIFT_HOST_MESSAGE_MAX } from '../email-template';
import { permissionLabel, type GiftList, type GiftShare, type GiftShareInput } from '../types';

const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const schema = z.object({
  members: z.array(z.string()),
  permissions: z.record(z.string(), z.enum(['lecture', 'reservation'])),
  email: z.string().trim().refine((value) => value === '' || emailPattern.test(value), 'Indiquez un email valide.'),
});

type FormValues = z.infer<typeof schema>;

export interface GiftShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  list: GiftList | null;
  members: HouseholdMemberRow[];
  existingShares: GiftShare[];
  onSubmit: (listId: string, shares: GiftShareInput[]) => void;
  /**
   * Garantit la part `lecture` du destinataire SANS fermer le dialogue
   * (D-04, partage d'abord) : le panneau d'envoi l'appelle avant l'envoi
   * serveur. Fourni par la page (mutation partages, sans toast).
   */
  onEnsureLectureShare: (listId: string, email: string) => Promise<void>;
  isPending?: boolean;
}

/**
 * Panneau partage par code (D-15/D-18), réplique du panneau ardoise à
 * l'identique : lien `/invitation/cadeau?code=`, Copier/Partager
 * (navigator.share avec repli presse-papiers), Générer/Régénérer, code brut
 * affiché une fois en mono + QR, mention code-actif-créé-ailleurs,
 * « Arrêter le partage » avec revoke.
 *
 * Le code brut vit dans l'état du dialogue : fermer (naviguer) le masque.
 * Le rachat externe (D-16/D-17) passe par le lien : inscription avec l'e-mail
 * invité puis activation via la branche e-mail de `redeem_gift_list_invite`
 * (OQ-1 OPTION A, Edge user-only, plan 05-03).
 */
function GiftCodePanel({
  list,
  open,
  summary,
  codeError,
  onRefresh,
  onEnsureLectureShare,
}: {
  list: GiftList;
  open: boolean;
  /**
   * Résumé d'invitation déjà chargé par le dialogue (G-06-1d) : le panneau
   * ne refait aucun fetch, il lit cet état partagé — le rappel lien-actif du
   * formulaire et ce panneau disent toujours la même chose.
   */
  summary: GiftListInviteSummary | null;
  codeError: boolean;
  onRefresh: () => Promise<void>;
  onEnsureLectureShare: (listId: string, email: string) => Promise<void>;
}) {
  const toast = useToast();
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [hostMessage, setHostMessage] = useState('');
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendOk, setSendOk] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      // Navigation / fermeture : le code brut ne survit pas au dialogue.
      setLastCode(null);
      return;
    }
    // Réouverture : le formulaire d'envoi repart vierge (le code, lui, se
    // régénère via le bouton — jamais réaffiché depuis le serveur).
    setRecipient('');
    setHostMessage('');
    setSendError(null);
    setSendOk(null);
  }, [open]);

  const refresh = () => onRefresh();

  const inviteUrl = (code: string) => `${window.location.origin}${giftInviteLink(code)}`;

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast('Code copié.');
    } catch {
      toast(code);
    }
  };

  const shareCode = async (code: string) => {
    const link = inviteUrl(code);
    try {
      if (navigator.share) {
        await navigator.share({ title: list.name, text: `Partage ma liste « ${list.name} » : ${link}` });
        return;
      }
    } catch {
      // Partage annulé : repli copie du lien ci-dessous.
    }
    try {
      await navigator.clipboard.writeText(link);
      toast('Lien copié.');
    } catch {
      toast(link);
    }
  };

  const generate = () => {
    setBusy(true);
    createGiftListInviteCode(list.id)
      .then((created) => {
        setLastCode(created.code);
        return refresh();
      })
      .then(() => toast('Nouveau code généré : l’ancien est invalidé.'))
      .catch((inviteError: unknown) =>
        toast(inviteError instanceof Error ? inviteError.message : 'Code impossible.', 'error'),
      )
      .finally(() => setBusy(false));
  };

  const revoke = () => {
    setBusy(true);
    revokeGiftListInviteCode(list.id)
      .then(() => {
        setLastCode(null);
        return refresh();
      })
      .then(() => toast('Partage arrêté : le code ne passe plus.'))
      .catch((inviteError: unknown) =>
        toast(inviteError instanceof Error ? inviteError.message : 'Arrêt impossible.', 'error'),
      )
      .finally(() => setBusy(false));
  };

  /**
   * Envoi de l'invitation (D-02/D-03/D-04) : la part `lecture` du
   * destinataire est créée D'ABORD (chemin de soumission existant, sans
   * fermer le dialogue), PUIS l'action serveur envoie l'e-mail sobre avec
   * le message personnel de l'hôte. Le lien embarque le code affiché
   * ci-dessus (généré sur cet appareil) : sans code visible, pas d'envoi.
   */
  const sendEmail = () => {
    setSendError(null);
    setSendOk(null);
    const address = recipient.trim();
    if (!emailPattern.test(address)) {
      setSendError('Indiquez un email valide.');
      return;
    }
    const text = hostMessage.trim();
    if (text.length > GIFT_HOST_MESSAGE_MAX) {
      setSendError(`Le message personnel fait ${GIFT_HOST_MESSAGE_MAX} caractères au plus.`);
      return;
    }
    if (!lastCode) {
      setSendError('Générez d’abord un code : l’e-mail embarque son lien.');
      return;
    }
    const code = lastCode;
    setSendBusy(true);
    onEnsureLectureShare(list.id, address)
      .then(() =>
        sendGiftListInviteEmail({
          code,
          email: address,
          ...(text ? { message: text } : {}),
          link: inviteUrl(code),
        }),
      )
      .then((sent) => {
        setSendOk(`Invitation envoyée à ${sent.email}.`);
        toast('Invitation envoyée.');
      })
      .catch((sendFailure: unknown) =>
        setSendError(sendFailure instanceof Error ? sendFailure.message : 'Envoi impossible.'),
      )
      .finally(() => setSendBusy(false));
  };

  return (
    <section aria-label="Partage par code" className="grid gap-3 border-t border-border pt-3.5">
      <p className="m-0 text-[12px] font-extrabold">Partage par code</p>
      {codeError ? (
        <p className="m-0 text-[12px] text-muted" role="status">
          Le partage par code exige le backend (Edge Function) : indisponible dans ce mode.
        </p>
      ) : (
        <div className="grid gap-3">
          <p className="m-0 text-[12px] text-muted" role="status">
            {summary?.hasCode
              ? `Partage ${summary.isActive ? 'actif' : 'coupé'} · ${summary.useCount}${summary.maxUses ? `/${summary.maxUses}` : ''} utilisations${summary.expiresAt ? ` · expire le ${summary.expiresAt.slice(0, 10)}` : ''}.`
              : 'Aucun code actif. Générez-en un pour inviter.'}
          </p>
          {lastCode ? (
            <>
              <p className="m-0 rounded-[11px] bg-bg px-3 py-2.5 font-mono text-[13px] break-all" role="status">
                {lastCode}
              </p>
              <p className="m-0 text-[12px] break-all text-muted">Lien à partager : {inviteUrl(lastCode)}</p>
              <QrCode value={inviteUrl(lastCode)} label={`QR du partage de ${list.name}`} />
            </>
          ) : summary?.hasCode ? (
            <p className="m-0 text-[12px] text-muted">Code actif créé ailleurs : régénérez pour l’afficher sur cet appareil.</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon="plus" disabled={busy} onClick={generate}>
              {summary?.hasCode ? 'Régénérer' : 'Générer un code'}
            </Button>
            {lastCode ? (
              <>
                <Button variant="secondary" disabled={busy} onClick={() => void copyCode(lastCode)}>
                  Copier
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => void shareCode(lastCode)}>
                  Partager
                </Button>
              </>
            ) : null}
            {summary?.hasCode ? (
              <Button variant="secondary" disabled={busy} onClick={revoke}>
                Arrêter le partage
              </Button>
            ) : null}
          </div>
          <p className="m-0 text-[11px] text-muted">
            Le lien mène vers la page invitée : sans compte, un nom suffit pour réserver.
          </p>
          <div className="grid gap-2.5 border-t border-border pt-3">
            <p className="m-0 text-[12px] font-extrabold">Envoyer par e-mail</p>
            <Field label="E-mail du destinataire">
              {(props) => (
                <Input
                  {...props}
                  type="email"
                  placeholder="prenom@exemple.fr"
                  value={recipient}
                  onChange={(change) => setRecipient(change.target.value)}
                  autoComplete="email"
                />
              )}
            </Field>
            <label className="grid gap-1.5 text-[11px] font-extrabold text-muted">
              Message personnel (optionnel)
              <textarea
                aria-label="Message personnel (optionnel)"
                className="min-h-[68px] rounded-[9px] border border-border bg-bg px-2.5 py-2 text-[12px] font-normal text-fg"
                placeholder="Un mot pour accompagner l’invitation…"
                value={hostMessage}
                onChange={(change) => setHostMessage(change.target.value)}
                maxLength={GIFT_HOST_MESSAGE_MAX + 20}
              />
              <span className="text-[10px] font-normal">
                {`${hostMessage.trim().length}/${GIFT_HOST_MESSAGE_MAX} caractères.`}
              </span>
            </label>
            {sendOk ? (
              <p className="m-0 text-[12px] font-semibold text-accent-strong" role="status">
                {sendOk}
              </p>
            ) : null}
            {sendError ? (
              <p role="alert" className="m-0 text-[11px] font-semibold text-coral">
                {sendError}
              </p>
            ) : null}
            <div>
              <Button variant="secondary" icon="share" disabled={sendBusy || busy} onClick={sendEmail}>
                {sendBusy ? 'Envoi…' : 'Envoyer l’invitation'}
              </Button>
            </div>
            <p className="m-0 text-[11px] text-muted">
              L’envoi crée d’abord le partage du destinataire, puis transmet l’e-mail sobre avec votre message.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Partage d'une liste de cadeaux : le schéma porte le partage au niveau de la
 * liste (`gift_list_shares`), chaque destinataire ayant sa propre permission.
 * Le panneau code (D-15/D-18) suit pour les proches hors foyer (D-16/D-17).
 */
export function GiftShareDialog({
  open,
  onOpenChange,
  list,
  members,
  existingShares,
  onSubmit,
  onEnsureLectureShare,
  isPending = false,
}: GiftShareDialogProps) {
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { members: [], permissions: {}, email: '' },
  });
  const toast = useToast();
  /**
   * Résumé d'invitation (G-06-1d) : chargé une fois par le dialogue, partagé
   * entre le formulaire (rappel lien-actif) et le panneau code — aucun
   * nouveau fetch, aucun nouvel endpoint, l'assistant existant
   * `revokeGiftListInviteCode` est réutilisé tel quel.
   */
  const [summary, setSummary] = useState<GiftListInviteSummary | null>(null);
  const [codeError, setCodeError] = useState(false);
  const [linkReminder, setLinkReminder] = useState(false);
  const [revokeBusy, setRevokeBusy] = useState(false);

  const shareable = members.filter((member) => member.id !== list?.ownerMemberId);
  const selected = watch('members') ?? [];
  const emailValue = watch('email') ?? '';
  const listId = list?.id;

  useEffect(() => {
    if (!open || !list) return;
    reset({
      members: existingShares.filter((share) => share.memberId).map((share) => share.memberId as string),
      permissions: Object.fromEntries(
        existingShares.filter((share) => share.memberId).map((share) => [share.memberId as string, share.permission]),
      ),
      email: existingShares.find((share) => share.email)?.email ?? '',
    });
    setLinkReminder(false);
  }, [existingShares, list, open, reset]);

  useEffect(() => {
    if (!open || !listId) return;
    let active = true;
    fetchGiftListInviteSummary(listId)
      .then((result) => {
        if (active) {
          setSummary(result);
          setCodeError(false);
        }
      })
      .catch(() => {
        if (active) setCodeError(true);
      });
    return () => {
      active = false;
    };
  }, [listId, open]);

  const refreshSummary = () => {
    if (!listId) return Promise.resolve();
    return fetchGiftListInviteSummary(listId)
      .then((result) => {
        setSummary(result);
        setCodeError(false);
      })
      .catch(() => setCodeError(true));
  };

  const linkLive = summary?.hasCode === true && summary?.isActive === true;
  const zeroShare = selected.length === 0 && emailValue.trim() === '';
  const showLinkReminder = linkReminder && zeroShare && linkLive;

  const submit = (values: FormValues) => {
    if (!list) return;
    const shares: GiftShareInput[] = values.members.map((memberId) => ({
      memberId,
      email: null,
      permission: values.permissions[memberId] === 'reservation' ? 'reservation' : 'lecture',
    }));
    if (values.email !== '') {
      shares.push({ memberId: null, email: values.email, permission: 'lecture' });
    }
    if (shares.length === 0 && linkLive) {
      // G-06-1d : retirer les partages ne révoque pas le lien — l'invitée
      // garde l'accès via le code. Pas de coupe silencieuse : l'enregistrement
      // attend un choix explicite (révoquer, ou garder le lien et enregistrer).
      setLinkReminder(true);
      return;
    }
    setLinkReminder(false);
    onSubmit(list.id, shares);
  };

  /**
   * Révocation depuis le rappel (G-06-1d) : même assistant que le panneau
   * code, puis rafraîchissement du résumé partagé pour que panneau et rappel
   * disent la même chose (le rappel disparaît : plus de lien actif).
   */
  const revokeFromReminder = () => {
    if (!list) return;
    setRevokeBusy(true);
    revokeGiftListInviteCode(list.id)
      .then(() => refreshSummary())
      .then(() => toast('Partage arrêté : le code ne passe plus.'))
      .catch((inviteError: unknown) =>
        toast(inviteError instanceof Error ? inviteError.message : 'Arrêt impossible.', 'error'),
      )
      .finally(() => setRevokeBusy(false));
  };

  const keepLinkAndSave = () => {
    if (!list) return;
    setLinkReminder(false);
    onSubmit(list.id, []);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <p className="eyebrow mb-2">Cadeaux</p>
          <DialogTitle>Partager la liste</DialogTitle>
          <DialogDescription>
            {list
              ? `Choisissez les personnes du foyer ou un proche externe. Le partage porte sur toute la liste « ${list.name} ».`
              : 'Choisissez les personnes du foyer ou un proche externe.'}
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={handleSubmit(submit)} className="grid gap-3.5">
          <p className="m-0 text-[11px] text-muted">
            Retirer un partage ici ne révoque pas le lien d’invitation ci-dessous : celui-ci continue de donner accès
            aux invités.
          </p>
          <fieldset className="grid gap-2">
            <legend className="text-[11px] font-extrabold text-muted">Membres du foyer</legend>
            {shareable.map((member) => (
              <div key={member.id} className="flex items-center gap-3">
                <label className="inline-flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-[9px] border border-border bg-bg px-2.5 text-[12px] font-semibold text-muted has-[:checked]:border-accent has-[:checked]:bg-accent-faint has-[:checked]:text-accent-strong">
                  <input type="checkbox" value={member.id} className="accent-accent" {...register('members')} />
                  <MemberAvatar member={member} size="sm" />
                  {member.display_name}
                </label>
                <Select
                  aria-label={`Permission pour ${member.display_name}`}
                  className="w-[150px] shrink-0"
                  {...register(`permissions.${member.id}`)}
                >
                  <option value="lecture">{permissionLabel.lecture}</option>
                  <option value="reservation">{permissionLabel.reservation}</option>
                </Select>
              </div>
            ))}
            {errors.members?.message ? (
              <p role="alert" className="m-0 text-[11px] font-semibold text-coral">
                {errors.members.message}
              </p>
            ) : null}
            {selected.length > 0 ? (
              <p className="m-0 text-[10px] text-muted">{`${selected.length} personne(s) sélectionnée(s).`}</p>
            ) : null}
          </fieldset>

          <Field label="Inviter un proche (optionnel)" error={errors.email?.message} hint="Un accès lecture seule">
            {(props) => <Input {...props} type="email" placeholder="prenom@exemple.fr" {...register('email')} />}
          </Field>

          {showLinkReminder ? (
            <div className="grid gap-2 rounded-[11px] border border-border bg-bg px-3 py-2.5" role="alert">
              <p className="m-0 text-[12px] font-semibold">
                Un lien d’invitation actif existe encore — les invités gardent l’accès via ce lien, même sans partage.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={revokeBusy} onClick={revokeFromReminder}>
                  {revokeBusy ? 'Révocation…' : 'Révoquer le lien'}
                </Button>
                <Button variant="secondary" disabled={revokeBusy} onClick={keepLinkAndSave}>
                  Garder le lien et enregistrer
                </Button>
              </div>
            </div>
          ) : null}

          <DialogActions>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" icon="share" disabled={isPending}>
              {isPending ? 'Enregistrement…' : 'Enregistrer le partage'}
            </Button>
          </DialogActions>
        </form>
        {list ? (
          <GiftCodePanel
            list={list}
            open={open}
            summary={summary}
            codeError={codeError}
            onRefresh={refreshSummary}
            onEnsureLectureShare={onEnsureLectureShare}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
