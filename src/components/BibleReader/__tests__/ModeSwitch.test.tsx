/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { useState } from 'react';
import { ModeSwitch } from '../ModeSwitch';
import { useAppModeStore } from '@/stores/appModeStore';
import { usePanelStore } from '@/stores/panelStore';
import { useDiscoveryPrefsStore } from '@/stores/discoveryPrefsStore';

let discoveryEnabled = true;
vi.mock('@/lib/discovery-config', () => ({
  useDiscoveryEnabled: () => discoveryEnabled,
  getDiscoveryEnabled: () => discoveryEnabled,
}));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

function Harness() {
  const [open, setOpen] = useState(false);
  return <ModeSwitch menuOpen={open} onMenuOpenChange={setOpen} />;
}

beforeEach(() => {
  discoveryEnabled = true;
  useAppModeStore.setState({ mode: 'read' });
  usePanelStore.setState({ activePanel: null, returnPanel: null, isCollapsed: false, isPinned: false, orientation: 'horizontal' });
  useDiscoveryPrefsStore.setState({ discoverPanelClosed: false });
});

afterEach(cleanup);

describe('ModeSwitch wide', () => {
  it('renders a radiogroup with the current mode checked', () => {
    render(<Harness />);
    expect(screen.getByRole('radiogroup', { name: 'Mode' })).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Read' }).getAttribute('aria-checked')).toBe('true');
  });

  it('switches mode when another option is clicked', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('radio', { name: 'Study' }));
    expect(useAppModeStore.getState().mode).toBe('study');
    expect(screen.getByRole('radio', { name: 'Study' }).getAttribute('aria-checked')).toBe('true');
  });

  it('toggles the Discover panel when the selected Discover segment is clicked again', () => {
    useAppModeStore.setState({ mode: 'discover' });
    usePanelStore.setState({ activePanel: 'discovery' });
    render(<Harness />);

    fireEvent.click(screen.getByRole('radio', { name: 'Discover' }));
    expect(usePanelStore.getState().activePanel).toBeNull();
    expect(useDiscoveryPrefsStore.getState().discoverPanelClosed).toBe(true);
    expect(useAppModeStore.getState().mode).toBe('discover');

    fireEvent.click(screen.getByRole('radio', { name: 'Discover' }));
    expect(usePanelStore.getState().activePanel).toBe('discovery');
    expect(useDiscoveryPrefsStore.getState().discoverPanelClosed).toBe(false);
  });

  it('wraps the control in the mode-switch tour target', () => {
    const { container } = render(<Harness />);
    const target = container.querySelector('[data-mode-switch]');
    expect(target).not.toBeNull();
    expect(within(target as HTMLElement).getByRole('radiogroup', { name: 'Mode' })).toBeTruthy();
  });

  it('omits Discover when the kill switch is off', () => {
    discoveryEnabled = false;
    render(<Harness />);
    expect(screen.getAllByRole('radio').map(r => r.textContent)).toEqual(['Read', 'Study']);
  });
});

describe('ModeSwitch narrow', () => {
  beforeEach(() => {
    usePanelStore.setState({ orientation: 'vertical' });
  });

  it('renders a button labelled with the current mode', () => {
    useAppModeStore.setState({ mode: 'study' });
    render(<Harness />);
    const button = screen.getByRole('button', { name: 'Mode: Study' });
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('puts the mode-switch tour target on the chip button', () => {
    const { container } = render(<Harness />);
    const targets = container.querySelectorAll('[data-mode-switch]');
    expect(targets).toHaveLength(1);
    expect(targets[0]).toBe(screen.getByRole('button', { name: 'Mode: Read' }));
  });

  it('opens a menu of options with one-liners and switches on choice', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Mode: Read' }));
    const menu = screen.getByRole('menu', { name: 'Mode' });
    const items = within(menu).getAllByRole('menuitemradio');
    expect(items).toHaveLength(3);
    expect(items[0].getAttribute('aria-checked')).toBe('true');
    expect(items[2].textContent).toContain('The full inductive toolset');
    fireEvent.click(items[2]);
    expect(useAppModeStore.getState().mode).toBe('study');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('lists two options when the kill switch is off', () => {
    discoveryEnabled = false;
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Mode: Read' }));
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(2);
  });
});
