import { describe, expect, it } from 'vitest';
import { demoMessages, seedRows } from '@/lib/data/seed';

/**
 * Contrôle de **classe** sur les instants de la graine de démonstration.
 *
 * Le défaut corrigé ici (deferred-items.md §13) n'était pas un cas isolé : cinq
 * `created_at` de messages étaient posés à une heure **murale** fixe du jour.
 * Avant 10 h 45, le mode démo montrait donc des messages datés du futur, et la
 * suite `use-notifications` rougissait douze heures par jour. Une correction
 * d'instance aurait laissé les autres occurrences ; cette garde interdit la
 * récidive en vérifiant **tous** les `created_at` ensemencés.
 *
 * Bornée aux `created_at` à dessein (AGENTS.md §2.7B) : un `*_at` de rappel
 * (`event_reminders.remind_at`, `task_reminders.remind_at`) est légitimement
 * dans le futur — c'est sa raison d'être. Une garde large le refuserait, et le
 * contrôle serait désappris avant d'avoir servi.
 */
describe('instants de la graine', () => {
  it('tout `created_at` ensemencé est dans le passé', () => {
    const now = Date.now();
    const future: string[] = [];
    let checked = 0;

    for (const [table, rows] of Object.entries(seedRows())) {
      for (const row of rows) {
        const value = (row as { created_at?: unknown }).created_at;
        if (typeof value !== 'string') continue;
        checked += 1;
        const instant = Date.parse(value);
        if (!Number.isFinite(instant) || instant > now) {
          future.push(`${table}[${String((row as { id?: unknown }).id ?? '?')}] = ${value}`);
        }
      }
    }

    // Un contrôle qui ne regarde rien est vert sans rien voir : si le parcours
    // ne trouve aucun champ, le test doit ÉCHOUER en le disant, pas passer.
    expect(checked, 'aucun `created_at` trouvé — le contrôle ne regarde rien').toBeGreaterThan(0);
    expect(future, `instants futurs dans la graine : ${future.join(', ')}`).toEqual([]);
  });

  it('les messages de la graine sont passés et gardent leur ordre', () => {
    const now = Date.now();
    const at = (message: (typeof demoMessages)[number]) => Date.parse(message.created_at);

    for (const message of demoMessages) {
      // Strictement dans le passé : un message a été envoyé, il ne peut pas
      // être daté de maintenant ni du futur.
      expect(at(message), `${message.id} doit être un instant révolu`).toBeLessThan(now);
    }

    // L'ordre d'origine est préservé : conversation-3 la plus récente,
    // conversation-1 au milieu, conversation-2 la plus ancienne.
    const lastOf = (conversationId: string) =>
      Math.max(...demoMessages.filter((m) => m.conversation_id === conversationId).map(at));
    expect(lastOf('conversation-3')).toBeGreaterThan(lastOf('conversation-1'));
    expect(lastOf('conversation-1')).toBeGreaterThan(lastOf('conversation-2'));
  });
});
