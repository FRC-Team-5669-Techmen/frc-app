// The app's self-hosted inline-SVG icon set (no CDN, no dependency), themed
// through currentColor so each icon takes its link's color, active gold
// included. Moved out of NavBar.jsx by ledger 0017 so the Robot hub and
// /manage use the same drawings.
// Self-hosted inline-SVG icon set (no CDN / dependency, themed via currentColor
// so each icon inherits its nav link's color, including the active gold).
const Svg = ({ children, className = 'nav-icon' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)
export const IconHome = () => <Svg><path d="M3.5 11 12 4l8.5 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5.5h4V20" /></Svg>
export const IconScout = () => <Svg><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /><path d="M11 8v6M8 11h6" /></Svg>
export const IconRobot = () => <Svg><rect x="4.5" y="8" width="15" height="10" rx="2" /><path d="M12 4v4" /><circle cx="12" cy="3.5" r="1" /><circle cx="9" cy="13" r="1.2" /><circle cx="15" cy="13" r="1.2" /><path d="M2.5 12v3M21.5 12v3" /></Svg>
export const IconDashboard = () => <Svg><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></Svg>
export const IconSchedule  = () => <Svg><rect x="3" y="4" width="18" height="17" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="16" y1="2" x2="16" y2="6" /></Svg>
export const IconJobs      = () => <Svg><rect x="5" y="4" width="14" height="17" rx="2" /><rect x="9" y="2" width="6" height="4" rx="1" /><path d="M8.5 12.5l2.5 2.5 4.5-4.5" /></Svg>
export const IconHours     = () => <Svg><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></Svg>
export const IconSkills    = () => <Svg><circle cx="12" cy="9" r="5.5" /><path d="M8.5 13.5 7 22l5-2.6L17 22l-1.5-8.5" /></Svg>

export const IconBattery = () => <Svg><rect x="3" y="7" width="16" height="11" rx="1.5" /><path d="M19 10.5h2v4h-2" /><path d="M11.5 9 8.5 13h4l-3 4" /></Svg>
export const IconStatus = () => <Svg><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></Svg>
export const IconAdmin = () => <Svg><path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6z" /><path d="m9 12 2 2 4-4" /></Svg>
export const IconAuto = () => <Svg><path d="M4 18 9 9l4 5 3-4 4 8" /><circle cx="9" cy="9" r="1.4" /><circle cx="16" cy="10" r="1.4" /></Svg>
export const IconWheel = () => <Svg><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="2" /><path d="M3.8 10.5h6.3M13.9 10.5h6.3M12 14v6.4" /></Svg>
export const IconClock = () => <Svg><circle cx="12" cy="13" r="7.5" /><path d="M12 9v4l2.5 2" /><path d="M9.5 3h5M12 3v2.5" /></Svg>
