import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '@/app/components/Header';
import { GapChart } from '@/app/components/GapChart';
import { taxonomy, visibleIncidents, stageOf } from '@/lib/data';

export const metadata: Metadata = {
  title: 'הפער',
  description: 'מה המוסדות מדווחים, לעומת מה שהציבור מדרג.',
  alternates: { canonical: '/gap/' },
};

/**
 * The gap: what the institutions report against what the public makes of it.
 * The page exists now with its frame and its explanation, and fills in when
 * voting opens - the distance between the two readings is the point of the
 * project, so the page says plainly what it is waiting for.
 */
export default function GapPage() {
  const eligible = visibleIncidents.filter((i) => stageOf(i) >= 3).length;

  return (
    <>
      <Header current="gap" />
      <div className="wrap">
        <section className="view active">
          <div className="pagehead">
            <h2>הפער</h2>
            <span className="sub">מה המוסדות מדווחים, לעומת מה שהציבור מדרג</span>
          </div>
          <div className="gapwrap">
            <GapChart stages={taxonomy.stages} />
            <div className="panel">
              <h3>איך לקרוא</h3>
              <div style={{ padding: '14px 16px', fontSize: '14.5px', color: 'var(--text-2)' }}>
                <p style={{ margin: '0 0 10px' }}>
                  רק כשלים שיש להם תוכנית, יישום או אימות. ימינה: שלב גבוה יותר לפי המקורות.
                  למעלה: הציבור מדרג שהמענה טוב יותר (1–5).
                </p>
                <p style={{ margin: '0 0 10px' }}>
                  האזור המודגש — <b style={{ color: 'var(--accent)' }}>דווח כמיושם, אבל הציבור מדרג נמוך</b> — הוא הסיפור.
                </p>
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: '13px' }}>
                  הציבור לא קובע את השלב. הוא מדרג את המענה שהשלב מציע.
                </p>
              </div>
              <h3>הגרף ממתין להצבעה</h3>
              <div style={{ padding: '14px 16px', fontSize: '14.5px', color: 'var(--text-2)' }}>
                <p style={{ margin: '0 0 10px' }}>
                  הציר האופקי כבר קיים: הוא נקרא מהמקורות, ו־{eligible} כשלים הגיעו לשלב שבו יש
                  מה לדרג. הציר האנכי הוא הדירוג של הציבור, וההצבעה עוד לא נפתחה — לכן אין עדיין
                  נקודות.
                </p>
                <p style={{ margin: '0 0 10px' }}>
                  ההצבעה תיפתח אחרי ההשקה, עם אימות טלפוני. מרגע שתיפתח, כל כשל שהציבור דירג
                  יופיע כאן, והמרחק בין מה שדווח למה שמרגישים בשטח יהיה גלוי במבט אחד.
                </p>
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: '13px' }}>
                  עד אז אפשר לראות את השלבים עצמם ב<Link href="/">מפת הכשלים</Link>, ואת
                  המקורות שמאחורי כל שלב בעמוד הכשל.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
