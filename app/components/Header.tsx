import Link from 'next/link';
import { hasUnsourcedData } from '@/lib/data';

/**
 * The prototype's header.top, unchanged in structure. The sign-in button is
 * present but inert until Phase 5: the launch build has no accounts, and a
 * button that does nothing is still the honest shape of the page it will be.
 */
export function Header({ current }: { current?: 'home' | 'gap' | 'about' }) {
  return (
    <>
      {hasUnsourcedData && (
        <div className="proto">
          בנייה · חלק מהכשלים בבנייה זו <b>עדיין לא קושרו למקורות</b> ואינם מתפרסמים
        </div>
      )}
      <header className="top">
        {/* The name is the way home, as it is on every site a reader has used. */}
        <Link className="brand" href="/">
          <span className="name">היום שאחרי</span>
          <span className="tag">מה נכשל, ומה נעשה מאז</span>
        </Link>
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
