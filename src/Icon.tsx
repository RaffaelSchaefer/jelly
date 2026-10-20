export type IconName = 'spark' | 'food' | 'drink' | 'event' | 'palette' | 'settings' | 'close' | 'drag' | 'minus';

const paths: Record<IconName, string> = {
  spark: 'm12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3Z',
  food: 'M4 11h16M5 8c0-6 14-6 14 0H5Zm0 7h14M5 18h14M5 18v2h14v-2',
  drink: 'M7 6h10l-1 15H8L7 6Zm6 0 2-4h4M8 11h8',
  event: 'M5 5h14v16H5V5Zm3-3v6m8-6v6M5 10h14m-10 5 2 2 4-4',
  palette: 'M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 0-4h-1a1 1 0 0 1 0-2h3a6 6 0 0 0 6-6c0-3-4-6-9-6ZM7 10h.01M10 6h.01M16 7h.01M6 15h.01',
  settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
  close: 'm6 6 12 12M6 18 18 6',
  drag: 'M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01',
  minus: 'M5 12h14',
};

export default function Icon({ name }: { name: IconName }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
