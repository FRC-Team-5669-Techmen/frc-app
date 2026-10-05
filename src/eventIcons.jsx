// The event family hub's icons. Drawn here, the same way NavBar.jsx draws its
// own: a 24px grid, one stroke weight, currentColor, no icon dependency and no
// emoji. Every icon is decoration beside words that already say the thing
// (aria-hidden), so a screen reader never hears it.

const Svg = ({ children, size = 20, className = '' }) => (
  <svg className={`eh-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {children}
  </svg>
)

export const IconCalendar = (p) => <Svg {...p}><rect x="3" y="4.5" width="18" height="16.5" rx="2" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /><path d="M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 17h2M11 17h2" /></Svg>
export const IconCar = (p) => <Svg {...p}><path d="M5 16.5V12l1.8-4.6A2 2 0 0 1 8.7 6h6.6a2 2 0 0 1 1.9 1.4L19 12v4.5" /><path d="M3.5 16.5h17v-3.2a1.3 1.3 0 0 0-1.3-1.3H4.8a1.3 1.3 0 0 0-1.3 1.3z" /><circle cx="7.5" cy="17.5" r="1.8" /><circle cx="16.5" cy="17.5" r="1.8" /></Svg>
export const IconUsers = (p) => <Svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14.6c2.8.2 5 2.2 5 5.4" /></Svg>
export const IconUtensils = (p) => <Svg {...p}><path d="M7 2.5v8M4.5 2.5v5a2.5 2.5 0 0 0 5 0v-5M7 10.5V21.5" /><path d="M17 21.5V3c-2.4 1.2-3.5 4-3.5 7.5 0 1.4.9 2.5 2.2 2.5H17" /></Svg>
export const IconPhone = (p) => <Svg {...p}><path d="M5 3.5h3.2l1.6 4.2-2.2 1.4a11 11 0 0 0 7.3 7.3l1.4-2.2 4.2 1.6V19a2 2 0 0 1-2.1 2A17 17 0 0 1 3 5.6 2 2 0 0 1 5 3.5z" /></Svg>
export const IconInfo = (p) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v6" /><circle cx="12" cy="7.6" r="0.6" fill="currentColor" /></Svg>
export const IconCheck = (p) => <Svg {...p}><path d="M4.5 12.5l5 5 10-11" /></Svg>
export const IconCheckCircle = (p) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6" /></Svg>
export const IconClock = (p) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></Svg>
export const IconPin = (p) => <Svg {...p}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" /></Svg>
export const IconHome = (p) => <Svg {...p}><path d="M3.5 11L12 4l8.5 7" /><path d="M6 9.5V20h12V9.5" /><path d="M10 20v-5h4v5" /></Svg>
export const IconFlag = (p) => <Svg {...p}><path d="M5 21V4" /><path d="M5 4.5c4-2 6 2 10 0l3-1v9l-3 1c-4 2-6-2-10 0" /></Svg>
export const IconAlert = (p) => <Svg {...p}><path d="M12 3.5l9.5 16.5h-19z" /><path d="M12 10v4.5" /><circle cx="12" cy="17.3" r="0.6" fill="currentColor" /></Svg>
export const IconShield = (p) => <Svg {...p}><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.4-7.5 9.5-4.3-1.1-7.5-4.9-7.5-9.5V6z" /><path d="M9 12l2.2 2.2L15.5 10" /></Svg>
export const IconHeart = (p) => <Svg {...p}><path d="M12 20s-7.5-4.4-7.5-10a4.3 4.3 0 0 1 7.5-2.9A4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z" /></Svg>
export const IconPill = (p) => <Svg {...p}><rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-35 12 12)" /><path d="M9.7 8.7l4.6 6.6" /></Svg>
export const IconMail = (p) => <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 6l8.5 7 8.5-7" /></Svg>
export const IconUserPlus = (p) => <Svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5 1.6 0 3 .5 4 1.4" /><path d="M18 13v6M15 16h6" /></Svg>
export const IconTrash = (p) => <Svg {...p}><path d="M4 7h16M10 3.5h4M6 7l1 13h10l1-13" /><path d="M10 11v6M14 11v6" /></Svg>
export const IconEdit = (p) => <Svg {...p}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></Svg>
export const IconArrowRight = (p) => <Svg {...p}><path d="M4.5 12h15M13.5 6l6 6-6 6" /></Svg>
export const IconArrowLeft = (p) => <Svg {...p}><path d="M19.5 12h-15M10.5 6l-6 6 6 6" /></Svg>
export const IconChevron = (p) => <Svg {...p}><path d="M8 10l4 4 4-4" /></Svg>
export const IconBed = (p) => <Svg {...p}><path d="M3 18.5V6M3 13h18v5.5M21 13v-1.5a3 3 0 0 0-3-3h-7V13" /><circle cx="7" cy="10.5" r="1.8" /></Svg>
export const IconLink = (p) => <Svg {...p}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></Svg>
export const IconClipboard = (p) => <Svg {...p}><rect x="5" y="4" width="14" height="17" rx="2" /><rect x="9" y="2" width="6" height="4" rx="1" /><path d="M8.5 12.5l2.5 2.5 4.5-4.5" /></Svg>
export const IconSchool = (p) => <Svg {...p}><path d="M2.5 9.5L12 5l9.5 4.5L12 14z" /><path d="M6.5 11.5V16c1.5 1.5 3.4 2.2 5.5 2.2s4-.7 5.5-2.2v-4.5" /></Svg>
export const IconStar = (p) => <Svg {...p}><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" /></Svg>
export const IconSave = (p) => <Svg {...p}><path d="M5 3.5h11l3.5 3.5v13.5H5z" /><path d="M8 3.5v5h7v-5M8 20.5v-6h8v6" /></Svg>
export const IconWifiOff = (p) => <Svg {...p}><path d="M3 3l18 18" /><path d="M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 4.5-2.5M19 13a10 10 0 0 0-2-1.5M2 9.5a15 15 0 0 1 4.6-2.7M22 9.5A15 15 0 0 0 11 5.6" /><circle cx="12" cy="19.5" r="0.6" fill="currentColor" /></Svg>
