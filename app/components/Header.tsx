import Link from 'next/link';

/**
 * The prototype's header.top, unchanged in structure. The sign-in button is
 * present but inert until Phase 5: the launch build has no accounts, and a
 * button that does nothing is still the honest shape of the page it will be.
 */
export function Header({ current }: { current?: 'home' | 'gap' | 'about' }) {
  return (
    <>
      <div className="proto">
        אתר בבנייה · הנתונים המוצגים כאן <b>להמחשה בלבד</b> ואינם נתונים מאומתים
      </div>
      <header className="top">
        <div className="brand">
          <span className="name">היום שאחרי</span>
          <span className="tag">מה נכשל, ומה נעשה מאז</span>
        </div>
        <nav className="main" aria-label="ראשי">
          <Link href="/" {...(current === 'home' ? { 'aria-current': 'page' as const } : {})}>
            הכשלים
          </Link>
          <Link href="/gap/" {...(current === 'gap' ? { 'aria-current': 'page' as const } : {})}>
            הפער
          </Link>
          <span className="navsep" aria-hidden="true" />
          <Link href="/about/" className="sec" {...(current === 'about' ? { 'aria-current': 'page' as const } : {})}>
            על הפרויקט
          </Link>
        </nav>
        <button className="signin" disabled>כניסה · בקרוב</button>
      </header>
    </>
  );
}
