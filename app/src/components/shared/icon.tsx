import { cn } from '@/lib/utils';

/**
 * Jeu d'icônes de l'export de design : traits de 1,8px sur une grille 24×24,
 * `currentColor`, afin de conserver exactement le rendu d'origine.
 */
const paths = {
  arrow: 'M5 12h13M13 6l6 6-6 6',
  arrowLeft: 'M19 12H6M11 6l-6 6 6 6',
  bell: 'M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4',
  calendar: 'M4 5h16v15H4zM8 3v4M16 3v4M4 9h16',
  check: 'm5 12 4 4L19 6',
  checkCircle: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M9 12l2.5 2.5L16 9',
  clock: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 7v5l3 2',
  close: 'm6 6 12 12M18 6 6 18',
  comment: 'M20 11.5a7 7 0 0 1-7.5 7 8.7 8.7 0 0 1-3-.5L5 20l1.5-3.6A6.9 6.9 0 0 1 5 11.5a7 7 0 0 1 7.5-7 7 7 0 0 1 7.5 7Z',
  drag: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
  edit: 'm4 16-.8 4.8L8 20l11-11-4-4L4 16Zm9.5-9.5 4 4',
  flag: 'M5 21V4m0 0c4-3 7 3 14 0v10c-7 3-10-3-14 0',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  heart: 'M20.8 8.7c0 5.2-8.8 10.1-8.8 10.1S3.2 13.9 3.2 8.7A4.7 4.7 0 0 1 12 6.3a4.7 4.7 0 0 1 8.8 2.4Z',
  home: 'm4 10 8-6 8 6v9H4v-9ZM9 20v-6h6v6',
  info: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 11v5M12 8h.01',
  link: 'M10 13a5 5 0 0 0 7.1.1l1.4-1.4a5 5 0 0 0-7.1-7.1l-.8.8M14 11a5 5 0 0 0-7.1-.1l-1.4 1.4a5 5 0 0 0 7.1 7.1l.8-.8',
  message: 'M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4H7.5A2.5 2.5 0 0 1 5 13.5v-7Z',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  people: 'M9 9m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M3.5 19a5.5 5.5 0 0 1 11 0M16 7.5a3 3 0 0 1 0 5.8M17 14.5a5 5 0 0 1 3.5 4.5',
  phone: 'M6.5 4.5 9 4l1.5 4-2 1.5a14 14 0 0 0 6 6l1.5-2 4 1.5-.5 2.5a2.5 2.5 0 0 1-2.7 1.9C10.5 18.4 5.6 13.5 4.6 6.2A2.5 2.5 0 0 1 6.5 4.5Z',
  pin: 'M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11ZM12 10m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  plus: 'M12 5v14M5 12h14',
  search: 'M10.8 10.8m-6.8 0a6.8 6.8 0 1 0 13.6 0a6.8 6.8 0 1 0-13.6 0m5.2 5.2 4 4',
  send: 'm4 4 16 8-16 8 3-8-3-8ZM7 12h13',
  settings: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z',
  share: 'M18 5m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M6 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M18 19m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M8.2 10.8l7.6-4.5M8.2 13.2l7.6 4.5',
  sun: 'M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  trash: 'M5 7h14M10 11v5M14 11v5M8 7l.7-3h6.6l.7 3M7 7l1 13h8l1-13',
  wallet: 'M4 7.5A2.5 2.5 0 0 1 6.5 5H19v14H6.5A2.5 2.5 0 0 1 4 16.5v-9ZM4 8h15M15 12h4',
  wand: 'm15 4 5 5M13 6l5 5M4 20l8.8-8.8M5 5l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z',
  cloud: 'M7 18h10a4 4 0 0 0 .7-7.94A6 6 0 0 0 6 11.5 3.5 3.5 0 0 0 7 18Z',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6M9 12h6',
  utensils: 'M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M17 3c-1.5 2-2 4-2 6s.5 3 2 3v9',
  gift: 'M4 11h16v9H4v-9Zm0 0V8h16v3M12 8v12M8.5 8C7 8 5.5 7 5.5 5.5S7 3 8.5 3 12 5 12 8M15.5 8C17 8 18.5 7 18.5 5.5S17 3 15.5 3 12 5 12 8',
  user: 'M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M4.5 20a7.5 7.5 0 0 1 15 0',
  wifi: 'M2.5 8.5a15 15 0 0 1 19 0M5.5 12a10.5 10.5 0 0 1 13 0M8.5 15.5a6 6 0 0 1 7 0M12 19h.01',
  copy: 'M8 8h11v11H8zM5 16H4V4h12v1',
  star: 'M12 4l2.5 5.2 5.5.8-4 3.9 1 5.6-5-2.7-5 2.7 1-5.6-4-3.9 5.5-.8L12 4Z',
  map: 'M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2ZM9 4v14M15 6v14',
  scan: 'M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4M4 12h16',
  logout: 'M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2M10 12h10M17 9l3 3-3 3',
  image: 'M4 5h16v14H4zM4 16l4.5-4.5 3 3 3-3L20 16M9 9.5m-1.2 0a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0',
  chevronRight: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  filter: 'M4 5h16l-6 7v6l-4 2v-8L4 5Z',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6',
  download: 'M12 4v10M8 11l4 4 4-4M5 19h14',
  users: 'M9 9m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M3.5 19a5.5 5.5 0 0 1 11 0M16 7.5a3 3 0 0 1 0 5.8M17 14.5a5 5 0 0 1 3.5 4.5',
  key: 'M15.5 3a6 6 0 1 0-4.3 10.2L10 14.5H8V17H5.5L3 19.5 4.5 22l2-2H8v-2.5h2.3l1.3-1.3A6 6 0 0 0 15.5 3Zm1.5 3.5h.01',
  google: 'M12 3a9 9 0 1 0 4.2 16.97l-2.9-2.78A5.4 5.4 0 0 0 17.4 12c0-.4-.04-.78-.11-1.14H12v2.28h3.02a3.9 3.9 0 0 1-1.7 2.55v2.12h2.75A9 9 0 0 0 12 3Z',
  facebook: 'M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.55-1.5h1.65V3.62A22 22 0 0 0 14.28 3c-2.4 0-4.03 1.46-4.03 4.15V9.9H7.5V13h2.75v8h3.25Z',
} as const;

export type IconName = keyof typeof paths;

export type IconSize = 'sm' | 'md' | 'lg';

const sizes: Record<IconSize, string> = {
  sm: 'size-[15px]',
  md: 'size-[18px]',
  lg: 'size-[21px]',
};

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  name: IconName;
  size?: IconSize;
}

export function Icon({ name, size = 'md', className, ...rest }: IconProps) {
  return (
    <svg
      className={cn('shrink-0', sizes[size], className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={paths[name]} />
    </svg>
  );
}
