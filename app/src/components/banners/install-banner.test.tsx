import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InstallBanner, InstallBannerGate } from './install-banner';
import { useBannerStore } from './banner-store';

const pwa = vi.hoisted(() => ({
  installed: false,
  canInstall: true,
  install: vi.fn(),
}));

vi.mock('@/hooks/use-pwa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-pwa')>();
  return {
    ...actual,
    usePwaInstalled: () => pwa.installed,
    useInstallPrompt: () => ({ canInstall: pwa.canInstall, install: pwa.install }),
  };
});

const KEY = 'eo-install-banner-dismissed-at';
const DAY = 24 * 3600 * 1000;

function dismiss(daysAgo: number | null, value?: string) {
  if (daysAgo === null) {
    if (value !== undefined) localStorage.setItem(KEY, value);
    return;
  }
  localStorage.setItem(KEY, String(Date.now() - daysAgo * DAY));
}

describe('InstallBannerGate — conditions d’affichage', () => {
  beforeEach(() => {
    localStorage.clear();
    useBannerStore.setState({ entries: [], sorted: [] });
    pwa.installed = false;
    pwa.canInstall = true;
    pwa.install.mockReset();
  });

  it('ne pousse rien quand l’app est installée — standalone (D-03)', () => {
    pwa.installed = true;
    render(<InstallBannerGate />);
    expect(useBannerStore.getState().entries).toHaveLength(0);
  });

  it('enterrée il y a 1 jour → masquée (D-02)', () => {
    dismiss(1);
    render(<InstallBannerGate />);
    expect(useBannerStore.getState().entries).toHaveLength(0);
  });

  it('enterrée il y a 29 jours → encore masquée (D-02 : enterrement < 30 jours)', () => {
    // Le behavior du plan annonçait « 29 j → visible », en contradiction avec
    // le must_have D-02 (« enterrée (< 30 jours) ») qui prime : à 29 jours la
    // bannière est encore enterrée.
    dismiss(29);
    render(<InstallBannerGate />);
    expect(useBannerStore.getState().sorted.map((e) => e.kind)).not.toContain('install');
  });

  it('enterrée il y a 31 jours → visible (fin de l’enterrement, D-02)', () => {
    dismiss(31);
    render(<InstallBannerGate />);
    expect(useBannerStore.getState().sorted.map((e) => e.kind)).toContain('install');
  });

  it('clé localStorage corrompue (« abc ») → bannière VISIBLE (repli sûr)', () => {
    dismiss(null, 'abc');
    render(<InstallBannerGate />);
    expect(useBannerStore.getState().sorted.map((e) => e.kind)).toContain('install');
  });

  it('pousse l’entrée install en priorité 2 (sous sw-update priorité 1)', () => {
    render(<InstallBannerGate />);
    const sorted = useBannerStore.getState().sorted;
    const installEntry = sorted.find((e) => e.kind === 'install');
    expect(installEntry?.priority).toBe(2);
  });

  it('retire l’entrée quand l’app devient installée (D-03)', () => {
    const { rerender } = render(<InstallBannerGate />);
    expect(useBannerStore.getState().sorted.map((e) => e.kind)).toContain('install');
    pwa.installed = true;
    rerender(<InstallBannerGate />);
    expect(useBannerStore.getState().sorted.map((e) => e.kind)).not.toContain('install');
  });
});

describe('InstallBanner — présentation (entrée posée par le gate)', () => {
  beforeEach(() => {
    localStorage.clear();
    useBannerStore.setState({ entries: [], sorted: [] });
    pwa.installed = false;
    pwa.canInstall = true;
    pwa.install.mockReset();
  });

  it('rend un bouton « Installer » qui appelle install() du hook existant (D-01)', async () => {
    useBannerStore.getState().push({ kind: 'install', priority: 2 });
    render(<InstallBanner />);
    const button = screen.getByRole('button', { name: 'Installer' });
    await userEvent.click(button);
    expect(pwa.install).toHaveBeenCalledOnce();
  });
});

describe('InstallBanner — iOS', () => {
  beforeEach(() => {
    localStorage.clear();
    useBannerStore.setState({ entries: [], sorted: [] });
    pwa.installed = false;
    pwa.canInstall = false;
  });

  it('affiche un déclencheur dépliable ; déplié → pas-à-pas Safari dans la bannière (D-01)', async () => {
    useBannerStore.getState().push({ kind: 'install', priority: 2 });
    const { container } = render(<InstallBanner isIosOverride />);
    expect(screen.queryByRole('button', { name: 'Installer' })).toBeNull();
    const trigger = screen.getByRole('button', { name: /Comment installer/ });
    await userEvent.click(trigger);
    expect(container.textContent).toContain('Partager');
    expect(container.textContent).toContain('Sur l’écran d’accueil');
  });
});

describe('InstallBanner — dismiss', () => {
  beforeEach(() => {
    localStorage.clear();
    useBannerStore.setState({ entries: [], sorted: [] });
    pwa.installed = false;
    pwa.canInstall = true;
  });

  it('« Plus tard » écrit le timestamp et retire la bannière du store (D-02)', async () => {
    useBannerStore.getState().push({ kind: 'install', priority: 2 });
    render(<InstallBanner />);
    await userEvent.click(screen.getByRole('button', { name: 'Plus tard' }));
    const at = Number(localStorage.getItem(KEY));
    expect(Number.isFinite(at)).toBe(true);
    expect(Math.abs(Date.now() - at)).toBeLessThan(5000);
    expect(useBannerStore.getState().entries).toHaveLength(0);
  });
});
