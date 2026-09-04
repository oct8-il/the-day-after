/**
 * The nine failure icons, lifted from the prototype's ICONS map. They are
 * design assets, not data, so they live with the components rather than in the
 * ledger - data/ holds only things a source can vouch for.
 */
const PATHS: Record<string, React.ReactNode> = {
  radar: (<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><path d="M12 12l6-6" /><path d="M12 3v2M3 12h2" /></>),
  fence: (<><path d="M4 20V6l2-2 2 2v14M10 20V6l2-2 2 2v14M16 20V6l2-2 2 2v14" /><path d="M4 10h16M4 15h16" /></>),
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2.5" /></>),
  link: (<><path d="M9 15l6-6" /><path d="M10.5 6.5l1.5-1.5a4 4 0 0 1 5.5 5.5L16 12" /><path d="M13.5 17.5L12 19a4 4 0 0 1-5.5-5.5L8 12" /></>),
  shield: (<><path d="M12 3l8 3v6c0 4.5-3.5 8-8 9-4.5-1-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></>),
  bell: (<><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2H4.5z" /><path d="M10 20a2 2 0 0 0 4 0" /></>),
  gavel: (<><path d="M4 20h9" /><path d="M8 6l6 6" /><path d="M6 8l4-4 6 6-4 4z" /><path d="M13 13l6 6" /></>),
  home: (<><path d="M4 11l8-7 8 7v9H4z" /><path d="M10 20v-6h4v6" /></>),
  mic: (<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0" /><path d="M12 17v4M9 21h6" /></>),
};

export function Icon({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{PATHS[name] ?? null}</svg>;
}
